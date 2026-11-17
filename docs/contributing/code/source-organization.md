<!-- SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Source organization

Application code lives in `src/`; reusable Incus functionality lives in `shared/`.

| Location | Contents |
| --- | --- |
| `src/routes` | Routes, nested layouts, and screen composition |
| `src/layout` | Application frame: sidebar, header container, and connection banner |
| `src/projects` | Project selection and its saved preference |
| `src/host` | Browser client and worker setup |
| `src/development` | Development tools |
| `shared/data` | Reusable Incus resource definitions and backend integration |
| `shared/state` | Reusable Incus state and React bindings |
| `shared/components` | Reusable Incus controls |

Shared layers expose public entry points and never import `src/`. Components can use state and data; state can use data. See the [test guide](../../../tests/README.md) for test placement and commands.
