// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadDevProxyConfig } from "../../scripts/dev/config.ts";
import { directory } from "./support/directory.ts";

test("CLI YAML uses ordinary YAML syntax and the selected remote's transport", (t) => {
	const path = directory(t);
	writeFileSync(
		join(path, "config.yml"),
		`default-remote: demo\nremotes:\n  demo: {addr: 'https://unavailable.example,https://incus.example', last_working_address: 'https://incus.example', public: true}\n  other: &local {addr: 'unix:///run/incus.sock'}\n  alias: *local\n  short: {addr: 'unix:/run/incus-short.sock'}\n  default-socket: {addr: 'unix:'}\n`,
	);
	const base = { INCUS_CONF: path, INCUS_REMOTE: "other" };
	const selected = loadDevProxyConfig(base, ["--remote=demo"]);
	assert.equal(selected.api.origin, "https://incus.example");
	assert.equal(selected.tls.cert, undefined);
	assert.equal(loadDevProxyConfig(base).socketPath, "/run/incus.sock");
	assert.equal(
		loadDevProxyConfig({ INCUS_CONF: path }, ["--remote", "alias"]).socketPath,
		"/run/incus.sock",
	);
	assert.equal(
		loadDevProxyConfig(base, ["--remote", "short"]).socketPath,
		"/run/incus-short.sock",
	);
	assert.equal(
		loadDevProxyConfig({ ...base, INCUS_SOCKET: "/custom/socket" }, [
			"--remote",
			"default-socket",
		]).socketPath,
		"/custom/socket",
	);
	assert.throws(
		() => loadDevProxyConfig(base, ["--remote", "missing"]),
		/not configured/,
	);
	assert.throws(
		() => loadDevProxyConfig({ ...base, DEV_PROXY_HOST: "0.0.0.0" }),
		/loopback/,
	);
	writeFileSync(
		join(path, "config.yml"),
		"remotes: {demo: {addr: 'https://one', addr: 'https://two'}}",
	);
	assert.throws(
		() => loadDevProxyConfig({ INCUS_CONF: path }),
		/Invalid Incus configuration/,
	);
});

test("a missing CLI file retains the built-in local socket and validates options", (t) => {
	const env = { INCUS_CONF: directory(t), INCUS_DIR: "/opt/incus" };
	assert.equal(
		loadDevProxyConfig(env).socketPath,
		join("/opt/incus", "unix.socket"),
	);
	assert.equal(
		loadDevProxyConfig({ ...env, INCUS_SOCKET: "/custom/socket" }).socketPath,
		"/custom/socket",
	);
	assert.throws(
		() => loadDevProxyConfig({ ...env, DEV_PROXY_PORT: "70000" }),
		/DEV_PROXY_PORT/,
	);
	assert.throws(() => loadDevProxyConfig(env, ["--remote"]), /remote name/);
});

test("platform configuration discovery preserves legacy CLI remotes and their credentials without moving files", (t) => {
	for (const platform of ["win32", "darwin", "linux"] as const) {
		const root = directory(t);
		const home = join(root, "home");
		const legacy = join(home, ".config", "incus");
		const env = {
			APPDATA: join(root, "appdata"),
			XDG_CONFIG_HOME: join(root, "xdg"),
			INCUS_GLOBAL_CONF: join(root, "global"),
		};
		const native =
			platform === "win32"
				? join(env.APPDATA, "incus")
				: platform === "darwin"
					? join(home, "Library", "Application Support", "incus")
					: join(env.XDG_CONFIG_HOME, "incus");
		const write = (path: string, name: string) => {
			mkdirSync(path, { recursive: true });
			writeFileSync(
				join(path, "config.yml"),
				`default-remote: ${name}\nremotes:\n  ${name}: {addr: 'https://${name}.example', auth_type: tls}\n`,
			);
			writeFileSync(join(path, "client.crt"), `${name} fixture certificate`);
			writeFileSync(join(path, "client.key"), `${name} fixture key`);
		};
		write(legacy, "legacy");
		const old = loadDevProxyConfig(env, [], { platform, home });
		assert.equal(old.remote, "legacy");
		assert.equal(old.configurationFile, join(legacy, "config.yml"));
		assert.equal(old.api.origin, "https://legacy.example");
		assert.equal(old.socketPath, undefined);
		assert.equal(old.tls.cert, "legacy fixture certificate");
		assert.equal(existsSync(join(native, "config.yml")), false);
		write(native, "native");
		const current = loadDevProxyConfig(env, [], { platform, home });
		assert.equal(current.remote, "native");
		assert.equal(current.configurationFile, join(native, "config.yml"));
		assert.equal(current.tls.cert, "native fixture certificate");
		const override = loadDevProxyConfig({ ...env, INCUS_CONF: legacy }, [], {
			platform,
			home,
		});
		assert.equal(override.remote, "legacy");
		const explicitMissing = join(root, "explicit-missing");
		assert.equal(
			loadDevProxyConfig({ ...env, INCUS_CONF: explicitMissing }, [], {
				platform,
				home,
			}).configurationFile,
			join(explicitMissing, "config.yml"),
		);
		assert.equal(existsSync(join(legacy, "config.yml")), true);
	}
});

test("default Linux and Windows-without-AppData configuration use the home directory", (t) => {
	const home = directory(t);
	const path = join(home, ".config", "incus");
	mkdirSync(path, { recursive: true });
	writeFileSync(
		join(path, "config.yml"),
		"default-remote: demo\nremotes:\n  demo: {addr: 'https://demo.example', public: true}\n",
	);
	for (const platform of ["linux", "win32"] as const) {
		const config = loadDevProxyConfig(
			{ INCUS_GLOBAL_CONF: join(home, "global") },
			[],
			{ platform, home },
		);
		assert.equal(config.remote, "demo");
		assert.equal(config.configurationFile, join(path, "config.yml"));
	}
});
