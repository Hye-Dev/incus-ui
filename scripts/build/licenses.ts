// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/** Include source-component and font notices that Vite's JavaScript inventory does not cover. */
export function distributionLicenses(): Plugin {
	let root: string;
	return {
		name: "incus-distribution-licenses",
		apply: "build",
		configResolved(config) {
			root = config.root;
		},
		async generateBundle() {
			const sections = await Promise.all(
				[
					["Incus UI — Apache-2.0", "LICENSE"],
					[
						"Hye Vem Data — Apache-2.0",
						"node_modules/@hyecompany/vem-data/LICENSE",
					],
					[
						"Hye Vem UI — Apache-2.0",
						"node_modules/@hyecompany/vem-ui/LICENSE",
					],
					[
						"Hye Vem UI — MIT",
						"node_modules/@hyecompany/vem-ui/dist/LICENSES/MIT.txt",
					],
					[
						"Inter font — OFL-1.1",
						"node_modules/@fontsource-variable/inter/LICENSE",
					],
					["Dexie — NOTICE", "node_modules/dexie/NOTICE"],
				].map(async ([title, file]) => {
					const text = await readFile(resolve(root, file), "utf8");
					return `${title}\n${"=".repeat(title.length)}\n\n${text.trim()}\n`;
				}),
			);
			this.emitFile({
				type: "asset",
				fileName: "LICENSES.txt",
				source: [
					"License texts and notices for this Incus UI distribution.",
					"Bundled JavaScript dependency licenses and notices are also included in .vite/license.md.\n",
					...sections,
				].join("\n"),
			});
		},
	};
}
