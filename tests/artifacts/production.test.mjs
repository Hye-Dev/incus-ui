// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { protocolVersion } from "@hyecompany/vem-data/client";
import { persistenceSchemaVersion } from "@hyecompany/vem-data/runtime";

test("the production worker retains its entry and production assets contain no development tools", async () => {
	const manifest = JSON.parse(
		await readFile("dist/vem-runtime-manifest.json", "utf8"),
	);
	assert.equal(manifest.protocol, protocolVersion);
	assert.equal(manifest.schema, persistenceSchemaVersion);
	assert.match(manifest.module, /^\/ui\/assets\/incus-runtime-[\w-]+\.js$/);
	const worker = await readFile(
		resolve("dist", manifest.module.slice(4)),
		"utf8",
	);
	assert.match(worker, /startOwner/);
	assert.ok(
		worker.length > 1000,
		"The owner must not be tree-shaken into an empty entry",
	);
	for (const file of await readdir("dist", { recursive: true })) {
		assert.doesNotMatch(file, /Bricolage|devtools/i);
		if (!/\.(?:js|css)$/.test(file)) continue;
		const source = await readFile(resolve("dist", file), "utf8");
		assert.doesNotMatch(
			source,
			/vem-inspector|VEM_DEVTOOLS|DataInspector|DataDevtools|TanStackDevtools|collectionOverride|@tanstack\/devtools|Simulated acquisition failure|Use simulated data|scenario:initial|Open this editor in a consumer|Open a screen to discover|vem-scenario|Foundation examples|\/ui\/foundation/,
		);
	}
	const licenses = await readFile("dist/.vite/license.md", "utf8");
	assert.match(licenses, /@hyecompany\/vem-data/);
	assert.match(licenses, /dexie/);
	assert.match(licenses, /xstate/);
	const supplemental = await readFile("dist/LICENSES.txt", "utf8");
	for (const file of [
		"LICENSE",
		"node_modules/@hyecompany/vem-ui/dist/LICENSES/MIT.txt",
		"node_modules/@fontsource-variable/inter/LICENSE",
		"node_modules/dexie/NOTICE",
	]) {
		assert.ok(
			supplemental.includes((await readFile(file, "utf8")).trim()),
			file,
		);
	}
});
