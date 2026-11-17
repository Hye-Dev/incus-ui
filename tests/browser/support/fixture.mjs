// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { after } from "node:test";
import { browser } from "./browser.mjs";
import { deployment } from "./deployment.mjs";

let developmentServer;
let vite;
let cacheDir;
after(async () => {
	try {
		await vite?.close();
	} finally {
		if (cacheDir) {
			assert.equal(dirname(cacheDir), resolve("node_modules"));
			assert.ok(basename(cacheDir).startsWith(".vite-browser-"));
			await rm(cacheDir, { recursive: true, force: true });
		}
	}
});

function sharedDevelopmentServer() {
	developmentServer ??= (async () => {
		cacheDir = await mkdtemp(resolve("node_modules/.vite-browser-"));
		const { createServer } = await import("vite");
		vite = await createServer({
			mode: "test",
			cacheDir,
			server: { host: "127.0.0.1", port: 0, hmr: false },
		});
		await vite.listen();
		return vite;
	})();
	return developmentServer;
}

export async function browserFixture(
	t,
	{ development = false, ...options } = {},
) {
	let api;
	const contexts = new Set();
	const errors = [];
	t.after(async () => {
		const results = await Promise.allSettled(
			[...contexts].map((context) => context.close()),
		);
		results.push(...(await Promise.allSettled([api?.close()])));
		const failures = results.flatMap((result) =>
			result.status === "rejected" ? [result.reason] : [],
		);
		try {
			assert.deepEqual(errors, [], "Unexpected browser errors");
		} catch (error) {
			failures.push(error);
		}
		if (failures.length)
			throw new AggregateError(failures, "Browser fixture teardown failed");
	});
	const server = development ? await sharedDevelopmentServer() : undefined;
	api = await deployment({
		...options,
		...(server && {
			assetsOrigin: `http://127.0.0.1:${server.httpServer.address().port}`,
		}),
	});
	const app = await browser();
	const newContext = async (options) => {
		const context = await app.newContext(options);
		contexts.add(context);
		context.once("close", () => contexts.delete(context));
		await context.exposeBinding("reportNativeBrowserError", (_, message) => {
			errors.push(message);
		});
		await context.addInitScript(() => {
			window.addEventListener("error", (event) => {
				if (!event.error && event.message)
					window.reportNativeBrowserError(event.message);
			});
		});
		context.on("page", (page) => {
			page.on("pageerror", (error) => errors.push(error.message));
			if (development)
				page.on("console", (message) => {
					if (message.type() === "error")
						errors.push(`${message.text()} (${message.location().url})`);
				});
		});
		return context;
	};
	return {
		api,
		errors,
		newContext,
		newPage: async (options) => (await newContext(options)).newPage(),
	};
}
