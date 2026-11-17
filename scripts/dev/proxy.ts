// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadDevProxyConfig } from "./config.ts";
import { createDevProxy } from "./server.ts";

async function run(): Promise<void> {
	const config = loadDevProxyConfig(process.env, process.argv.slice(2));
	const proxy = createDevProxy(config);
	const require = createRequire(import.meta.url);
	const vite = join(
		dirname(require.resolve("vite/package.json")),
		"bin",
		"vite.js",
	);
	const child = spawn(
		process.execPath,
		[vite, "--host", "127.0.0.1", "--port", config.app.port, "--strictPort"],
		{ stdio: "inherit", windowsHide: true },
	);
	let closing = false;
	const stop = async (code: number) => {
		if (closing) return;
		closing = true;
		child.kill();
		await proxy.close();
		process.exitCode = code;
	};
	child.once("error", (error) => {
		console.error(error.message);
		void stop(1);
	});
	child.once("exit", (code) => {
		if (!closing) void stop(code ?? 1);
	});
	proxy.server.once("error", (error) => {
		console.error(error.message);
		void stop(1);
	});
	process.once("SIGINT", () => void stop(130));
	process.once("SIGTERM", () => void stop(143));
	proxy.server.listen(config.port, config.host, () => {
		const host = config.host === "::1" ? "[::1]" : config.host;
		console.log(
			`Incus remote: ${config.remote} (${config.socketPath ?? config.api.origin})`,
		);
		console.log(`Incus configuration: ${config.configurationFile}`);
		for (const notice of config.notices) console.log(notice);
		console.log(`Open http://${host}:${config.port}/ui/`);
	});
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	run().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
