// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

// Edit contributor-facing wording here. Keep machine identifiers in the logic below.
const language = {
  // Use HTML throughout the dropdown. The URL is escaped before interpolation.
  remediation: (dcoUrl) => `<details>
<summary>✍️ I've read &amp; am ready to certify the Developer Certificate of Origin. How do I sign off?</summary>
<p>A sign-off, in the form of a <code>Signed-off-by: [Your Full Name] &lt;[your primary email address]&gt;</code> line included in the commit message (with the bracketed fields replaced by your own identifying information, and the brackets themselves omitted), constitutes your certification of the Developer Certificate of Origin as described in <a href="${dcoUrl}">CONTRIBUTING.md</a>.</p>
<p>You must use your real personal identifying information. Make sure it matches your Git <code>user.name</code>/<code>user.email</code> config and that these are associated with your GitHub account.</p>
<p><strong>If your branch has a single commit</strong>, amend it and force-push:</p>
<pre><code>git commit --amend --signoff
git push --force-with-lease</code></pre>
<p><strong>If your branch has multiple commits</strong>, sign off all of them at once and force-push:</p>
<pre><code>git rebase HEAD~&lt;number-of-commits&gt; --signoff
git push --force-with-lease</code></pre>
<p>Replace <code>&lt;number-of-commits&gt;</code> with how many commits are in this PR (or rebase onto the base branch, e.g. <code>git rebase --signoff origin/main</code>).</p>
<p><strong>Going forward</strong>, sign off new commits as you make them:</p>
<pre><code>git commit -s -m "Your commit message"</code></pre>
<p>This adds a trailer to your commit message in the form:</p>
<pre><code>Signed-off-by: Your Name &lt;your.email@example.com&gt;</code></pre>
</details>`,
  rerun: "Once you've pushed the fix, this check will re-run automatically.",
  passed: 'All applicable PR commits have matching DCO sign-offs.',
  failed: 'One or more PR commits lack a matching DCO sign-off.',
  error: 'The DCO check could not complete. See the workflow logs.',
  stale: 'Skipping a stale DCO run because the PR head changed or the PR closed.',
  failureHeading: '### ❌ DCO Not Signed',
  failureLog: 'One or more commits do not have a matching DCO sign-off.',
  tooManyCommits: (count) => `This PR has ${count} commits, but GitHub exposes at most 250 for verification. Please reduce the commit count.`,
  incompleteCommits: (expected, actual) => `GitHub reported ${expected} commits, but only ${actual} could be retrieved. No partial DCO check is accepted.`,
  verificationError: (error) => `DCO verification could not complete: ${error}`,
  listCommentsError: (error) => `Could not list existing DCO comments: ${error}`,
  updateCommentError: (error) => `Could not update the DCO comment: ${error}`,
  postCommentError: (error) => `Could not post the DCO comment: ${error}`,
  successHeading: '### ✅ Thanks for certifying the DCO.',
  introduction: (url) => `One or more commits haven't been signed to the Developer Certificate of Origin. Please review the [Developer Certificate of Origin](${url}).`,
  missingSignoff: (sha, expected) => `- Commit ${sha} has no Signed-off-by trailer. Expected ${expected}.`,
  omittedTrailers: (count) => `; ${count} additional trailer(s) omitted`,
  mismatchedSignoff: (sha, expected, found, omitted) => `- Commit ${sha} has a Signed-off-by identity mismatch. Expected ${expected}; found ${found}${omitted}.`,
  skippedMerges: (count) => `ℹ️ ${count} merge commit(s) were excluded; all non-merge commits exposed by this PR were checked individually.`,
  omittedFailures: (count) => `- … ${count} additional failure(s) omitted; see the workflow log.`,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

module.exports = async ({ github, context, core }) => {
  const marker = '<!-- dco-check-comment -->';
  const maxCommentLength = 60000;
  const maxDisplayedTrailers = 5;
  const actionsBot = Object.freeze({
    id: 41898282,
    login: 'github-actions[bot]',
    type: 'Bot',
  });
  const { owner, repo } = context.repo;
  const issue_number = context.payload.pull_request.number;
  const eventHeadSha = context.payload.pull_request.head.sha;
  const defaultBranch = context.payload.repository.default_branch;
  const dcoUrl = `https://github.com/${owner}/${repo}/blob/${defaultBranch}/CONTRIBUTING.md#developer-certificate-of-origin`;
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;

  function escapedScalar(value, maxLength = 300) {
    const escaped = String(value).replace(/[\u0000-\u001f\u007f`]/g, (character) => {
      if (character === '\n') return '\\n';
      if (character === '\r') return '\\r';
      if (character === '\t') return '\\t';
      if (character === '`') return '\\x60';
      return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
    });
    return escaped.length > maxLength ? `${escaped.slice(0, maxLength)}…` : escaped;
  }

  function inlineCode(value) {
    return `\`${escapedScalar(value)}\``;
  }

  function isActionsBotComment(comment) {
    return comment.user?.id === actionsBot.id &&
      comment.user?.login === actionsBot.login &&
      comment.user?.type === actionsBot.type;
  }

  function normalizedName(value) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function normalizedEmail(value) {
    return value.trim().toLowerCase();
  }

  async function setStatus(state, description) {
    await github.rest.repos.createCommitStatus({
      owner, repo, sha: eventHeadSha, state,
      context: 'DCO Verification', description, target_url: runUrl,
    });
  }

  async function findExistingComment() {
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner, repo, issue_number, per_page: 100,
    });
    return comments.find((comment) =>
      isActionsBotComment(comment) && comment.body.includes(marker)
    );
  }

  function analyzeSignoff(commit) {
    const identities = [commit.commit.author, commit.commit.committer]
      .filter((identity) => identity?.name && identity?.email);
    const trailers = [...commit.commit.message.matchAll(
      /^Signed-off-by:[ \t]*([^<>\r\n]+?)[ \t]*<([^<>\r\n]+)>[ \t]*$/gmi
    )].map((match) => ({ name: match[1].trim(), email: match[2].trim() }));

    const matched = trailers.some((trailer) => identities.some((identity) =>
      normalizedName(trailer.name) === normalizedName(identity.name) &&
      normalizedEmail(trailer.email) === normalizedEmail(identity.email)
    ));
    return { matched, identities, trailers };
  }

  let passed = false;
  let failures = [];
  let skippedMergeCount = 0;
  try {
    const { data: pr } = await github.rest.pulls.get({
      owner, repo, pull_number: issue_number,
    });
    if (pr.state !== 'open' || pr.head.sha !== eventHeadSha) {
      core.notice(language.stale);
      return;
    }

    const commits = await github.paginate(github.rest.pulls.listCommits, {
      owner, repo, pull_number: issue_number, per_page: 100,
    });

    if (pr.commits > 250) {
      failures.push({
        kind: 'system',
        message: language.tooManyCommits(pr.commits),
      });
    } else if (commits.length !== pr.commits) {
      failures.push({
        kind: 'system',
        message: language.incompleteCommits(pr.commits, commits.length),
      });
    }

    for (const commit of commits) {
      if (commit.parents.length > 1) {
        skippedMergeCount++;
        continue;
      }
      const analysis = analyzeSignoff(commit);
      if (!analysis.matched) {
        failures.push({
          kind: analysis.trailers.length === 0 ? 'missing' : 'mismatch',
          sha: commit.sha.slice(0, 12),
          expected: analysis.identities.map((identity) => `${identity.name} <${identity.email}>`),
          found: analysis.trailers.slice(0, maxDisplayedTrailers)
            .map((trailer) => `${trailer.name} <${trailer.email}>`),
          omittedTrailers: Math.max(0, analysis.trailers.length - maxDisplayedTrailers),
        });
      }
    }

    passed = failures.length === 0;
    await setStatus(
      passed ? 'success' : 'failure',
      passed ? language.passed : language.failed
    );
  } catch (err) {
    await setStatus('error', language.error);
    core.setFailed(language.verificationError(err.message));
    return;
  }

  let existing;
  try {
    existing = await findExistingComment();
  } catch (err) {
    core.warning(language.listCommentsError(err.message));
  }

  if (passed) {
    if (existing) {
      try {
        await github.rest.issues.updateComment({
          owner, repo, comment_id: existing.id,
          body: `${marker}\n${language.successHeading}`,
        });
      } catch (err) {
        core.warning(language.updateCommentError(err.message));
      }
    }
    return;
  }

  const introLines = [
    marker,
    language.failureHeading,
    '',
    language.introduction(dcoUrl),
    '',
  ];
  function formatFailure(failure) {
    if (failure.kind === 'system') {
      return `- ${failure.message}`;
    }
    if (failure.kind === 'missing') {
      return language.missingSignoff(inlineCode(failure.sha), failure.expected.map(inlineCode).join(' or '));
    }
    const omitted = failure.omittedTrailers > 0
      ? language.omittedTrailers(failure.omittedTrailers)
      : '';
    return language.mismatchedSignoff(inlineCode(failure.sha), failure.expected.map(inlineCode).join(' or '), failure.found.map(inlineCode).join(', '), omitted);
  }

  const mergeLines = skippedMergeCount > 0
    ? ['', language.skippedMerges(skippedMergeCount)]
    : [];
  const remediationLines = ['', language.remediation(escapeHtml(dcoUrl)), '', language.rerun];
  const displayedFailures = [];
  for (const failure of failures) {
    const candidate = [...displayedFailures, formatFailure(failure)];
    const omittedCount = failures.length - candidate.length;
    const omissionLines = omittedCount > 0
      ? [language.omittedFailures(omittedCount)]
      : [];
    const candidateBody = [
      ...introLines,
      ...candidate,
      ...omissionLines,
      ...mergeLines,
      ...remediationLines,
    ].join('\n');
    if (candidateBody.length > maxCommentLength) break;
    displayedFailures.push(candidate[candidate.length - 1]);
  }
  const omittedFailureCount = failures.length - displayedFailures.length;
  const body = [
    ...introLines,
    ...displayedFailures,
    ...(omittedFailureCount > 0
      ? [language.omittedFailures(omittedFailureCount)]
      : []),
    ...mergeLines,
    ...remediationLines,
  ].join('\n');

  try {
    if (existing) {
      await github.rest.issues.updateComment({
        owner, repo, comment_id: existing.id, body,
      });
    } else {
      await github.rest.issues.createComment({
        owner, repo, issue_number, body,
      });
    }
  } catch (err) {
    core.warning(language.postCommentError(err.message));
  }
  core.setFailed(language.failureLog);
};
