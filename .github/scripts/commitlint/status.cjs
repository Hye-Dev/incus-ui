// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

// Edit contributor-facing wording here. Keep machine identifiers in the logic below.
const language = {
  error: 'Commitlint could not complete. See the workflow logs.',
  passed: 'All PR commit messages follow Conventional Commits.',
  failed: 'One or more commit messages failed commitlint.',
  stale: 'Skipping a stale commitlint result because the PR head changed or the PR closed.',
};

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const headSha = context.payload.pull_request.head.sha;
  const infrastructurePassed = [
    process.env.CHECKOUT_OUTCOME,
    process.env.SETUP_OUTCOME,
    process.env.INSTALL_OUTCOME,
    process.env.FETCH_OUTCOME,
  ].every((outcome) => outcome === 'success');

  let state;
  let description;
  if (!infrastructurePassed) {
    state = 'error';
    description = language.error;
  } else if (process.env.LINT_OUTCOME === 'success') {
    state = 'success';
    description = language.passed;
  } else {
    state = 'failure';
    description = language.failed;
  }

  const { data: pr } = await github.rest.pulls.get({
    owner, repo, pull_number: context.payload.pull_request.number,
  });
  if (pr.state !== 'open' || pr.head.sha !== headSha) {
    core.notice(language.stale);
    return;
  }

  await github.rest.repos.createCommitStatus({
    owner,
    repo,
    sha: headSha,
    state,
    context: 'Conventional Commits',
    description,
    target_url: `https://github.com/${owner}/${repo}/actions/runs/${context.runId}`,
  });

  if (state !== 'success') {
    core.setFailed(description);
  }
};
