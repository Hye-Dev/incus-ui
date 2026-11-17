// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { expect } from "@playwright/test";
import { build } from "vite";

let bundle;
export function clientBundle() {
	bundle ??= build({
		configFile: false,
		logLevel: "silent",
		build: {
			write: false,
			minify: false,
			lib: { entry: "tests/browser/support/client-entry.mjs", formats: ["es"] },
		},
		define: { "process.env.NODE_ENV": '"development"' },
	}).then((result) => result[0].output[0].code);
	return bundle;
}

export async function attachClient(page, { development = false } = {}) {
	await page.evaluate(async (development) => {
		const { connect, resources } = await import("/ui/__test-client.js");
		const client = development
			? (await import("/ui/src/development/client.ts")).client
			: connect(await (await fetch("/ui/__test-compatibility.json")).json());
		window.vem = { client, ...resources };
	}, development);
	await expect
		.poll(() =>
			page.evaluate(() => window.vem.client.connectionSnapshot().phase),
		)
		.toBe("ready");
}
