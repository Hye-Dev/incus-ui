// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

// Edit contributor-facing wording here. Keep machine identifiers in the logic below.
const language = {
  stale: 'The PR head changed or the PR closed while commitlint was starting.',
  tooManyCommits: (count) => `This PR has ${count} commits, but GitHub exposes at most 250 for verification.`,
  incompleteCommits: (expected, actual) => `GitHub reported ${expected} commits, but only ${actual} could be retrieved.`,
};

module.exports = async ({ github, context, core }) => {
  const fs = require('fs');
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;
  const eventHeadSha = context.payload.pull_request.head.sha;

  const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number });
  if (pr.state !== 'open' || pr.head.sha !== eventHeadSha) {
    throw new Error(language.stale);
  }

  const commits = await github.paginate(github.rest.pulls.listCommits, {
    owner, repo, pull_number, per_page: 100,
  });
  if (pr.commits > 250) {
    throw new Error(language.tooManyCommits(pr.commits));
  }
  if (commits.length !== pr.commits) {
    throw new Error(language.incompleteCommits(pr.commits, commits.length));
  }

  fs.writeFileSync(
    process.env.COMMITS_FILE,
    JSON.stringify(commits.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
    }))),
    { mode: 0o600 },
  );

};
