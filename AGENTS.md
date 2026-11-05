<!--
SPDX-FileCopyrightText: 2026 Contributors to Incus <https://github.com/lxc/incus>
SPDX-License-Identifier: Apache-2.0
-->

# Legal

 - All contributions to this repository must be compatible with the Apache 2.0 license.
 - Specifically (but not limited to), contributions cannot include code licensed under the terms of the GPL, AGPL or LGPL licenses.
 - Contributions under another compatible license must be marked as described in `CONTRIBUTING.md`.
 - Only human beings are allowed to sign the Developer Certificate of Origin (DCO / Signed-off-by).
 - Only human beings can ever be credited within commit messages.

# Formatting

 - Code comments should be no longer than one line, unless they are required to cover complex unintuitive logic.
 - Commit messages should similarly be kept as short and to the point as possible, no need to summarize the whole issue.
 - Commit messages must follow the Conventional Commits structure described in `CONTRIBUTING.md`.
 - Code formatting and linting is handled by `biome`, don't hand-format against it.

# Testing / validation

 - All branches are expected to pass `npm run check` and `npm run typecheck`.
 - Changes under `.github/` are expected to pass `node --test tests/github/*.test.cjs` and `python3 -B -m unittest discover -s tests/github`.
 - Excessive unit tests are generally discouraged.
 - When possible, existing tests should be extended to cover new features.
 - A full local test run isn't required prior to contribution, all tests get run in our CI.

# Skills

 - `.agents/skills/` holds the instructions for specific tasks, read the relevant one before starting.
 - `.claude/skills/` carries a copy of each `SKILL.md` for Claude Code, keep both copies in sync.
