// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

// Edit contributor-facing wording here. Keep machine identifiers in the logic below.
const language = {
  invalidMetadata: 'The trusted caller supplied invalid PR metadata.',
  oversizedHeading: '### ⚠️ REUSE report was too large to display safely',
  stale: 'Skipping a stale REUSE report because the PR head changed or the PR closed.',
  invalidReport: 'The scan report has an invalid shape.',
  readErrorStatus: 'Could not read the scan report — check the workflow run logs.',
  errorHeading: '### ⚠️ REUSE Specification compliance check could not run',
  passed: 'REUSE Specification compliance check passed',
  failed: 'REUSE compliance or license policy check failed. See PR comment',
  failureHeading: '### ❌ REUSE compliance or license policy check failed',
  prohibitedIntroduction: (url) => `The following licenses are expressly prohibited by the [contribution guidelines](${url}#1-confirm-the-license-is-acceptable), even when their license text is present in LICENSES/. Remove or replace the affected material:`,
  successHeading: '### ✅ REUSE Specification compliance check passed',
  differentialHeading: '### Differential licenses',
  differentialIntroduction: 'The following non-Apache-2.0 licenses occur in files covered by this check:',
  existingLicenses: (licenses) => `License texts already present before this PR: ${licenses}.`,
  newLicenses: (licenses) => `⚠️ New, changed, or missing license texts require maintainer review: ${licenses}. Confirm these licenses are acceptable before merging. This advisory does not itself block the check.`,
  shareAlikeLicenses: (licenses) => `⚠️ ${licenses} may carry ongoing per-file share-alike obligations. Modifications to the covered files may need to remain under the same license when distributed. Review these obligations for every use; this advisory does not itself block the check.`,
  customLicenses: (licenses) => `🔍 Custom licenses require manual review: ${licenses}. A maintainer must read and approve the actual license text, even if the identifier has appeared in this repository before. This advisory does not itself block the check.`,
  fallbackSuggestions: 'The following header suggestion(s) could not be attached to a changed line. Add the shown content at the beginning of each file:',
  sidecarSuggestions: 'The following file(s) need a `.license` sidecar (their type doesn\'t support inline comments) — create each with exactly this content:',
  postedSuggestions: '📝 Suggested fixes for the missing header(s) above have been posted as review comments on this PR — click **Commit suggestion** to accept one, or edit the name first if this isn\'t your personal copyright.',
  oversizedLog: (limit) => `REUSE comment exceeded ${limit} characters and was replaced with a bounded summary.`,
  workflowLink: (url) => `See the [workflow run](${url}) for the status and scan artifact.`,
  readError: (error) => `Reading the scan report failed (${error}). A maintainer needs to check the workflow run logs. This isn't something a contributor can fix by pushing code.`,
  findingsIntroduction: (url) => `The following files aren't REUSE-compliant (see the [codebase contribution guidelines](${url}) for licensing metadata and license files):`,
  differentialSummary: (licenses) => `Differential licenses: ${licenses}`,
  commentError: (error) => `Could not update the REUSE comment; the published compliance result is unchanged: ${error}`,
  findings: {
    missingCopyright: 'missing a copyright line',
    missingLicensing: 'missing SPDX licensing info entirely',
    readErrors: 'could not be read by the REUSE tool',
    missingLicenseFiles: 'referenced a license with no file in LICENSES/',
    deprecatedLicenses: 'used a deprecated SPDX license identifier',
    badLicenses: 'has an unrecognized license file in LICENSES/',
    licensesWithoutExtension: 'has a LICENSES/ file missing its extension',
    invalidExpressions: 'has a malformed SPDX license expression',
  },
};

// These identifiers are prohibited independently of REUSE compliance and
// LICENSES/ contents. Include legacy SPDX identifiers as well as current ones.
const PROHIBITED_LICENSES = new Set([
  'GPL-1.0-only', 'GPL-1.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'GPL-1.0', 'GPL-1.0+', 'GPL-2.0', 'GPL-2.0+', 'GPL-3.0', 'GPL-3.0+',
  'LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1-only', 'LGPL-2.1-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
  'LGPL-2.0', 'LGPL-2.0+', 'LGPL-2.1', 'LGPL-2.1+', 'LGPL-3.0', 'LGPL-3.0+',
  'AGPL-1.0-only', 'AGPL-1.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
  'AGPL-1.0', 'AGPL-1.0+', 'AGPL-3.0', 'AGPL-3.0+',
]);

const SHARE_ALIKE_LICENSES = new Set([
  'MPL-1.0', 'MPL-1.1', 'MPL-2.0',
  'CDDL-1.0', 'CDDL-1.1',
  'EPL-1.0', 'EPL-2.0',
]);

module.exports = async ({ github, context, core }) => {
  const fs = require('fs');
  const path = require('path');
  let disclosedLicenses = [];
  const marker = '<!-- reuse-check-comment -->';
  const MAX_COMMENT_LENGTH = 60000;
  const MAX_DISPLAY_LENGTH = 500;
  const MAX_BLOCK_LENGTH = 12000;
  const ACTIONS_BOT = Object.freeze({
    id: 41898282,
    login: 'github-actions[bot]',
    type: 'Bot',
  });
  const { owner, repo } = context.repo;
  const prNumber = Number(process.env.PR_NUMBER);
  const headSha = process.env.HEAD_SHA;
  if (!Number.isInteger(prNumber) || prNumber < 1 || !/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error(language.invalidMetadata);
  }
  const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`;
  const defaultBranch = context.payload.repository.default_branch;
  const guidelinesUrl = `https://github.com/${owner}/${repo}/blob/${defaultBranch}/docs/contributing/code/differential-part-guidelines.md`;
  const artifactDir = process.env.ARTIFACT_DIR;

  function escapedScalar(value, maxLength = MAX_DISPLAY_LENGTH) {
    const escaped = String(value).replace(/[\u0000-\u001f\u007f`]/g, (character) => {
      if (character === '\n') return '\\n';
      if (character === '\r') return '\\r';
      if (character === '\t') return '\\t';
      if (character === '`') return '\\x60';
      return `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`;
    });
    return escaped.length > maxLength ? `${escaped.slice(0, maxLength)}…` : escaped;
  }

  function inlineCode(value, maxLength) {
    return `\`${escapedScalar(value, maxLength)}\``;
  }

  function fencedBlock(value) {
    const text = String(value).replace(/\r\n?/g, '\n');
    const longestRun = Math.max(2, ...(text.match(/`+/g) || []).map((run) => run.length));
    const fence = '`'.repeat(longestRun + 1);
    const bounded = text.length > MAX_BLOCK_LENGTH
      ? `${text.slice(0, MAX_BLOCK_LENGTH)}\n… truncated …`
      : text;
    return `${fence}\n${bounded}\n${fence}`;
  }

  function isActionsBotComment(comment) {
    return comment.user?.id === ACTIONS_BOT.id &&
      comment.user?.login === ACTIONS_BOT.login &&
      comment.user?.type === ACTIONS_BOT.type;
  }

  function boundedComment(body) {
    if (body.length <= MAX_COMMENT_LENGTH) return body;
    core.warning(language.oversizedLog(MAX_COMMENT_LENGTH));
    return [
      marker,
      language.oversizedHeading,
      '',
      language.differentialSummary(disclosedLicenses.map((id) => inlineCode(id)).join(', ')),
      '',
      language.workflowLink(runUrl),
    ].join('\n');
  }

  // Bind the caller's event values back to the live PR. A superseded
  // run must never comment on or set a status for the new head.
  const { data: boundPr } = await github.rest.pulls.get({
    owner, repo, pull_number: prNumber,
  });
  if (
    boundPr.state !== 'open' ||
    boundPr.base.repo.full_name !== `${owner}/${repo}` ||
    boundPr.head.sha !== headSha
  ) {
    core.notice(language.stale);
    return;
  }

  async function setStatus(state, description) {
    await github.rest.repos.createCommitStatus({
      owner, repo, sha: headSha, state, context: 'REUSE Compliance', description, target_url: runUrl,
    });
  }

  async function commentSafely(action) {
    try {
      await action();
    } catch (err) {
      core.warning(language.commentError(err.message));
    }
  }

  async function upsertComment(issue_number, body) {
    body = boundedComment(body);
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner, repo, issue_number, per_page: 100,
    });
    const existing = comments.find((c) =>
      isActionsBotComment(c) && c.body.includes(marker)
    );
    if (existing) {
      await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    } else {
      await github.rest.issues.createComment({ owner, repo, issue_number, body });
    }
  }

  async function clearOrLeaveSilent(issue_number) {
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner, repo, issue_number, per_page: 100,
    });
    const existing = comments.find((c) =>
      isActionsBotComment(c) && c.body.includes(marker)
    );
    if (existing) {
      await github.rest.issues.updateComment({
        owner, repo, comment_id: existing.id,
        body: `${marker}\n${language.successHeading}.`,
      });
    }
  }

  // Read what reuse-scan.yml captured.
  let report;
  try {
    report = JSON.parse(fs.readFileSync(path.join(artifactDir, 'reuse-lint.json'), 'utf8'));
    const requiredFindingArrays = [
      'bad_licenses', 'deprecated_licenses', 'licenses_without_extension',
      'missing_copyright_info', 'missing_licenses', 'missing_licensing_info',
      'read_errors', 'unused_licenses',
    ];
    const validFiles = Array.isArray(report.files) && report.files.every((file) =>
      typeof file.path === 'string' &&
      Array.isArray(file.spdx_expressions) &&
      file.spdx_expressions.every((expression) =>
        typeof expression.value === 'string' && typeof expression.is_valid === 'boolean'
      )
    );
    const validFindings =
      typeof report.non_compliant === 'object' &&
      report.non_compliant !== null &&
      requiredFindingArrays.every((key) =>
        Array.isArray(report.non_compliant[key]) &&
        report.non_compliant[key].every((value) => typeof value === 'string')
      );
    if (!validFiles || !validFindings) {
      throw new Error(language.invalidReport);
    }
  } catch (err) {
    await setStatus('error', language.readErrorStatus);
    await commentSafely(() => upsertComment(prNumber, [
      marker,
      language.errorHeading,
      '',
      language.readError(inlineCode(err.message)),
    ].join('\n')));
    return;
  }
  const issue_number = prNumber;

  // Fetch changed files (PRs commonly exceed 100 — must paginate).
  const changedFiles = await github.paginate(github.rest.pulls.listFiles, {
    owner, repo, pull_number: prNumber, per_page: 100,
  });
  const changedPaths = new Set(changedFiles.map((f) => f.filename));
  // Metadata changes can alter licensing on files with no content diff.
  // Recheck the full report in that case, including deleted metadata.
  const metadataChanged = [...changedPaths].some((filePath) =>
    path.posix.basename(filePath) === 'REUSE.toml' ||
    filePath.endsWith('.license') || filePath === '.reuse/dep5' ||
    path.posix.basename(filePath) === '.gitignore' || filePath.startsWith('LICENSES/')
  );
  const affectedPaths = metadataChanged
    ? new Set([...changedPaths, ...report.files.map((file) => file.path)])
    : changedPaths;

  const changedLicenseIds = new Set(
    [...changedPaths]
      .filter((filePath) => path.posix.dirname(filePath) === 'LICENSES')
      .map((filePath) => path.posix.parse(filePath).name)
  );

  // Index files[] by path for cross-referencing.
  const filesByPath = new Map(report.files.map((f) => [f.path, f]));

  // Tokenize an SPDX expression into candidate identifiers.
  // Note: `WITH <exception>` clauses tokenize the exception id separately
  // (e.g. Classpath-exception-2.0) so exceptions are also disclosed.
  function tokenize(expr) {
    return expr
      .replace(/[()]/g, ' ')
      .split(/\s+/)
      .filter((t) => t && t !== 'AND' && t !== 'OR' && t !== 'WITH');
  }

  // Collect licenses declared by affected files.
  const referencedLicenseIds = new Set();
  const changedFileLicenses = new Map(); // identifier -> Set<path>
  for (const filePath of affectedPaths) {
    const f = filesByPath.get(filePath);
    if (!f) continue;
    for (const expr of f.spdx_expressions) {
      for (const id of tokenize(expr.value)) {
        referencedLicenseIds.add(id);
        if (id === 'Apache-2.0') continue;
        if (!changedFileLicenses.has(id)) changedFileLicenses.set(id, new Set());
        changedFileLicenses.get(id).add(filePath);
      }
    }
  }

  // REUSE checks license-file presence and SPDX validity. Disclose every
  // non-Apache identifier, including custom licenses and exceptions.
  const differentialFound = [...changedFileLicenses].map(([id, paths]) => ({ id, paths: [...paths] }));
  disclosedLicenses = differentialFound.map((entry) => entry.id);
  const differentialPaths = new Set(differentialFound.flatMap((entry) => entry.paths));
  const prohibitedFound = differentialFound.filter((entry) => PROHIBITED_LICENSES.has(entry.id));
  const prohibitedPaths = new Set(prohibitedFound.flatMap((entry) => entry.paths));

  // Attribute REUSE-spec non_compliant findings to this PR.
  // The JSON's arrays are NOT uniformly keyed, some are file paths,
  // some are SPDX identifiers scoped to LICENSES/, so each needs its
  // own attribution rule rather than a blind intersection against
  // changedPaths. unused_licenses is repo-wide hygiene only and never
  // attributed/never fails.
  const nc = report.non_compliant;
  const touchesLicenseFileOrIsReferenced = (id) =>
    metadataChanged || changedLicenseIds.has(id) || referencedLicenseIds.has(id);
  const findings = {
    'missingCopyright': nc.missing_copyright_info.filter((p) => metadataChanged || affectedPaths.has(p)),
    'missingLicensing': nc.missing_licensing_info.filter((p) => metadataChanged || affectedPaths.has(p)),
    'readErrors': nc.read_errors.filter((p) => metadataChanged || affectedPaths.has(p)),
    'missingLicenseFiles': nc.missing_licenses.filter(touchesLicenseFileOrIsReferenced),
    'deprecatedLicenses': nc.deprecated_licenses.filter(touchesLicenseFileOrIsReferenced),
    'badLicenses': nc.bad_licenses.filter(touchesLicenseFileOrIsReferenced),
    'licensesWithoutExtension': nc.licenses_without_extension.filter(touchesLicenseFileOrIsReferenced),
  };
  const invalidExpressions = [...affectedPaths]
    .map((p) => filesByPath.get(p))
    .filter(Boolean)
    .flatMap((f) => f.spdx_expressions
      .filter((e) => !e.is_valid)
      .map((e) => `${f.path} (${e.value})`));
  if (invalidExpressions.length > 0) {
    findings['invalidExpressions'] = invalidExpressions;
  }

  const reuseSpecFailed = Object.values(findings).some((arr) => arr.length > 0);
  const passed = !reuseSpecFailed && prohibitedFound.length === 0;
  await setStatus(
    passed ? 'success' : 'failure',
    passed ? language.passed : language.failed
  );

  const { sidecarFiles, fallbackHeaderSuggestions, postedSuggestionCount, identitySuggestionNotice } =
    await require('./post-suggestions.cjs')({
      github, core, owner, repo, issue_number, headSha, artifactDir,
      findings, differentialPaths: new Set([...differentialPaths].filter((filePath) => !prohibitedPaths.has(filePath))),
      affectedPaths, isActionsBotComment, MAX_BLOCK_LENGTH,
    });

  // Build and post/update the PR comment.
  if (passed && differentialFound.length === 0) {
    await commentSafely(() => clearOrLeaveSilent(issue_number));
    return;
  }

  const lines = [marker];
  const licenseLine = (entry) =>
    `- ${inlineCode(entry.id)}: ${entry.paths.map((filePath) => inlineCode(filePath)).join(', ')}`;

  if (!passed) {
    lines.push(language.failureHeading, '');
    if (prohibitedFound.length > 0) {
      lines.push(language.prohibitedIntroduction(guidelinesUrl), '', ...prohibitedFound.map(licenseLine), '');
    }
    if (reuseSpecFailed) {
      lines.push(
        language.findingsIntroduction(guidelinesUrl),
        ''
      );
      for (const [reason, items] of Object.entries(findings)) {
        if (items.length === 0) continue;
        lines.push(`- **${language.findings[reason]}**: ${items.map((item) => inlineCode(item)).join(', ')}`);
      }
      lines.push('');
    }
    if (identitySuggestionNotice) {
      lines.push(`👤 ${identitySuggestionNotice}`, '');
    }
    if (postedSuggestionCount > 0) {
      lines.push(
        language.postedSuggestions,
        ''
      );
    }
    if (fallbackHeaderSuggestions.length > 0) {
      lines.push(
        language.fallbackSuggestions,
        ''
      );
      for (const suggestion of fallbackHeaderSuggestions) {
        lines.push(`**${inlineCode(suggestion.path)}**`, fencedBlock(suggestion.content), '');
      }
    }
    if (sidecarFiles.length > 0) {
      lines.push(
        language.sidecarSuggestions,
        ''
      );
      for (const sc of sidecarFiles) {
        lines.push(`**${inlineCode(sc.path)}**`, fencedBlock(sc.content), '');
      }
    }
  } else {
    lines.push(language.successHeading, '');
  }

  if (differentialFound.length > 0) {
    lines.push(
      language.differentialHeading,
      '',
      language.differentialIntroduction,
      '',
      ...differentialFound.map(licenseLine),
      ''
    );
    const existing = [];
    const newOrChanged = [];
    const shareAlike = [];
    const custom = [];
    for (const { id } of differentialFound) {
      if (PROHIBITED_LICENSES.has(id)) continue;
      if (id.startsWith('LicenseRef-')) custom.push(id);
      else if (SHARE_ALIKE_LICENSES.has(id)) shareAlike.push(id);
      // REUSE reports absent license texts. A present text whose identifier
      // wasn't touched by this PR already existed; additions and edits both
      // merit review. Special categories always get their own advisory.
      else if (changedLicenseIds.has(id) || nc.missing_licenses.includes(id)) newOrChanged.push(id);
      else existing.push(id);
    }
    for (const [ids, message] of [
      [existing, language.existingLicenses],
      [newOrChanged, language.newLicenses],
      [shareAlike, language.shareAlikeLicenses],
      [custom, language.customLicenses],
    ]) {
      if (ids.length > 0) lines.push(message(ids.map((id) => inlineCode(id)).join(', ')), '');
    }
  }

  await commentSafely(() => upsertComment(issue_number, lines.join('\n').trimEnd()));
};
