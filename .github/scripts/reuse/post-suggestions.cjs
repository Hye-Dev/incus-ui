// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

// Edit contributor-facing wording here. Keep machine identifiers in the logic below.
const language = {
  missingSignoff: 'Header suggestions are withheld until a commit has a matching DCO sign-off.',
  multipleIdentities: 'Header suggestions are withheld because this PR has multiple certified contributor identities; copyright must be attributed per file.',
  unverifiedIdentity: 'Header suggestions could not be generated because the contributor identity could not be verified.',
  identityError: (error) => `Could not resolve a contributor identity for header suggestions: ${error}`,
  listCommentsError: (error) => `Could not list existing review comments: ${error}`,
  postSuggestionError: (filePath, error) => `Could not post header suggestion for ${filePath}: ${error}`,
};

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Best-effort suggestions never change the compliance verdict.
module.exports = async ({
  github, core, owner, repo, issue_number, headSha, artifactDir,
  findings, differentialPaths, affectedPaths, isActionsBotComment, MAX_BLOCK_LENGTH,
}) => {
  function suggestionKey(filePath) {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }

  function hasSuggestionFenceConflict(value) {
    return /(^|\n)[ \t]{0,3}`{3,}/.test(value) || value.length > MAX_BLOCK_LENGTH;
  }

  // Draft one-click fixes for missing copyright information.
  // reuse-scan.yml already ran `reuse annotate` with a placeholder
  // identity and uploaded the resulting diff as inert data. Here we
  // substitute the PR's real DCO-certified identity (from its own
  // Signed-off-by trailers) and turn the relevant hunks into GitHub
  // suggested-change review comments. Entirely best-effort: any
  // failure here just means no suggestion is posted, it never
  // affects `passed` or the commit status computed above.
  const IDENTITY_PLACEHOLDER = '@@REUSE_SUGGEST_IDENTITY@@';
  const suggestions = []; // { path, anchorLine, body: string[], inserted: string[] }
  const sidecarFiles = []; // { path, content }
  const fallbackHeaderSuggestions = []; // { path, content }
  const fallbackSuggestionPaths = new Set();
  let postedSuggestionCount = 0;
  let identitySuggestionNotice = null;

  function addFallbackSuggestion(filePath, lines) {
    if (fallbackSuggestionPaths.has(filePath) || lines.length === 0) return;
    fallbackSuggestionPaths.add(filePath);
    fallbackHeaderSuggestions.push({ path: filePath, content: lines.join('\n') });
  }

  function normalizedName(value) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function normalizedEmail(value) {
    return value.trim().toLowerCase();
  }
  const hasHeaderFindings =
    findings['missingCopyright'].some((filePath) => differentialPaths.has(filePath));

  if (hasHeaderFindings) {
    // Only use DCO-certified identities: a strict Signed-off-by
    // trailer must match that commit's author or committer. Never
    // invent a copyright holder from a GitHub login. A multi-author
    // PR is intentionally left for manual per-file attribution.
    let identityLine = null;
    try {
      const commits = await github.paginate(github.rest.pulls.listCommits, {
        owner, repo, pull_number: issue_number, per_page: 100,
      });
      const verifiedIdentities = new Map();
      for (const commit of commits) {
        if (commit.parents.length > 1) continue;
        const identities = [commit.commit.author, commit.commit.committer]
          .filter((identity) => identity?.name && identity?.email);
        const trailers = [...commit.commit.message.matchAll(
          /^Signed-off-by:[ \t]*([^<>\r\n]+?)[ \t]*<([^<>\r\n]+)>[ \t]*$/gmi
        )];
        for (const trailer of trailers) {
          const name = trailer[1].trim();
          const email = trailer[2].trim();
          const matchesCommit = identities.some((identity) =>
            normalizedName(name) === normalizedName(identity.name) &&
            normalizedEmail(email) === normalizedEmail(identity.email)
          );
          if (matchesCommit) {
            verifiedIdentities.set(
              `${normalizedName(name)}\0${normalizedEmail(email)}`,
              { name, email },
            );
          }
        }
      }
      if (verifiedIdentities.size === 1) {
        const [{ name, email }] = verifiedIdentities.values();
        identityLine = `${new Date().getFullYear()} ${name} <${email}>`;
      } else if (verifiedIdentities.size === 0) {
        identitySuggestionNotice = language.missingSignoff;
      } else {
        identitySuggestionNotice = language.multipleIdentities;
      }
    } catch (err) {
      core.warning(language.identityError(err.message));
      identitySuggestionNotice = language.unverifiedIdentity;
    }

    // Parses `git diff --cached` output into per-file hunks. Only
    // needs to handle what `reuse annotate` actually produces:
    // pure insertions (no removed lines), so this is intentionally
    // not a general-purpose diff parser.
    function parseAnnotateDiff(text) {
      const files = [];
      for (const block of text.split(/^diff --git /m).slice(1)) {
        const pathMatch = block.match(/^a\/.+? b\/(.+)$/m);
        if (!pathMatch) continue;
        const isNewFile = /^new file mode/m.test(block);
        const parts = block.split(/^(@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@.*)$/m);
        const hunks = [];
        for (let i = 1; i < parts.length; i += 2) {
          const hm = parts[i].match(/^@@ -(\d+)/);
          let oldLineNo = Number(hm[1]);
          // The header match doesn't consume its trailing newline,
          // so the hunk body always starts with one — strip it,
          // else split() leaves a phantom empty line at index 0
          // and every anchor line number is off by one.
          const rawLines = (parts[i + 1] || '').replace(/^\n/, '').split('\n');
          if (rawLines[rawLines.length - 1] === '') rawLines.pop();
          const lines = [];
          for (const raw of rawLines) {
            if (raw.startsWith('\\')) continue; // "\ No newline at end of file"
            if (raw.startsWith('+')) lines.push({ type: 'add', text: raw.slice(1) });
            else if (raw.startsWith('-')) lines.push({ type: 'remove', text: raw.slice(1), oldLineNo: oldLineNo++ });
            else lines.push({ type: 'context', text: raw.slice(1), oldLineNo: oldLineNo++ });
          }
          hunks.push(lines);
        }
        files.push({ path: pathMatch[1], isNewFile, hunks });
      }
      return files;
    }

    // A GitHub suggestion replaces an existing line, so inserted
    // text needs one adjacent, untouched context line to anchor
    // on. Only handles a single clean insertion per hunk — any
    // hunk with removals, or more than one add-run, is left for
    // the text-only comment instead of risking a bad suggestion.
    function findInsertion(hunks, identity) {
      if (hunks.length !== 1) return null;
      const lines = hunks[0];
      if (lines.some((l) => l.type === 'remove')) return null;
      const addStart = lines.findIndex((l) => l.type === 'add');
      if (addStart === -1) return null;
      let addEnd = addStart;
      while (addEnd + 1 < lines.length && lines[addEnd + 1].type === 'add') addEnd++;
      if (lines.slice(addEnd + 1).some((l) => l.type === 'add')) return null;
      const addLines = lines.slice(addStart, addEnd + 1)
        .map((line) => line.text.replaceAll(IDENTITY_PLACEHOLDER, identity));
      const following = lines[addEnd + 1];
      const preceding = lines[addStart - 1];
      if (following && following.type === 'context') {
        return { anchorLine: following.oldLineNo, body: [...addLines, following.text], inserted: addLines };
      }
      if (preceding && preceding.type === 'context') {
        return { anchorLine: preceding.oldLineNo, body: [preceding.text, ...addLines], inserted: addLines };
      }
      return null;
    }

    if (identityLine) {
      let annotateDiffText = null;
      try {
        annotateDiffText = fs.readFileSync(path.join(artifactDir, 'annotate.diff'), 'utf8');
      } catch {
        // scan.yml may not have produced a diff (nothing to
        // annotate, or the step failed) — not fatal, just no
        // suggestions this run.
      }
      if (annotateDiffText) {
        const excludedPaths = new Set([
          ...findings['readErrors'],
        ]);
        for (const file of parseAnnotateDiff(annotateDiffText)) {
          const isSidecar = file.isNewFile && file.path.endsWith('.license');
          // A sidecar's own path never appears in changedFiles —
          // it doesn't exist in the real PR — so check the source
          // file it's standing in for instead.
          const sourcePath = isSidecar ? file.path.slice(0, -'.license'.length) : file.path;
          if (!affectedPaths.has(sourcePath) || !differentialPaths.has(sourcePath) || excludedPaths.has(sourcePath)) continue;
          if (isSidecar) {
            const content = file.hunks
              .flatMap((h) => h.filter((l) => l.type === 'add').map((l) => l.text))
              .join('\n')
              .replaceAll(IDENTITY_PLACEHOLDER, identityLine);
            sidecarFiles.push({ path: file.path, content });
            continue;
          }
          const insertedLines = file.hunks
            .flatMap((hunk) => hunk.filter((line) => line.type === 'add').map((line) => line.text))
            .map((line) => line.replaceAll(IDENTITY_PLACEHOLDER, identityLine));
          if (file.isNewFile) {
            addFallbackSuggestion(file.path, insertedLines);
            continue;
          }
          const insertion = findInsertion(file.hunks, identityLine);
          if (!insertion) {
            addFallbackSuggestion(file.path, insertedLines);
            continue;
          }
          suggestions.push({
            path: file.path,
            anchorLine: insertion.anchorLine,
            body: insertion.body,
            inserted: insertion.inserted,
          });
        }
      }
    }

    if (suggestions.length > 0) {
      let existingReviewComments = [];
      try {
        existingReviewComments = await github.paginate(github.rest.pulls.listReviewComments, {
          owner, repo, pull_number: issue_number, per_page: 100,
        });
      } catch (err) {
        core.warning(language.listCommentsError(err.message));
      }
      const alreadySuggested = new Set(
        existingReviewComments
          .filter((c) => isActionsBotComment(c) && c.commit_id === headSha)
          .map((c) => c.body.match(/<!-- reuse-suggest:([a-f0-9]{64}) -->/))
          .filter(Boolean)
          .map((m) => m[1])
      );
      for (const s of suggestions) {
        const key = suggestionKey(s.path);
        const suggestionBody = s.body.join('\n');
        if (alreadySuggested.has(key)) {
          postedSuggestionCount++;
          continue;
        }
        if (hasSuggestionFenceConflict(suggestionBody)) {
          addFallbackSuggestion(s.path, s.inserted);
          continue;
        }
        try {
          await github.rest.pulls.createReviewComment({
            owner, repo, pull_number: issue_number, commit_id: headSha,
            path: s.path, line: s.anchorLine, side: 'RIGHT',
            body: `<!-- reuse-suggest:${key} -->\n\`\`\`suggestion\n${suggestionBody}\n\`\`\``,
          });
          postedSuggestionCount++;
        } catch (err) {
          core.warning(language.postSuggestionError(s.path, err.message));
          addFallbackSuggestion(s.path, s.inserted);
        }
      }
    }
  }

  return { sidecarFiles, fallbackHeaderSuggestions, postedSuggestionCount, identitySuggestionNotice };
};
