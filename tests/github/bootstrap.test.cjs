const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { test } = require('node:test');

const workflowPath = (name) => path.join(__dirname, '../../.github/workflows', name);
const readWorkflow = (name) => fs.readFileSync(workflowPath(name), 'utf8').replace(/\r\n/g, '\n');

function step(source, name) {
  const section = source.split(`      - name: ${name}\n`)[1];
  assert.ok(section, `Missing step: ${name}`);
  return section.split('\n      - name: ')[0];
}

async function runInline(stepSource) {
  const script = stepSource.match(/          script: \|\n((?:            .*\n|\n)+)/)?.[1];
  assert.ok(script, 'Expected an inline script');
  assert.doesNotMatch(script, /require\(/, 'Bootstrap must not load checkout files');
  const statuses = [];
  const github = { rest: { repos: { createCommitStatus: async (value) => statuses.push(value) } } };
  const context = {
    repo: { owner: 'owner', repo: 'repo' }, runId: 42,
    payload: { pull_request: { head: { sha: 'a'.repeat(40) } } },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('github', 'context', script)(github, context);
  return statuses;
}

for (const [name, statusContext] of [
  ['commitlint.yml', 'Conventional Commits'],
  ['dco.yml', 'DCO Verification'],
  ['reuse-report.yml', 'REUSE Compliance'],
]) {
  test(`${name}: pending and checkout failure statuses work without checkout files`, async () => {
    const source = readWorkflow(name);
    assert.ok(source.indexOf('- name: Mark check as pending') < source.indexOf('- name: Check out trusted'));
    assert.match(step(source, 'Check out trusted workflow scripts'), /id: checkout/);
    const failure = step(source, name === 'reuse-report.yml' ? 'Report workflow failure' : 'Report checkout failure');
    if (name === 'reuse-report.yml') assert.match(failure, /if: failure\(\)/);
    else assert.match(failure, /if: always\(\) && steps.checkout.outcome != 'success'/);
    for (const [stepSource, state] of [[step(source, 'Mark check as pending'), 'pending'], [failure, 'error']]) {
      const statuses = await runInline(stepSource);
      assert.equal(statuses.length, 1);
      assert.equal(statuses[0].state, state);
      assert.equal(statuses[0].context, statusContext);
      assert.equal(statuses[0].sha, 'a'.repeat(40));
    }
  });
}

test('trusted workflows load scripts from their own execution revision', () => {
  for (const name of ['commitlint.yml', 'dco.yml', 'reuse-scan.yml', 'reuse-report.yml']) {
    const checkout = step(readWorkflow(name), 'Check out trusted workflow scripts');
    assert.match(checkout, /ref: \$\{\{ github.sha \}\}/);
    assert.match(checkout, /persist-credentials: false/);
    assert.doesNotMatch(checkout, /pull_request\.(?:head|base)\.sha/);
  }
  assert.match(step(readWorkflow('reuse-scan.yml'), 'Check out PR head'), /ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
});

test('commitlint does not attempt to load its final status script after checkout failure', () => {
  assert.match(step(readWorkflow('commitlint.yml'), 'Publish commitlint status'),
    /if: always\(\) && steps.checkout.outcome == 'success'/);
});

for (const failingApi of ['pulls.get', 'pulls.listFiles']) {
  test(`REUSE workflow fallback reports error after ${failingApi} throws`, async (t) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'incus-report-failure-'));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const keys = ['bad_licenses', 'deprecated_licenses', 'licenses_without_extension',
      'missing_copyright_info', 'missing_licenses', 'missing_licensing_info', 'read_errors', 'unused_licenses'];
    fs.writeFileSync(path.join(temp, 'reuse-lint.json'), JSON.stringify({
      files: [], non_compliant: Object.fromEntries(keys.map((key) => [key, []])),
    }));
    const previous = { ...process.env };
    Object.assign(process.env, { HEAD_SHA: 'a'.repeat(40), PR_NUMBER: '1', ARTIFACT_DIR: temp });
    try {
      const github = {
        rest: { pulls: {
          get: async () => {
            if (failingApi === 'pulls.get') throw new Error('API unavailable');
            return { data: { state: 'open', head: { sha: 'a'.repeat(40) }, base: { repo: { full_name: 'owner/repo' } } } };
          },
          listFiles: 'files',
        } },
        paginate: async () => { throw new Error('API unavailable'); },
      };
      const context = { repo: { owner: 'owner', repo: 'repo' }, runId: 42,
        payload: { repository: { default_branch: 'main' } } };
      await assert.rejects(require('../../.github/scripts/reuse/report.cjs')({ github, context, core: {} }), /API unavailable/);
      const fallback = step(readWorkflow('reuse-report.yml'), 'Report workflow failure');
      assert.match(fallback, /if: failure\(\)/);
      const statuses = await runInline(fallback);
      assert.equal(statuses[0].state, 'error');
      assert.equal(statuses[0].context, 'REUSE Compliance');
    } finally {
      for (const key of ['HEAD_SHA', 'PR_NUMBER', 'ARTIFACT_DIR']) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  });
}
