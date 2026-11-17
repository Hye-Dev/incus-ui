<!--
SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
SPDX-License-Identifier: Apache-2.0
-->

# Development environment

## Prerequisites

- [Node.js 24](https://nodejs.org/en)
- The [Incus CLI](https://linuxcontainers.org/incus/docs/main/installing/) with a [configured remote](https://linuxcontainers.org/incus/docs/main/remotes/) that can reach your development server

## Quick start

```sh
npm ci
incus remote list
incus info
npm run dev
```

Open the printed address, normally `http://127.0.0.1:3001/ui/`. The development proxy serves Vite's `/ui` routes and the selected Incus API from one origin. It starts and stops Vite with the proxy process. `npm run dev:vite` starts Vite alone when another reverse proxy is available.

## Choosing a remote

The proxy uses the CLI's default remote. To change that default, run `incus remote switch <name>`. To choose a remote for one development session:

```sh
npm run dev -- --remote lab
```

Selection follows `--remote`, `INCUS_REMOTE`, the CLI configuration's default, then `local`. Image-only remotes such as simplestreams cannot serve the Incus API.

Startup prints the selected configuration file and remote. Check these first if the proxy cannot connect. In particular, a server running in WSL needs a reachable HTTPS remote when the proxy runs on Windows; a Linux socket path is not accessible from Windows.

### Configuration and credentials

The proxy reads the CLI's `config.yml` and credentials from these locations:

- `INCUS_CONF`, if set. An explicit directory never falls back to another location.
- Otherwise the platform directory: `$XDG_CONFIG_HOME/incus` or `~/.config/incus` on Linux, `~/Library/Application Support/incus` on macOS, or `%APPDATA%/incus` on Windows.
- If that directory has no `config.yml`, the legacy `~/.config/incus` directory.

System-wide remotes come from `$INCUS_GLOBAL_CONF/config.yml` or `/etc/incus/config.yml`; user-defined remotes take precedence. The proxy does not rewrite CLI configuration. Restart it after changing a remote.

HTTPS remotes use the CLI's server certificate and client credentials. Public and OIDC remotes do not receive a CLI client certificate. The proxy does not read CLI OIDC tokens or cookie jars, and it cannot decrypt encrypted client keys. Use a dedicated development identity with an unencrypted key when needed.

The proxy binds to loopback because requests can use your CLI identity. Use a real HTTPS deployment to test browser TLS enrollment, OIDC redirects, and production response headers. A proxy `502` means the upstream connection failed; it does not mean that the caller lacks permission.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `INCUS_CONF` | Existing platform or legacy CLI directory | User configuration and credentials |
| `INCUS_GLOBAL_CONF` | `/etc/incus` | System-wide remote configuration |
| `INCUS_REMOTE` | CLI default, then `local` | Selected remote unless `--remote` is supplied |
| `INCUS_SOCKET` | `$INCUS_DIR/unix.socket` | Socket override for the `local` remote |
| `INCUS_DIR` | `/var/lib/incus` | Local server directory |
| `DEV_PROXY_HOST` | `127.0.0.1` | `127.0.0.1`, `::1`, or `localhost` |
| `DEV_PROXY_PORT` | `3001` | Browser-facing port |
| `DEV_PROXY_APP_PORT` | `5173` | Vite's loopback port |
| `DEV_PROXY_CONNECT_TIMEOUT_MS` | `10000` | Connection and response-header deadline; active uploads and response streams are not timed out |
| `DEV_PROXY_CROSS_ORIGIN_ISOLATION` | unset | Set `1` to add isolation headers to Vite responses when testing a feature that requires them |

## API contracts

The full API types are generated from an immutable Incus Swagger document. Generation tools have an isolated dependency lockfile so their TypeScript dependency does not constrain the application compiler.

```sh
npm ci --prefix scripts/api
npm run generate:incus-types
npm run generate:incus-types -- --check
```

`scripts/api/schema.json` pins the upstream commit, source digest, and generator versions. The generator preserves the upstream YAML in `shared/data/src/transport/generated/rest-api.yaml`, converts Swagger 2 to OpenAPI 3 without patch mode, and emits the complete models, paths, and operations in `schema.ts`. `--check` reads local artifacts without downloading and fails on a difference. `--download` retrieves and verifies the pinned source again.

Generated types describe the source document, not runtime validation. Known upstream gaps are recorded in `shared/data/src/transport/generated/provenance.json`; fix those upstream and regenerate instead of editing the generated output. Updating a schema pin is a reviewed change, not an installation-time fetch of the latest API.

## Validation

Run `npm run check`, `npm run typecheck`, and `npm run test:dev` for development tooling changes. The proxy tests construct isolated HTTP, upgraded-stream, socket, and TLS peers; they do not use your Incus credentials. OpenSSL generates the temporary TLS fixtures. On Windows the tests also recognize the OpenSSL bundled with Git for Windows; without OpenSSL, the TLS case is explicitly skipped.
