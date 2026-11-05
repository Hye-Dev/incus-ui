<!--
SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
SPDX-License-Identifier: Apache-2.0
-->

# Contributing

The Incus UI team appreciates contributions to the project, through pull requests, issues on the [GitHub repository](https://github.com/lxc/incus-ui/issues), or discussions or questions on the [forum](https://discuss.linuxcontainers.org).

Check the following guidelines before contributing to the project.

## Code of Conduct

When contributing, you must adhere to the Code of Conduct, which is available at: [`https://github.com/lxc/incus-ui/blob/main/CODE_OF_CONDUCT.md`](https://github.com/lxc/incus-ui/blob/main/CODE_OF_CONDUCT.md)

## License and copyright

By default, any contribution to this project is made under the Apache
2.0 license.

The author of a change remains the copyright holder of their code
(no copyright assignment).

### Licensing and copyright metadata

This project follows the [REUSE Specification](https://reuse.software/spec-3.3/) so that every file states its license and copyright. Every commit must be self-contained: licensing must be correctly indicated as of that commit alone.

Contributions made under the default Apache 2.0 license are covered by the blanket declaration in [`REUSE.toml`](/REUSE.toml). You only need to add metadata of your own when you want to claim copyright on a file or when you contribute something under a different license.

The [`reuse`](https://reuse.readthedocs.io/en/stable/readme.html#install) CLI tool can help with this. `reuse download`, `reuse lint` and `reuse annotate` are the useful ones, and `pipx run reuse` works without installing it.

### Contributing under a different license

You're welcome to contribute code that's licensed differently from the rest of the project, so long as it remains compatible with the Apache 2.0 license.

Generally:

- **Accepted:** permissive licenses like MIT, BSD (2-Clause or 3-Clause), ISC, and similar.
- **Reviewed case by case:** MPL, CDDL and EPL. These are weak-copyleft licenses carrying a per-file share-alike obligation, so modifications to that specific file must remain under the same license if distributed. Since the obligation is ongoing, they're always reviewed individually.
- **Not accepted, in any form:** GPL, LGPL, AGPL or similar copyleft licenses. Even re-implementing similar logic after seeing copyleft code could still produce a derivative work under that code's license, so be careful!

Licenses we've accepted before are present in the [`LICENSES/`](/LICENSES/) folder.

To contribute such code:

1. Find your license in the [SPDX License List](https://spdx.org/licenses/). The value in the "Identifier" column is your `SPDX-License-Identifier`.

2. Mark the contribution. If it's a **new file**, add a comment header:

<!-- REUSE-IgnoreStart -->

   ```
   SPDX-FileCopyrightText: 2026 First Last <email>
   SPDX-License-Identifier: MIT
   ```

<!-- REUSE-IgnoreEnd -->

   If it's **part of an existing file**, enclose that part in comments:

<!-- REUSE-IgnoreStart -->

   ```
   SPDX-SnippetBegin
   SPDX-SnippetCopyrightText: 2026 First Last <email>
   SPDX-License-Identifier: MIT

   [part]

   SPDX-SnippetEnd
   ```

<!-- REUSE-IgnoreEnd -->

   If the file can't carry comments, add an entry to [`REUSE.toml`](/REUSE.toml) instead.

3. If the full text of that license isn't already in `LICENSES/`, add it as `LICENSES/[SPDX-License-Identifier].txt` (for example `LICENSES/MIT.txt`). `reuse download MIT` will fetch it for you.

4. List the licenses at the beginning of your pull request description, for example:

   ```
   **Differential Licenses:** MIT, ISC
   ```

The example implementations above are opinionated to make compliance easier to understand. You don't *have* to follow them; any indication compliant with the REUSE Specification is acceptable.

<!--
SPDX-SnippetBegin
SPDX-SnippetCopyrightText: 2026 Stéphane Graber <stgraber@stgraber.org>
-->

## Policy on the use of Large Language Models (LLMs) and AI tooling

### For issue reporting

We do NOT allow direct filing of issues by LLMs.

We REQUIRE a human being to go through our issue reporting form on
Github and accurately describe their issue and provide all needed
information.

The more concise and to the point the issue is, the more likely it is to
be understood, tracked down and resolved quickly.

Long winded AI written essays can easily look overwhelming and cause our
maintainers and other contributors to just entirely skip the issue to
focus their energy on something else.

We also don't benefit from AI generated root cause analysis or proposed
fixes in those issues. If you yourself understand the code base well
enough to go through that content and suggested fix, then turn it into a
pull request and submit it yourself. Otherwise, please limit your report
to describing the issue at hand and we'll take it from there.

### For contributions

We REQUIRE all contributions to Incus UI to be submitted by human beings
who can assert full copyright ownership of their contribution or have
been allowed by their employer to contribute. This is what the DCO (see
below) requires of all contributors.

AI tools can sometimes be beneficial, particularly when it comes to
finding patterns among a large data set (entire code base), performing
tedious repetitive changes or large refactoring/re-organization.

While we now tolerate the use of such tools, they must abide by our
instructions (`.agents/`) and their operators cannot override those
instructions.

We expect everyone contributing to Incus UI to fully own their
contribution, be able to reason about it, be able to explain why things
were done a particular way and act as the full owner of that code. AI
tools are treated the same as traditional tooling like `sed`, `awk` or
`coccinelle`.

For the purpose of this project, AI tools CANNOT be treated as author,
co-author or be credited in any way that would suggest any ownership
over the contribution.

The contributor should have done all the thinking, planning and
understanding of the changes needed to resolve an issue or implement a
new feature prior to using automated tooling to perform the grunt work.

Unguided use of those tools or the inability to prove understanding of
the code contributed will result in a loss of trust in that contributor
by project maintainers which can then lead to exclusion from any further
contribution to the project.

It's also worth pointing out that while those tools are good at
implementing the more boring/repetitive/grunt work. We've generally
found that you only really understand the project and its structure by
having done such work yourself a few times.

### For anyone with write access to the repository

Anyone with write access to this repository must ensure to NEVER run an
AI agent or similar tool on a system which holds repository credentials
(SSH key, GPG key, web browser cookies, ...).

Any use of AI tooling should be done inside of a clean VM/container that
itself cannot directly push to or alter this repository in any way.

The safest approach is to SSH into that environment and then extract the
changes using `git format-patch`, then review and apply them to your
actual tree, tweak them as needed, sign them off and then push and open
the pull request.

Any potential credential compromise or loss of control should be
immediately reported to `security@linuxcontainers.org`.

<!-- SPDX-SnippetEnd -->

## Reporting bugs and requesting features

If you encounter a bug or would like to request a feature, [file an issue on GitHub](https://github.com/lxc/incus-ui/issues/new/choose). Issues must be filed through that form by a human being, as covered above.

## Pull requests

Changes to this project should be proposed as pull requests on GitHub
at: [`https://github.com/lxc/incus-ui`](https://github.com/lxc/incus-ui)

Proposed changes will then go through review there and once approved,
be merged in the main branch.

If you'd like to contribute but don't know what to start with, tackling any [unassigned, open issue](https://github.com/lxc/incus-ui/issues?q=is%3Aissue%20state%3Aopen%20no%3Aassignee) is extremely appreciated!

### Commit structure

Commit messages must follow the [Conventional Commits v1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/). The subject line is structured as:

```
type(optional scope): description
```

A commit introducing a breaking change adds a `!` after the type and scope:

```
type(optional scope)!: description
```

<details>
<summary>
Supported types
</summary>
<ul>
<li><code>fix</code>: patches a bug</li>
<li><code>feat</code>: introduces a new feature</li>
<li><code>docs</code>: documentation only changes</li>
<li><code>style</code>: changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)</li>
<li><code>refactor</code>: a code change that neither fixes a bug nor adds a feature</li>
<li><code>perf</code>: a code change that improves performance</li>
<li><code>test</code>: adding missing tests or correcting existing tests</li>
<li><code>build</code>: changes that affect the build system or external dependencies (example scope: npm)</li>
<li><code>ci</code>: changes to our CI configuration files and scripts (example scope: GitHub Workflows)</li>
<li><code>chore</code>: other changes that don't modify src or test files</li>
<li><code>revert</code>: reverts a previous commit</li>
</ul>
</details>

<details>
<summary>
Supported scopes
</summary>
Scopes include, but are not limited to:
<ul>
<li><code>agents</code>: when adding or modifying agent instructions, skills, subagents, etc.</li>
</ul>
</details>

Examples: `docs: add commit message rules`, `docs(agents): commit message guidelines`.

<!--
SPDX-SnippetBegin
SPDX-SnippetCopyrightText: 2026 Stéphane Graber <stgraber@stgraber.org>
-->

### Developer Certificate of Origin

To improve tracking of contributions to this project we use the DCO 1.1
and use a "sign-off" procedure for all changes going into the branch.

The sign-off is a simple line at the end of the explanation for the
commit which certifies that you wrote it or otherwise have the right
to pass it on as an open-source contribution.

<!-- SPDX-SnippetEnd -->

<!--
SPDX-SnippetBegin
SPDX-SnippetCopyrightText: (C) 2004, 2006 The Linux Foundation and its contributors
SPDX-License-Identifier: LicenseRef-DCO-1.1
-->

```
Developer Certificate of Origin
Version 1.1

Copyright (C) 2004, 2006 The Linux Foundation and its contributors.
660 York Street, Suite 102,
San Francisco, CA 94110 USA

Everyone is permitted to copy and distribute verbatim copies of this
license document, but changing it is not allowed.

Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications, whether created in whole or in part
    by me, under the same open source license (unless I am
    permitted to submit under a different license), as indicated
    in the file; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

<!-- SPDX-SnippetEnd -->

<!--
SPDX-SnippetBegin
SPDX-SnippetCopyrightText: 2026 Stéphane Graber <stgraber@stgraber.org>
-->

An example of a valid sign-off line is:

```
Signed-off-by: Random J Developer <random@developer.org>
```

Use a known identity and a valid e-mail address.
Sorry, no anonymous contributions are allowed.

We also require each commit be individually signed-off by their author,
even when part of a larger set. You may find `git commit -s` useful.

<!-- SPDX-SnippetEnd -->

Your `user.name` and `user.email` must match the sign-off line, and should be associated with your GitHub account.
