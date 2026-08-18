<!--
SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
SPDX-License-Identifier: Apache-2.0
-->

# Codebase Contribution Guidelines
## Developer Contribution Agreement
In order to contribute to the Incus UI codebase, you must accept & agree to be bound by [The Developer Contribution Agreement](./DCA.md) (The DCA), available at [`https://raw.githubusercontent.com/lxc/incus-ui/refs/heads/main/docs/contributing/DCA.md`](https://raw.githubusercontent.com/lxc/incus-ui/refs/heads/main/docs/contributing/DCA.md).

<details>
<summary>I've read The DCA. How do I sign?</summary>
A sign-off, in the form of a <code>Signed-off-by: [Full Name] <[your primary email address]></code> line included in the commit message (with the bracketed fields replaced by your own identifying information, and the brackets themselves omitted), constitutes your acceptance of, and agreement to be bound by The Developer Contribution Agreement.
</details>

The automated DCA check excludes merge commits so GitHub's **Update branch** action does not invalidate an otherwise compliant pull request. Do not introduce substantive changes while resolving a merge conflict: put those changes in a separate, signed, non-merge commit so the automated check certifies them.

## Commit Structure
We follow the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification.

Types include:
- `fix` when fixing a bug
- `feat` when adding a new feature
- `docs` when modifying documentation
- `chore` housekeeping
- `ci` when modifying workflows
- `style`
- `refactor`
- `revert`
- `test`

Scopes include (but are not limited to):
- Rules: `rules` for changes to `CODE_OF_CONDUCT.md` and files in `docs/contributing/code/`
- Guidance: `guide` for `CONTRIBUTING.md`, `SUPPORT.md`, and `SECURITY.md`
- Licensing: `licenses` for `REUSE.toml` and files in `LICENSES/`
- Agents: `agents` for `AGENTS.md`, `CLAUDE.md` and files in `.agents/`, `.claude/`, `.codex/`
- Repository: `repo` for changes in `.github/`

## Contributing Code Under a Different License

You're welcome to contribute code that's licensed differently from the rest of the project.

For more information, see the [REUSE Specification](https://reuse.software/spec-3.3/).

### 1. Confirm the license is acceptable

**Accepted:** permissive licenses like MIT, BSD (2-Clause or 3-Clause), ISC, and similar.

**Potentially Accepted:** MPL, CDDL, and EPL. These are weak-copyleft licenses. Unlike MIT or BSD, they carry a per-file share-alike obligation: modifications to that specific file must remain under the same license if distributed. Since the obligation is ongoing, these are always reviewed on a case-by-case basis.

**Not accepted, in any form:** GPL, LGPL, AGPL, or similar copyleft licenses. _This includes code you wrote after viewing or referencing a copyleft-licensed source_, even without copying it directly. Reimplementing similar logic after seeing copyleft code can still produce a derivative work under that code's license. If you've viewed copyleft-licensed code with the intent of implementing similar functionality here, don't submit that contribution.

If you're unsure which category a license falls under, ask before opening your PR. Licenses we've accepted before are present in `./LICENSES`.

### 2. Mark the Differential Contribution Parts

Find your license's SPDX identifier on the [SPDX License List](https://spdx.org/licenses/).

#### Commentable Files

If your part is a **new file**, add a comment header of the following form:

<!-- REUSE-IgnoreStart -->

```
SPDX-FileCopyrightText: 2026 First Last <email>

SPDX-License-Identifier: MIT
```

<!-- REUSE-IgnoreEnd -->

If your part is **within an already existing file**, license the part by enclosing it in comments of the following form:

<!-- REUSE-IgnoreStart -->

```
SPDX-SnippetBegin
SPDX-SnippetCopyrightText: 2026 First Last <email>
SPDX-License-Identifier: MIT

[part]

SPDX-SnippetEnd
```

<!-- REUSE-IgnoreEnd -->

#### Uncommentable Files

If your part is a uncommentable file, create a new file entitled the exact same name as the part's file name, with `.license` appended to it. For example, given `example.ts`, create `example.ts.license`.

Place the licensing information in this new file of the same form outlined in [**new file** of Commentable Files](#commentable-files).

### 3. Add the license to the repo

If the full text of that license isn't already in `LICENSES/`, create a new file there of form `[SPDX-License-Identifier].txt` (e.g. `MIT.txt`).

### 4. Disclose it in your Pull Request

At the beginning of your Pull Request description, list the licenses used in the contribution, e.g.:

```
**Differential Licenses:** MIT, ISC
```
