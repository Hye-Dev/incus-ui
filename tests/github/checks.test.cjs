// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

// REUSE-IgnoreStart
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const reportReuse = require('../../.github/scripts/reuse/report.cjs');
const checkDco = require('../../.github/scripts/dco.cjs');

const headSha = 'a'.repeat(40);
const identity = { name: 'Test Contributor', email: 'test@example.com' };
const signedCommit = {
  sha: headSha,
  parents: [{}],
  commit: {
    author: identity, committer: identity,
    message: 'docs: example\n\nSigned-off-by: Test Contributor <test@example.com>',
  },
};
const bot = { id: 41898282, login: 'github-actions[bot]', type: 'Bot' };

function harness({ changed = ['example.txt'], commits = [signedCommit], comments = [], stale = false, commentFailure } = {}) {
  const calls = { statuses: [], comments: [], suggestions: [], failures: [], warnings: [], commitReads: 0 };
  const pr = {
    number: 1, state: 'open', commits: commits.length,
    head: { sha: stale ? 'b'.repeat(40) : headSha },
    base: { repo: { full_name: 'owner/repo' } },
  };
  const github = {
    rest: {
      pulls: {
        get: async () => ({ data: pr }),
        listFiles: 'files', listCommits: 'commits', listReviewComments: 'reviews',
        createReviewComment: async (data) => calls.suggestions.push(data),
      },
      issues: {
        listComments: 'comments',
        createComment: async (data) => {
          if (commentFailure === 'create') throw new Error('Comment API unavailable');
          calls.comments.push(data);
        },
        updateComment: async (data) => {
          if (commentFailure === 'update') throw new Error('Comment API unavailable');
          calls.comments.push(data);
        },
      },
      repos: { createCommitStatus: async (data) => calls.statuses.push(data) },
    },
    paginate: async (endpoint) => {
      if (endpoint === 'files') return changed.map((filename) => ({ filename }));
      if (endpoint === 'commits') { calls.commitReads++; return commits; }
      if (endpoint === 'comments') {
        if (commentFailure === 'list') throw new Error('Comment API unavailable');
        return comments;
      }
      if (endpoint === 'reviews') return [];
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    },
  };
  return {
    calls, github,
    context: {
      repo: { owner: 'owner', repo: 'repo' }, runId: 1,
      payload: { repository: { default_branch: 'main' }, pull_request: { ...pr, head: { sha: headSha } } },
    },
    core: { notice() {}, warning(message) { calls.warnings.push(message); }, setFailed(message) { calls.failures.push(message); } },
  };
}

function file(filePath, expression = 'Apache-2.0', valid = true) {
  return { path: filePath, spdx_expressions: [{ value: expression, is_valid: valid }] };
}

async function runReport(t, { files = [file('example.txt')], findings = {}, diff = '', malformed = false, ...options } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'incus-workflow-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const keys = ['bad_licenses', 'deprecated_licenses', 'licenses_without_extension', 'missing_copyright_info',
    'missing_licenses', 'missing_licensing_info', 'read_errors', 'unused_licenses'];
  fs.writeFileSync(path.join(temp, 'reuse-lint.json'), malformed ? '{}' : JSON.stringify({
    files, non_compliant: { ...Object.fromEntries(keys.map((key) => [key, []])), ...findings },
  }));
  fs.writeFileSync(path.join(temp, 'annotate.diff'), diff);
  const previous = { ...process.env };
  Object.assign(process.env, { ARTIFACT_DIR: temp, PR_NUMBER: '1', HEAD_SHA: headSha });
  const h = harness(options);
  try { await reportReuse(h); } finally {
    for (const key of ['ARTIFACT_DIR', 'PR_NUMBER', 'HEAD_SHA']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
  return h.calls;
}

test('Apache-only PR passes silently without suggestions', async (t) => {
  const calls = await runReport(t);
  assert.equal(calls.statuses.at(-1).state, 'success');
  assert.deepEqual(calls.comments, []);
  assert.deepEqual(calls.suggestions, []);
  assert.equal(calls.commitReads, 0);
});

test('non-prohibited differential licenses pass and are disclosed', async (t) => {
  const ids = ['MIT', 'MPL-2.0', 'CC-BY-SA-4.0', 'LicenseRef-Example'];
  const files = ids.map((id, index) => file(`file-${index}.txt`, id));
  const calls = await runReport(t, { files, changed: files.map((f) => f.path) });
  assert.equal(calls.statuses.at(-1).state, 'success');
  for (const id of ids) assert.ok(calls.comments[0].body.includes(id));
  assert.doesNotMatch(calls.comments[0].body, /expressly prohibited/);
});

for (const id of ['MPL-2.0', 'CDDL-1.0', 'EPL-2.0']) {
  test(`${id} receives a share-alike advisory without blocking`, async (t) => {
    const calls = await runReport(t, { files: [file('example.txt', id)] });
    assert.equal(calls.statuses.at(-1).state, 'success');
    assert.match(calls.comments[0].body, /ongoing per-file share-alike obligations/);
    assert.match(calls.comments[0].body, /Review these obligations for every use/);
  });
}

test('custom licenses always require a manual-review advisory', async (t) => {
  const calls = await runReport(t, { files: [file('example.txt', 'LicenseRef-Example')] });
  assert.equal(calls.statuses.at(-1).state, 'success');
  assert.match(calls.comments[0].body, /Custom licenses require manual review/);
  assert.match(calls.comments[0].body, /even if the identifier has appeared/);
});

test('new license texts receive a review advisory without blocking', async (t) => {
  const calls = await runReport(t, { files: [file('example.txt', 'MIT')], changed: ['example.txt', 'LICENSES/MIT.txt'] });
  assert.equal(calls.statuses.at(-1).state, 'success');
  assert.match(calls.comments[0].body, /New, changed, or missing license texts require maintainer review: `MIT`/);
  assert.doesNotMatch(calls.comments[0].body, /already present before this PR/);
});

test('existing license texts remain distinguished from new ones', async (t) => {
  const calls = await runReport(t, { files: [file('example.txt', 'MIT')] });
  assert.equal(calls.statuses.at(-1).state, 'success');
  assert.match(calls.comments[0].body, /License texts already present before this PR: `MIT`/);
  assert.doesNotMatch(calls.comments[0].body, /New, changed, or missing license texts/);
});

test('compound expressions disclose non-Apache licenses and exceptions', async (t) => {
  const calls = await runReport(t, { files: [file('example.txt', '(Apache-2.0 OR MIT) AND GPL-2.0-only WITH Classpath-exception-2.0')] });
  assert.equal(calls.statuses.at(-1).state, 'failure');
  for (const id of ['MIT', 'GPL-2.0-only', 'Classpath-exception-2.0']) assert.ok(calls.comments[0].body.includes('`' + id + '`'));
});

for (const id of ['GPL-3.0-only', 'GPL-2.0-or-later', 'LGPL-2.1-only', 'AGPL-3.0-or-later', 'GPL-2.0+', 'LGPL-2.1+', 'AGPL-1.0']) {
  test(`${id} is prohibited even with no REUSE findings`, async (t) => {
    const calls = await runReport(t, {
      files: [file('example.txt', id)], changed: ['example.txt', `LICENSES/${id}.txt`],
    });
    assert.equal(calls.statuses.at(-1).state, 'failure');
    assert.match(calls.comments[0].body, /expressly prohibited/);
    assert.ok(calls.comments[0].body.includes('`' + id + '`'));
    assert.match(calls.comments[0].body, /example.txt/);
  });
}

test('metadata-only changes cannot introduce a prohibited license on an unchanged file', async (t) => {
  const calls = await runReport(t, { files: [file('unchanged.txt', 'AGPL-3.0-only')], changed: ['REUSE.toml'] });
  assert.equal(calls.statuses.at(-1).state, 'failure');
  assert.match(calls.comments[0].body, /expressly prohibited/);
});

test('prohibited files never receive attribution suggestions', async (t) => {
  const calls = await runReport(t, {
    files: [file('example.txt', 'GPL-3.0-only')],
    findings: { missing_copyright_info: ['example.txt'] }, diff: suggestionDiff('example.txt'),
  });
  assert.equal(calls.statuses.at(-1).state, 'failure');
  assert.deepEqual(calls.suggestions, []);
});

test('metadata-only changes disclose and validate unchanged files', async (t) => {
  const calls = await runReport(t, {
    changed: ['REUSE.toml'], files: [file('untouched.txt', 'MIT')], findings: { missing_licenses: ['MIT'] },
  });
  assert.equal(calls.statuses.at(-1).state, 'failure');
  assert.match(calls.comments[0].body, /untouched.txt/);
  assert.match(calls.comments[0].body, /no file in LICENSES/);
});

test('missing Apache license text also fails compliance', async (t) => {
  const calls = await runReport(t, { findings: { missing_licenses: ['Apache-2.0'] } });
  assert.equal(calls.statuses.at(-1).state, 'failure');
});

test('malformed SPDX expressions fail', async (t) => {
  const calls = await runReport(t, { files: [file('example.txt', 'MIT AND', false)] });
  assert.equal(calls.statuses.at(-1).state, 'failure');
  assert.match(calls.comments[0].body, /malformed SPDX/);
});

test('unrelated existing failures do not fail an ordinary content PR', async (t) => {
  const calls = await runReport(t, { findings: { missing_copyright_info: ['unrelated.txt'] } });
  assert.equal(calls.statuses.at(-1).state, 'success');
});

function suggestionDiff(filePath) {
  return `diff --git a/${filePath} b/${filePath}\n--- a/${filePath}\n+++ b/${filePath}\n@@ -1 +1,2 @@\n+# SPDX-FileCopyrightText: @@REUSE_SUGGEST_IDENTITY@@\n existing\n`;
}

test('mixed PR only posts copyright suggestions for differential files', async (t) => {
  const calls = await runReport(t, {
    changed: ['apache.txt', 'mit.txt'], files: [file('apache.txt'), file('mit.txt', 'MIT')],
    findings: { missing_copyright_info: ['apache.txt', 'mit.txt'] },
    diff: suggestionDiff('apache.txt') + suggestionDiff('mit.txt'),
  });
  assert.deepEqual(calls.suggestions.map((s) => s.path), ['mit.txt']);
  assert.match(calls.suggestions[0].body, /Test Contributor/);
});

test('Apache missing metadata never triggers sign-off lookups or suggestions', async (t) => {
  const calls = await runReport(t, {
    findings: { missing_copyright_info: ['example.txt'] }, diff: suggestionDiff('example.txt'),
  });
  assert.equal(calls.commitReads, 0);
  assert.deepEqual(calls.suggestions, []);
});

test('stale runs cannot post statuses or comments', async (t) => {
  const calls = await runReport(t, { stale: true, files: [file('example.txt', 'MIT')] });
  assert.deepEqual(calls.statuses, []);
  assert.deepEqual(calls.comments, []);
});

test('invalid artifacts produce an error status', async (t) => {
  const calls = await runReport(t, { malformed: true });
  assert.equal(calls.statuses.at(-1).state, 'error');
});

test('oversized reports still disclose the license identifiers', async (t) => {
  const files = Array.from({ length: 1200 }, (_, i) => file(`long-file-${i}-${'x'.repeat(100)}.txt`, 'MIT'));
  const calls = await runReport(t, { files, changed: ['REUSE.toml'] });
  assert.match(calls.comments[0].body, /`MIT`/);
  assert.ok(calls.comments[0].body.length < 60000);
});

test('removing differential licenses updates the existing bot comment', async (t) => {
  const calls = await runReport(t, { comments: [{ id: 10, user: bot, body: '<!-- reuse-check-comment -->\nMIT' }] });
  assert.equal(calls.comments[0].comment_id, 10);
  assert.doesNotMatch(calls.comments[0].body, /MIT/);
});

for (const state of ['success', 'failure', 'error']) {
  for (const commentFailure of ['list', 'create', 'update']) {
    test(`REUSE preserves ${state} when comment ${commentFailure} fails`, async (t) => {
      const calls = await runReport(t, {
        files: [file('example.txt', 'MIT')],
        findings: state === 'failure' ? { missing_licenses: ['MIT'] } : {},
        malformed: state === 'error',
        commentFailure,
        comments: commentFailure === 'update' ? [{ id: 10, user: bot, body: '<!-- reuse-check-comment -->' }] : [],
      });
      assert.deepEqual(calls.statuses.map((status) => status.state), [state]);
      assert.equal(calls.warnings.length, 1);
      assert.match(calls.warnings[0], /published compliance result is unchanged/);
    });
  }
}

test('REUSE preserves Apache-only success if clearing an old comment fails', async (t) => {
  const calls = await runReport(t, {
    commentFailure: 'update', comments: [{ id: 10, user: bot, body: '<!-- reuse-check-comment -->' }],
  });
  assert.deepEqual(calls.statuses.map((status) => status.state), ['success']);
  assert.equal(calls.warnings.length, 1);
});

test('DCO checks matching sign-offs and reports the DCO status context', async () => {
  const h = harness();
  await checkDco(h);
  assert.equal(h.calls.statuses.at(-1).state, 'success');
  assert.equal(h.calls.statuses.at(-1).context, 'DCO Verification');
  assert.deepEqual(h.calls.failures, []);
});

test('unsigned commits fail with the new DCO instructions', async () => {
  const h = harness({ commits: [{ ...signedCommit, commit: { ...signedCommit.commit, message: 'docs: example' } }] });
  await checkDco(h);
  assert.equal(h.calls.statuses.at(-1).state, 'failure');
  assert.match(h.calls.comments[0].body, /CONTRIBUTING.md#developer-certificate-of-origin/);
  assert.doesNotMatch(h.calls.comments[0].body, /Developer Contribution Agreement/);
  assert.equal(h.calls.failures.length, 1);
});

test('DCO dropdown uses HTML and preserves literal command and email placeholders', async () => {
  const h = harness({ commits: [{ ...signedCommit, commit: { ...signedCommit.commit, message: 'docs: example' } }] });
  await checkDco(h);
  const dropdown = h.calls.comments[0].body.match(/<details>([\s\S]*?)<\/details>/)[1];
  assert.doesNotMatch(dropdown, /```|`|\*\*|\]\(/);
  assert.match(dropdown, /<strong>If your branch has a single commit<\/strong>/);
  assert.match(dropdown, /<pre><code>git rebase HEAD~&lt;number-of-commits&gt; --signoff/);
  assert.match(dropdown, /&lt;your.email@example.com&gt;/);
  assert.match(dropdown, /&lt;\[your primary email address\]&gt;/);
  assert.match(dropdown, /<a href="https:\/\/github.com\/owner\/repo\/blob\/main\/CONTRIBUTING.md#developer-certificate-of-origin">/);
  assert.equal((dropdown.match(/<pre><code>/g) || []).length, 4);
  assert.equal((dropdown.match(/<\/code><\/pre>/g) || []).length, 4);
});

test('DCO HTML links escape interpolated attribute values', async () => {
  const h = harness({ commits: [{ ...signedCommit, commit: { ...signedCommit.commit, message: 'docs: example' } }] });
  h.context.payload.repository.default_branch = 'test"&<branch>';
  await checkDco(h);
  const dropdown = h.calls.comments[0].body.match(/<details>([\s\S]*?)<\/details>/)[1];
  assert.match(dropdown, /test&quot;&amp;&lt;branch&gt;/);
  assert.doesNotMatch(dropdown, /test"&<branch>/);
});

test('merge commits remain exempt from sign-offs', async () => {
  const h = harness({ commits: [{ ...signedCommit, parents: [{}, {}], commit: { message: 'Merge branch' } }] });
  await checkDco(h);
  assert.equal(h.calls.statuses.at(-1).state, 'success');
});

test('commitlint fetch preserves multiline messages as inert JSON', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'incus-commitlint-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const previous = process.env.COMMITS_FILE;
  process.env.COMMITS_FILE = path.join(temp, 'commits.json');
  try {
    const h = harness();
    await require('../../.github/scripts/commitlint/fetch.cjs')(h);
    const commits = JSON.parse(fs.readFileSync(process.env.COMMITS_FILE, 'utf8'));
    assert.deepEqual(commits, [{ sha: headSha, message: signedCommit.commit.message }]);
  } finally {
    if (previous === undefined) delete process.env.COMMITS_FILE;
    else process.env.COMMITS_FILE = previous;
  }
});

test('commitlint status reports infrastructure failures', async () => {
  const keys = ['CHECKOUT_OUTCOME', 'SETUP_OUTCOME', 'INSTALL_OUTCOME', 'FETCH_OUTCOME', 'LINT_OUTCOME'];
  const previous = { ...process.env };
  try {
    for (const key of keys) process.env[key] = 'success';
    process.env.INSTALL_OUTCOME = 'failure';
    const h = harness();
    await require('../../.github/scripts/commitlint/status.cjs')(h);
    assert.equal(h.calls.statuses.at(-1).state, 'error');
    assert.equal(h.calls.failures.length, 1);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
// REUSE-IgnoreEnd
