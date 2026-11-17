// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";
import { runtimeManifest } from "../../scripts/build/runtime.ts";

test("development reload separates UI builds from shared read-definition compatibility", async () => {
	const root = await mkdtemp(join(tmpdir(), "incus-runtime-build-"));
	const files = {
		"index.html": "<!doctype html><title>Runtime identity</title>",
		"package-lock.json": "{}",
		"public/vem-runtime.js": "// bootstrap",
		"src/host/owner.ts": "export const revision = 1;",
		"src/screen.tsx": "export const title = 'Screen';",
		"shared/state/src/index.ts": "export const hook = 'original';",
		"shared/components/src/index.ts": "export const component = 'original';",
		"shared/data/src/runtime.ts": "export const revision = 1;",
		"shared/data/src/resources/things/read.ts":
			"export const rule = 'original';",
		"node_modules/@hyecompany/vem-data/dist/runtime.js":
			"export const revision = 1;",
	};
	for (const [file, content] of Object.entries(files)) {
		await mkdir(join(root, file, ".."), { recursive: true });
		await writeFile(join(root, file), content);
	}
	const server = await createServer({
		root,
		configFile: false,
		plugins: [runtimeManifest()],
		base: "/ui/",
		server: { host: "127.0.0.1", port: 0 },
		logLevel: "silent",
	});
	try {
		await server.listen();
		const origin = server.resolvedUrls?.local[0];
		assert.ok(origin);
		const current = async () => {
			await fetch(origin, { headers: { accept: "text/html" } });
			const manifest = await fetch(
				new URL("vem-runtime-manifest.json", origin),
			).then((response) => response.json());
			const module = await fetch(
				new URL("@id/__x00__virtual:incus-build", origin),
			).then((response) => response.text());
			assert.ok(
				module.includes(JSON.stringify(manifest.build)),
				"the page and new owner must use the same build identity",
			);
			assert.ok(Number.isSafeInteger(manifest.definitions));
			assert.ok(
				module.includes(String(manifest.definitions)),
				"the page and owner manifest must use the same definition identity",
			);
			return { build: manifest.build, definitions: manifest.definitions };
		};
		const first = await current();
		await writeFile(
			join(root, "src/host/owner.ts"),
			"export const revision = 2;",
		);
		const second = await current();
		assert.notEqual(second.build, first.build);
		assert.equal(second.definitions, first.definitions);
		await writeFile(
			join(root, "src/screen.tsx"),
			"export const title = 'Changed screen';",
		);
		const ui = await current();
		assert.notEqual(ui.build, second.build);
		assert.equal(ui.definitions, second.definitions);
		for (const layer of ["state", "components"]) {
			const previous = await current();
			await writeFile(
				join(root, `shared/${layer}/src/index.ts`),
				"export const revision = 'changed';",
			);
			const changed = await current();
			assert.notEqual(changed.build, previous.build);
			assert.equal(changed.definitions, previous.definitions);
		}
		await writeFile(
			join(root, "node_modules/@hyecompany/vem-data/dist/runtime.js"),
			"export const revision = 2;",
		);
		const third = await current();
		assert.notEqual(third.build, ui.build);
		assert.notEqual(third.definitions, ui.definitions);
		await writeFile(
			join(root, "shared/data/src/runtime.ts"),
			"export const revision = 2;",
		);
		const fourth = await current();
		assert.notEqual(fourth.build, third.build);
		assert.notEqual(fourth.definitions, third.definitions);
		await writeFile(
			join(root, "shared/data/src/resources/things/read.ts"),
			"export const rule = 'changed';",
		);
		const changedRule = await current();
		assert.notEqual(changedRule.build, fourth.build);
		assert.notEqual(changedRule.definitions, fourth.definitions);
		assert.deepEqual(
			await current(),
			changedRule,
			"a reload without changed code preserves both identities",
		);
	} finally {
		await server.close();
		assert.equal(dirname(resolve(root)), resolve(tmpdir()));
		assert.ok(basename(root).startsWith("incus-runtime-build-"));
		await rm(root, { recursive: true, force: true });
	}
});
