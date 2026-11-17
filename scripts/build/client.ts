// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { resolve } from "node:path";
import type { Plugin } from "vite";

export function applicationClient(): Plugin {
	let root = process.cwd();
	let development = false;
	return {
		name: "incus-application-client",
		configResolved(config) {
			root = config.root;
			development = config.command === "serve";
		},
		resolveId(id) {
			if (id === "virtual:incus-client")
				return resolve(
					root,
					development ? "src/development/client.ts" : "src/host/client.ts",
				);
		},
		generateBundle(_options, bundle) {
			if (development) return;
			for (const output of Object.values(bundle)) {
				if (output.type !== "chunk") continue;
				for (const module of Object.keys(output.modules)) {
					const path = module.replaceAll("\\", "/");
					if (
						/\/src\/development\//.test(path) ||
						/\/vem-data\/(?:src|dist)\/(devtools|testing)([/.])/.test(path) ||
						/\/shared\/data\/src\/(scenarios\.|resources\/[^/]+\/scenarios\.)/.test(
							path,
						)
					)
						this.error(
							`Development-only module included in production ${output.fileName}: ${path}`,
						);
				}
			}
		},
	};
}
