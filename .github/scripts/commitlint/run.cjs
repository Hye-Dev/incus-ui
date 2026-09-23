// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

// Edit contributor-facing wording here. Keep machine identifiers in the logic below.
const language = {
  failedCommit: (sha) => `Commit ${sha} failed commitlint:`,
  failed: (count) => `${count} commit message(s) failed commitlint.`,
  passed: (count) => `All ${count} commit message(s) passed commitlint.`,
};

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const commits = JSON.parse(fs.readFileSync(process.env.COMMITS_FILE, 'utf8'));
const commitlint = require.resolve('@commitlint/cli/cli.js');
let failures = 0;

// Break GitHub workflow-command delimiters in untrusted commit text
// before printing commitlint output to the runner log.
function logSafely(value) {
  process.stdout.write(String(value).replaceAll('::', ':\u200b:'));
}

for (const commit of commits) {
  const result = spawnSync(
    process.execPath,
    [commitlint, '--config', 'commitlint.config.ts'],
    {
      input: `${commit.message}\n`,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    },
  );

  if (result.error || result.status !== 0) {
    failures++;
    console.log(language.failedCommit(commit.sha.slice(0, 12)));
    if (result.stdout) logSafely(result.stdout);
    if (result.stderr) logSafely(result.stderr);
    if (result.error) logSafely(`${result.error.message}\n`);
  }
}

if (failures > 0) {
  console.error(language.failed(failures));
  process.exitCode = 1;
} else {
  console.log(language.passed(commits.length));
}
