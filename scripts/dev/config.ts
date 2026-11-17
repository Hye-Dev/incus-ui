// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConnectionOptions } from "node:tls";
import { parseDocument } from "yaml";

type Environment = Readonly<Record<string, string | undefined>>;
type Mapping = Record<string, unknown>;

export interface DevProxyConfig {
	host: string;
	port: number;
	app: URL;
	api: URL;
	remote: string;
	configurationFile?: string;
	socketPath?: string;
	tls: Pick<ConnectionOptions, "cert" | "key" | "ca" | "checkServerIdentity">;
	deadlineMs: number;
	isolation: boolean;
	notices: string[];
}

function mapping(value: unknown, label: string): Mapping {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new Error(`${label} must be a YAML mapping.`);
	return value as Mapping;
}

function optionalString(value: unknown, label: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") throw new Error(`${label} must be a string.`);
	return value;
}

function readOptional(file: string): string | undefined {
	try {
		return readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

function positiveInteger(
	value: string | undefined,
	fallback: number,
	label: string,
	max = Number.MAX_SAFE_INTEGER,
): number {
	if (!value) return fallback;
	const number = Number(value);
	if (!Number.isSafeInteger(number) || number < 1 || number > max)
		throw new Error(`${label} must be an integer between 1 and ${max}.`);
	return number;
}

function remoteArgument(args: readonly string[]): string | undefined {
	let selected: string | undefined;
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		let value: string | undefined;
		if (argument === "--remote") value = args[++index];
		else if (argument?.startsWith("--remote=")) value = argument.slice(9);
		else throw new Error(`Unknown option: ${argument}`);
		if (!value || value.startsWith("--") || selected !== undefined)
			throw new Error("Supply --remote exactly once with a remote name.");
		selected = value;
	}
	return selected;
}

function cliDirectory(
	env: Environment,
	location: { platform: NodeJS.Platform; home: string },
): string {
	if (env.INCUS_CONF) return env.INCUS_CONF;
	const { home, platform } = location;
	const base =
		platform === "win32"
			? env.APPDATA || join(home, ".config")
			: platform === "darwin"
				? join(home, "Library", "Application Support")
				: env.XDG_CONFIG_HOME || join(home, ".config");
	const native = join(base, "incus");
	if (readOptional(join(native, "config.yml")) !== undefined) return native;
	const legacy = join(home, ".config", "incus");
	if (
		legacy !== native &&
		readOptional(join(legacy, "config.yml")) !== undefined
	)
		return legacy;
	return native;
}

function configuration(directory: string): Mapping {
	const document = parseDocument(
		readOptional(join(directory, "config.yml")) || "{}",
	);
	if (document.errors.length)
		throw new Error(
			`Invalid Incus configuration: ${document.errors[0].message}`,
		);
	return mapping(
		document.toJS({ maxAliasCount: 100 }) ?? {},
		"Incus configuration",
	);
}

export function loadDevProxyConfig(
	env: Environment = process.env,
	args: readonly string[] = [],
	location = { platform: process.platform, home: homedir() },
): DevProxyConfig {
	const host = env.DEV_PROXY_HOST || "127.0.0.1";
	if (!["127.0.0.1", "::1", "localhost"].includes(host))
		throw new Error(
			"DEV_PROXY_HOST must be a loopback address; this proxy uses your Incus credentials.",
		);
	const directory = cliDirectory(env, location);
	const globalDirectory = env.INCUS_GLOBAL_CONF || "/etc/incus";
	const config = configuration(directory);
	const remotes = mapping(config.remotes ?? {}, "remotes");
	const globalRemotes = mapping(
		configuration(globalDirectory).remotes ?? {},
		"global remotes",
	);
	const remote =
		remoteArgument(args) ||
		env.INCUS_REMOTE ||
		optionalString(config["default-remote"], "default-remote") ||
		"local";
	if (
		!remote ||
		remote.includes("/") ||
		remote.includes("\\") ||
		remote === "." ||
		remote === ".."
	)
		throw new Error(
			"The remote name must be a single configuration entry name.",
		);
	const global =
		!Object.hasOwn(remotes, remote) && Object.hasOwn(globalRemotes, remote);
	const entry =
		remote === "local"
			? { addr: "unix://" }
			: global
				? globalRemotes[remote]
				: remotes[remote];
	if (entry === undefined)
		throw new Error(
			`Incus remote "${remote}" is not configured; run incus remote list.`,
		);
	const settings = mapping(entry, `remote ${remote}`);
	const protocol = optionalString(settings.protocol, "remote protocol");
	if (protocol && protocol !== "incus")
		throw new Error(
			`Remote "${remote}" is not an Incus API remote (${protocol}).`,
		);
	const addresses =
		optionalString(settings.addr, "remote addr")
			?.split(",")
			.map((value) => value.trim())
			.filter(Boolean) ?? [];
	const lastWorking = optionalString(
		settings.last_working_address,
		"last_working_address",
	);
	const address =
		lastWorking && addresses.includes(lastWorking) ? lastWorking : addresses[0];
	if (!address) throw new Error(`Remote "${remote}" has no address.`);
	const auth = optionalString(settings.auth_type, "remote auth_type");
	if (settings.public !== undefined && typeof settings.public !== "boolean")
		throw new Error("remote public must be a boolean.");
	const result: DevProxyConfig = {
		host,
		port: positiveInteger(env.DEV_PROXY_PORT, 3001, "DEV_PROXY_PORT", 65535),
		app: new URL(
			`http://127.0.0.1:${positiveInteger(env.DEV_PROXY_APP_PORT, 5173, "DEV_PROXY_APP_PORT", 65535)}`,
		),
		api: new URL("http://localhost"),
		remote,
		configurationFile: join(directory, "config.yml"),
		tls: {},
		deadlineMs: positiveInteger(
			env.DEV_PROXY_CONNECT_TIMEOUT_MS,
			10_000,
			"DEV_PROXY_CONNECT_TIMEOUT_MS",
		),
		isolation: env.DEV_PROXY_CROSS_ORIGIN_ISOLATION === "1",
		notices: [],
	};
	if (address.startsWith("unix:")) {
		const socket = address.slice(5);
		result.socketPath =
			(socket.startsWith("//") ? socket.slice(2) : socket) ||
			env.INCUS_SOCKET ||
			join(env.INCUS_DIR || "/var/lib/incus", "unix.socket");
		return result;
	}
	result.api = new URL(
		address.includes("://") ? address : `https://${address}`,
	);
	if (
		!["http:", "https:"].includes(result.api.protocol) ||
		result.api.username ||
		result.api.password ||
		result.api.pathname !== "/" ||
		result.api.search ||
		result.api.hash
	)
		throw new Error(
			"The Incus remote must be an HTTP(S) server origin without credentials or a path.",
		);
	if (result.api.protocol === "https:") {
		const pinned = readOptional(
			join(
				global ? globalDirectory : directory,
				"servercerts",
				`${remote}.crt`,
			),
		);
		if (pinned) {
			const fingerprint = new X509Certificate(pinned).fingerprint256;
			result.tls.ca = pinned;
			result.tls.checkServerIdentity = (_hostname, certificate) =>
				certificate.fingerprint256 === fingerprint
					? undefined
					: new Error(
							"The upstream certificate does not match the configured Incus remote.",
						);
		}
		if (auth !== "oidc" && settings.public !== true) {
			const remoteCert = readOptional(
				join(directory, "clientcerts", `${remote}.crt`),
			);
			const remoteKey = readOptional(
				join(directory, "clientcerts", `${remote}.key`),
			);
			const credentialBase =
				remoteCert && remoteKey
					? join(directory, "clientcerts", remote)
					: join(directory, "client");
			const cert = readOptional(`${credentialBase}.crt`);
			const key = readOptional(`${credentialBase}.key`);
			const authority = readOptional(`${credentialBase}.ca`);
			if (Boolean(cert) !== Boolean(key))
				throw new Error(
					"Incus client.crt and client.key must both be present.",
				);
			if (key?.includes("ENCRYPTED"))
				throw new Error(
					"Encrypted CLI keys require interactive decryption; configure a dedicated unencrypted development identity.",
				);
			if (authority) result.tls.ca = pinned ? [pinned, authority] : authority;
			if (cert && key) Object.assign(result.tls, { cert, key });
			else
				result.notices.push(
					"No CLI client certificate is available; requests use browser credentials or public access.",
				);
		}
	}
	return result;
}
