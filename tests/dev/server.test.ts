// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net, { type AddressInfo, type Socket } from "node:net";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import {
	type DevProxyConfig,
	loadDevProxyConfig,
} from "../../scripts/dev/config.ts";
import { createDevProxy } from "../../scripts/dev/server.ts";
import { directory } from "./support/directory.ts";

async function upstream(
	t: TestContext,
	server: http.Server | https.Server,
): Promise<URL> {
	const sockets = new Set<Socket>();
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(async () => {
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	return new URL(
		`${server instanceof https.Server ? "https" : "http"}://127.0.0.1:${(server.address() as AddressInfo).port}`,
	);
}

async function proxy(
	t: TestContext,
	api: URL,
	options: Partial<DevProxyConfig> = {},
): Promise<URL> {
	const instance = createDevProxy({
		host: "127.0.0.1",
		port: 0,
		api,
		app: api,
		remote: "test",
		tls: {},
		deadlineMs: 1000,
		isolation: false,
		notices: [],
		...options,
	});
	instance.server.listen(0, "127.0.0.1");
	await once(instance.server, "listening");
	t.after(() => instance.close());
	return new URL(
		`http://127.0.0.1:${(instance.server.address() as AddressInfo).port}`,
	);
}

function request(
	base: URL,
	path: string,
	headers: http.OutgoingHttpHeaders = {},
): Promise<{
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
}> {
	return new Promise((resolve, reject) => {
		const outbound = http.get(
			{ hostname: base.hostname, port: base.port, path, headers, agent: false },
			(response) => {
				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("error", reject);
				response.on("end", () =>
					resolve({
						status: response.statusCode ?? 0,
						headers: response.headers,
						body: Buffer.concat(chunks).toString(),
					}),
				);
			},
		);
		outbound.on("error", reject);
	});
}

test("routing keeps one authority and keeps API credentials out of Vite", async (t) => {
	const handler: http.RequestListener = (req, res) =>
		res.end(
			JSON.stringify({
				path: req.url,
				host: req.headers.host,
				authorization: req.headers.authorization,
				cookie: req.headers.cookie,
				hop: req.headers["x-private-hop"],
			}),
		);
	const api = await upstream(t, http.createServer(handler));
	const app = await upstream(t, http.createServer(handler));
	const base = await proxy(t, api, { app, isolation: true });
	const headers = {
		authorization: "Bearer fixture",
		cookie: "session=fixture",
		connection: "x-private-hop",
		"x-private-hop": "private",
	};
	const apiResult = await request(
		base,
		"/1.0/instances?project=a%26b",
		headers,
	);
	assert.deepEqual(JSON.parse(apiResult.body), {
		path: "/1.0/instances?project=a%26b",
		host: api.host,
		authorization: "Bearer fixture",
		cookie: "session=fixture",
	});
	const appResult = await request(base, "/ui/assets/app.js", headers);
	assert.deepEqual(JSON.parse(appResult.body), {
		path: "/ui/assets/app.js",
		host: app.host,
	});
	assert.equal(appResult.headers["cross-origin-opener-policy"], "same-origin");
	assert.equal(apiResult.headers["cross-origin-opener-policy"], undefined);
	assert.equal((await request(base, "//example.invalid/1.0")).status, 403);
	assert.equal((await request(base, "http://example.invalid/1.0")).status, 403);
	assert.equal(
		(await request(base, "/1.0", { host: "example.invalid" })).status,
		403,
	);
	assert.equal(
		(await request(base, "/1.0", { origin: "https://example.invalid" })).status,
		403,
	);
});

test("response status, conditional headers and redirects retain their meaning", async (t) => {
	const api = await upstream(
		t,
		http.createServer((req, res) => {
			if (req.url === "/external") {
				res.writeHead(302, { location: "https://identity.example/login" });
				res.end();
				return;
			}
			if (req.url === "/redirect") {
				res.writeHead(307, {
					location: `http://${req.headers.host}/ui/?return=1`,
				});
				res.end();
				return;
			}
			res.writeHead(412, {
				"content-type": "application/json",
				etag: '"new"',
				"set-cookie": ["one=1; HttpOnly", "two=2; SameSite=Strict"],
			});
			res.end(
				JSON.stringify({ type: "error", error: req.headers["if-match"] }),
			);
		}),
	);
	const base = await proxy(t, api);
	const result = await request(base, "/1.0/test", { "if-match": '"old"' });
	assert.equal(result.status, 412);
	assert.equal(result.headers.etag, '"new"');
	assert.equal(result.headers["set-cookie"]?.length, 2);
	assert.deepEqual(JSON.parse(result.body), { type: "error", error: '"old"' });
	assert.equal(
		(await request(base, "/redirect")).headers.location,
		"/ui/?return=1",
	);
	assert.equal(
		(await request(base, "/external")).headers.location,
		"https://identity.example/login",
	);
});

test("a binary upload can take longer than the connection deadline", async (t) => {
	const payload = Buffer.alloc(64 * 1024, 0xa7);
	const expected = createHash("sha256")
		.update(Buffer.concat(Array(6).fill(payload)))
		.digest("hex");
	const api = await upstream(
		t,
		http.createServer((req, res) => {
			assert.equal(req.headers["x-incus-mode"], "0644");
			const digest = createHash("sha256");
			req.on("data", (chunk: Buffer) => digest.update(chunk));
			req.on("end", () => res.end(digest.digest("hex")));
		}),
	);
	const base = await proxy(t, api, { deadlineMs: 100 });
	const result = new Promise<string>((resolve, reject) => {
		const upload = http.request(
			new URL("/1.0/instances/test/files?path=%2Ftmp%2Ffile", base),
			{
				method: "POST",
				headers: {
					"content-type": "application/octet-stream",
					"x-incus-mode": "0644",
				},
			},
			(response) => {
				let text = "";
				response.on("data", (chunk) => {
					text += chunk;
				});
				response.on("end", () => resolve(text));
				response.on("error", reject);
			},
		);
		upload.on("error", reject);
		void (async () => {
			for (let index = 0; index < 6; index++) {
				upload.write(payload);
				await delay(40);
			}
			upload.end();
		})();
	});
	assert.equal(await result, expected);
});

test("an upstream that never supplies response headers produces a bounded failure", async (t) => {
	const api = await upstream(
		t,
		http.createServer(() => undefined),
	);
	const base = await proxy(t, api, { deadlineMs: 40 });
	const result = await request(base, "/1.0");
	assert.equal(result.status, 502);
	assert.match(result.body, /timed out/);
	assert.match(result.headers["content-type"] ?? "", /application\/json/);
	assert.equal(JSON.parse(result.body).type, "error");
	assert.equal(JSON.parse(result.body).error_code, 502);
});

test("missing local sockets expose safe actionable Incus errors without raw filesystem details", async (t) => {
	const root = directory(t);
	const socketPath =
		process.platform === "win32"
			? `\\\\.\\pipe\\incus-secret-fixture-${Date.now()}`
			: join(root, "secret-fixture.sock");
	const base = await proxy(t, new URL("http://localhost"), { socketPath });
	const result = await request(base, "/1.0");
	assert.equal(result.status, 502);
	const failure = JSON.parse(result.body);
	assert.equal(failure.type, "error");
	assert.equal(failure.error_code, 502);
	assert.match(failure.error, /Unix socket/);
	assert.match(failure.error, /--remote/);
	assert.equal(result.body.includes("secret-fixture"), false);
	assert.equal(result.body.includes(root), false);
});

test("abandoning a request releases its pending upstream response", {
	timeout: 2000,
}, async (t) => {
	let accepted = () => {};
	let disconnected = () => {};
	const started = new Promise<void>((resolve) => {
		accepted = resolve;
	});
	const released = new Promise<void>((resolve) => {
		disconnected = resolve;
	});
	const api = await upstream(
		t,
		http.createServer((_req, res) => {
			res.once("close", disconnected);
			accepted();
		}),
	);
	const base = await proxy(t, api);
	const client = http.get(new URL("/1.0", base));
	client.on("error", () => undefined);
	await started;
	client.destroy();
	await released;
});

test("a local remote uses its socket instead of a network authority", async (t) => {
	const path = directory(t);
	const socketPath =
		process.platform === "win32"
			? `\\\\.\\pipe\\incus-proxy-${process.pid}-${Date.now()}`
			: join(path, "incus.sock");
	const server = http.createServer((_req, res) => res.end("local transport"));
	server.listen(socketPath);
	await once(server, "listening");
	t.after(async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	const base = await proxy(
		t,
		new URL("http://not-a-network-destination.invalid"),
		{ socketPath },
	);
	assert.equal((await request(base, "/1.0")).body, "local transport");
});

async function upgradedExchange(base: URL, payload: Buffer): Promise<Buffer> {
	const socket = net.connect(Number(base.port), base.hostname);
	await once(socket, "connect");
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		const timeout = setTimeout(
			() => socket.destroy(new Error("Upgrade fixture timed out")),
			3000,
		);
		socket.on("error", reject);
		socket.on("close", () => clearTimeout(timeout));
		socket.on("data", (chunk: Buffer) => {
			chunks.push(chunk);
			const received = Buffer.concat(chunks);
			const split = received.indexOf("\r\n\r\n");
			if (split !== -1 && received.length >= split + 4 + payload.length + 1) {
				assert.match(received.subarray(0, split).toString(), /^HTTP\/1.1 101/);
				socket.destroy();
				resolve(received.subarray(split + 4));
			}
		});
		socket.write(
			Buffer.concat([
				Buffer.from(
					`GET /1.0/events HTTP/1.1\r\nHost: ${base.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nOrigin: ${base.origin}\r\n\r\n`,
				),
				payload,
			]),
		);
	});
}

test("an upgraded stream preserves both handshake remainders and binary data", async (t) => {
	const server = http.createServer();
	let notifyClosed = () => {};
	const closed = new Promise<void>((resolve) => {
		notifyClosed = resolve;
	});
	server.on("upgrade", (req, socket, head) => {
		assert.equal(req.headers.origin, `http://${req.headers.host}`);
		socket.write(
			"HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\nG",
		);
		if (head.length) socket.write(head);
		socket.on("data", (chunk) => socket.write(chunk));
		socket.on("end", () => socket.end());
		socket.on("close", notifyClosed);
	});
	const api = await upstream(t, server);
	const base = await proxy(t, api);
	const payload = Buffer.alloc(1024 * 1024, 0xe3);
	assert.deepEqual(
		await upgradedExchange(base, payload),
		Buffer.concat([Buffer.from("G"), payload]),
	);
	await closed;
});

test("a refused upgrade remains an HTTP response", async (t) => {
	const server = http.createServer();
	server.on("upgrade", (_req, socket) =>
		socket.end(
			"HTTP/1.1 403 Forbidden\r\nContent-Length: 6\r\nConnection: close\r\n\r\nDenied",
		),
	);
	const base = await proxy(t, await upstream(t, server));
	const result = await request(base, "/1.0/events", {
		connection: "Upgrade",
		upgrade: "websocket",
	});
	assert.equal(result.status, 403);
	assert.equal(result.body, "Denied");
});

test("the configured TLS pin identifies the server and the CLI certificate authenticates the request", async (t) => {
	const path = directory(t);
	const bundled = join(
		process.env.ProgramFiles || "C:\\Program Files",
		"Git",
		"usr",
		"bin",
		"openssl.exe",
	);
	const openssl =
		process.platform === "win32" && existsSync(bundled) ? bundled : "openssl";
	try {
		execFileSync(openssl, ["version"], { stdio: "ignore", windowsHide: true });
	} catch {
		t.skip("OpenSSL is required to generate an isolated TLS fixture.");
		return;
	}
	execFileSync(
		openssl,
		[
			"req",
			"-x509",
			"-newkey",
			"rsa:2048",
			"-nodes",
			"-days",
			"1",
			"-subj",
			"/CN=incus-fixture.invalid",
			"-addext",
			"subjectAltName=DNS:incus-fixture.invalid",
			"-keyout",
			join(path, "client.key"),
			"-out",
			join(path, "client.crt"),
		],
		{ stdio: "ignore", windowsHide: true },
	);
	const key = readFileSync(join(path, "client.key"));
	const cert = readFileSync(join(path, "client.crt"));
	mkdirSync(join(path, "clientcerts"));
	writeFileSync(join(path, "clientcerts", "test.key"), key);
	writeFileSync(join(path, "clientcerts", "test.crt"), cert);
	writeFileSync(join(path, "client.key"), "unused global key");
	writeFileSync(join(path, "client.crt"), "unused global certificate");
	const secure = https.createServer(
		{ key, cert, ca: cert, requestCert: true, rejectUnauthorized: true },
		(_req, res) => res.end("authenticated"),
	);
	const api = await upstream(t, secure);
	mkdirSync(join(path, "servercerts"));
	writeFileSync(join(path, "servercerts", "test.crt"), cert);
	writeFileSync(
		join(path, "config.yml"),
		`default-remote: test\nremotes:\n  test: {addr: '${api.origin}'}\n`,
	);
	const config = loadDevProxyConfig({ INCUS_CONF: path });
	assert.equal(
		(await request(await proxy(t, api, { tls: config.tls }), "/1.0")).body,
		"authenticated",
	);
	assert.equal((await request(await proxy(t, api), "/1.0")).status, 502);
});
