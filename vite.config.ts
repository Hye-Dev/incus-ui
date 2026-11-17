// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { applicationClient } from "./scripts/build/client.ts";
import { distributionLicenses } from "./scripts/build/licenses.ts";
import { runtimeManifest } from "./scripts/build/runtime.ts";

export default defineConfig(({ command }) => {
	return {
		resolve: { tsconfigPaths: true },
		// The manifest-loaded owner is not discoverable from index.html.
		optimizeDeps: {
			entries: [
				"index.html",
				"src/host/owner.ts",
				"src/development/client.ts",
				"src/development/devtools.tsx",
			],
		},
		plugins: [
			applicationClient(),
			distributionLicenses(),
			tanstackRouter({ target: "react", autoCodeSplitting: true }),
			...(command === "serve" ? [devtools()] : []),
			runtimeManifest(),
			tailwindcss(),
			viteReact(),
			babel({ presets: [reactCompilerPreset()] }),
		],
		base: "/ui/",
		build: { license: true },
	};
});
