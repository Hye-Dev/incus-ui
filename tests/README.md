<!-- SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Where tests belong

Keep reusable behavior tests beside their shared layer. Root tests cover the application and its tooling.

| Location | Responsibility | Command from repository root |
| --- | --- | --- |
| `shared/data/tests/` | Incus access, acquisition, knowledge, resources, runtime, and transport | `npm run test:incus` |
| `shared/data/tests/types/` | Compile-only public contract assertions | `npm run typecheck` |
| `shared/state/tests/`, `shared/components/tests/`, `tests/react/` | React state, context, and rendering decisions | `npm run test:react` |
| `tests/browser/` | Application journeys with real browser workers and persistence | `npm run build && npm run test:browser` |
| `shared/components/tests/browser/` | Reusable component interactions in an independent consumer | `npm run test:components:browser` |
| `tests/dev/` | Development proxy and build integration | `npm run test:dev` |
| `tests/architecture/` | Source import boundaries; no build required | `npm run test:architecture` |
| `tests/artifacts/` | Production output, worker entry, and distribution licenses | `npm run build && npm run test:artifacts` |
| `tests/github/` | Workflows and attribution tooling | `node --test tests/github/*.test.cjs` and `python3 -B -m unittest discover -s tests/github` |

Use `*.test.ts`, `*.test.tsx`, or `*.test.mjs` for executable tests, and `*.types.ts` for compile-only assertions. Suites discover nested files recursively. Group a growing suite by behavior, such as `tests/browser/projects/`, rather than by bug number. Put fixtures in the nearest `support/` folder.

Use Vitest and React Testing Library for React state and rendering contracts. Keep layout, keyboard interaction, workers, persistence, and cross-tab behavior in browser tests. Browser fixtures isolate API servers, cookies, storage, workers, and permissions between scenarios; each test file reuses its browser process.

## Running checks

Run `npm run check` and `npm run typecheck`, then the suite covering your change. Pass a file filter to `npm run test:react -- <filter>`, or use `npm run test:react:watch` while working. Node tests can run directly, for example:

```sh
node --experimental-strip-types --test shared/data/tests/resources/projects.test.ts
```

`npm run test:affected -- --dry-run` shows suites selected from changed files relative to `origin/main`. Omit `--dry-run` to run them, or supply `--base <ref>` to choose another base. Unknown inputs select all suites. Install schema tooling with `npm ci --prefix scripts/api` before checks that include generation.

Rebuild after application changes before running application browser or artifact tests. `test:browser` also includes the standalone component browser suite, which can run separately without an application build. Browser files run with two workers. Chromium uses the full Chromium channel; set `PLAYWRIGHT_BROWSER=firefox` to test the owner fallback. `PLAYWRIGHT_CHANNEL` selects another installed Chromium channel.

Run `npm run test:vem-package` when updating Vem dependencies. It installs the pinned npm packages in an independent consumer and verifies public imports and types. To validate unpublished candidates, supply both `VEM_DATA_PACKAGE` and `VEM_UI_PACKAGE` as temporary tarball paths. Ordinary screen changes do not need this extra install.

CI uses Node.js 24 and runs all suites, both browser engines, and package validation. Python workflow tests require REUSE in that Python environment.
