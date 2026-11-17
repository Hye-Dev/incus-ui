// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import http, {
	type IncomingMessage,
	type OutgoingHttpHeaders,
} from "node:http";
import https from "node:https";
import { Socket } from "node:net";
import type { Duplex } from "node:stream";
import type { DevProxyConfig } from "./config.ts";

const HOP_HEADERS = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

function endToEndHeaders(
	headers: IncomingMessage["headers"],
): OutgoingHttpHeaders {
	const excluded = new Set(HOP_HEADERS);
	for (const token of headers.connection?.split(",") ?? [])
		excluded.add(token.trim().toLowerCase());
	return Object.fromEntries(
		Object.entries(headers).filter(([name]) => !excluded.has(name)),
	);
}

function targetFor(
	path: string,
	config: DevProxyConfig,
): { target: URL; app: boolean } {
	if (!path.startsWith("/") || path.startsWith("//"))
		throw new Error("An origin-relative request target is required.");
	const parsed = new URL(path, "http://dev.invalid");
	if (parsed.origin !== "http://dev.invalid")
		throw new Error("Invalid request authority.");
	const app = parsed.pathname === "/ui" || parsed.pathname.startsWith("/ui/");
	const target = new URL(app ? config.app : config.api);
	target.pathname = parsed.pathname;
	target.search = parsed.search;
	return { target, app };
}

function validateBrowserRequest(request: IncomingMessage, port: number): void {
	const authority = request.headers.host;
	if (
		!authority ||
		![`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(
			authority,
		)
	)
		throw new Error(
			"The development proxy accepts only its loopback authority.",
		);
	if (
		request.headers.origin &&
		request.headers.origin !== `http://${authority}`
	)
		throw new Error(
			"Cross-origin access to the credentialed development proxy is not allowed.",
		);
	const path = request.url?.split("?")[0];
	if (
		request.headers["sec-fetch-site"] === "cross-site" &&
		path !== "/ui" &&
		!path?.startsWith("/ui/")
	)
		throw new Error("Cross-site API access is not allowed.");
}

function requestDeadline(
	request: http.ClientRequest,
	secure: boolean,
	milliseconds: number,
): void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let finished = false;
	const clear = () => clearTimeout(timer);
	const arm = () => {
		clear();
		timer = setTimeout(
			() =>
				request.destroy(
					Object.assign(
						new Error("Upstream connection or response headers timed out."),
						{ code: "ETIMEDOUT" },
					),
				),
			milliseconds,
		);
		timer.unref();
	};
	arm();
	request.on("socket", (socket) => {
		const connected = () => (finished ? arm() : clear());
		if (socket.connecting)
			socket.once(secure ? "secureConnect" : "connect", connected);
		else connected();
	});
	request.once("finish", () => {
		finished = true;
		arm();
	});
	for (const event of ["response", "upgrade", "error", "close"])
		request.once(event, clear);
}

function publicFailure(
	response: http.ServerResponse,
	code: number,
	message: string,
): void {
	if (response.headersSent) {
		response.destroy();
		return;
	}
	response.writeHead(code, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
	});
	response.end(
		JSON.stringify({ type: "error", error: message, error_code: code }),
	);
}

function connectionFailure(
	error: Error,
	app: boolean,
	config: DevProxyConfig,
): string {
	if (app)
		return "The Vite development server is unavailable. Check the terminal running npm run dev.";
	const code = (error as NodeJS.ErrnoException).code ?? "";
	if (code === "ETIMEDOUT")
		return "The Incus development proxy connection or response headers timed out. Check that the selected Incus remote is reachable.";
	if (
		config.socketPath &&
		["ENOENT", "ECONNREFUSED", "EACCES", "EPERM"].includes(code)
	)
		return "The Incus development proxy cannot open the configured Unix socket. Check INCUS_SOCKET or INCUS_DIR, or select an HTTPS remote with --remote.";
	if (
		code.includes("CERT") ||
		code.startsWith("ERR_TLS") ||
		code.startsWith("ERR_SSL")
	)
		return "The Incus development proxy TLS connection failed. Check the selected remote's server certificate and client certificate configuration.";
	if (["ENOTFOUND", "EAI_AGAIN"].includes(code))
		return "The Incus development proxy cannot resolve the configured remote address. Check the remote in incus remote list.";
	return "The Incus development proxy cannot reach the selected remote. Check that incus query <remote>:/1.0 succeeds, then retry.";
}

export function createDevProxy(config: DevProxyConfig): {
	server: http.Server;
	close(): Promise<void>;
} {
	const sockets = new Set<Duplex>();
	const apiAgent =
		config.api.protocol === "https:"
			? new https.Agent({ ...config.tls, keepAlive: true })
			: new http.Agent({ keepAlive: true });
	const appAgent = new http.Agent({ keepAlive: true });
	const server = http.createServer();
	server.requestTimeout = 0;
	server.on("connection", (socket) => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});
	const open = (request: IncomingMessage, upgrade = false) => {
		const address = server.address();
		validateBrowserRequest(
			request,
			typeof address === "object" && address ? address.port : config.port,
		);
		const { target, app } = targetFor(request.url ?? "/", config);
		const headers = endToEndHeaders(request.headers);
		headers.host = target.host;
		if (headers.origin) headers.origin = target.origin;
		if (app) {
			delete headers.authorization;
			delete headers.cookie;
		}
		if (upgrade) {
			headers.connection = "Upgrade";
			headers.upgrade = "websocket";
		}
		const secure = target.protocol === "https:";
		const outbound = (secure ? https : http).request(target, {
			method: request.method,
			headers,
			agent: app ? appAgent : apiAgent,
			...(!app && config.socketPath ? { socketPath: config.socketPath } : {}),
		});
		requestDeadline(outbound, secure, config.deadlineMs);
		return { outbound, target, app };
	};
	const responseHeaders = (
		upstream: IncomingMessage,
		target: URL,
		app: boolean,
	) => {
		const headers = endToEndHeaders(upstream.headers);
		if (upstream.headers.location) {
			try {
				const location = new URL(upstream.headers.location, target);
				if (location.origin === target.origin)
					headers.location = `${location.pathname}${location.search}${location.hash}`;
			} catch {
				/* Preserve upstream Location values that are not URLs. */
			}
		}
		if (app && config.isolation)
			Object.assign(headers, {
				"cross-origin-opener-policy": "same-origin",
				"cross-origin-embedder-policy": "require-corp",
				"cross-origin-resource-policy": "same-origin",
			});
		return headers;
	};
	server.on("request", (request, response) => {
		let opened: ReturnType<typeof open>;
		try {
			opened = open(request);
		} catch {
			publicFailure(
				response,
				403,
				"The development proxy rejected this request. Use its printed loopback address from the same browser origin.",
			);
			return;
		}
		const { outbound, target, app } = opened;
		outbound.once("response", (upstream) => {
			response.writeHead(
				upstream.statusCode ?? 502,
				responseHeaders(upstream, target, app),
			);
			upstream.once("error", () => response.destroy());
			response.once("close", () => upstream.destroy());
			upstream.pipe(response);
		});
		outbound.once("error", (error) =>
			publicFailure(response, 502, connectionFailure(error, app, config)),
		);
		request.once("aborted", () => outbound.destroy());
		request.once("error", () => outbound.destroy());
		response.once("close", () => outbound.destroy());
		request.pipe(outbound);
	});
	server.on("upgrade", (request, client, head) => {
		if (!(client instanceof Socket)) {
			client.destroy();
			return;
		}
		client.pause();
		const reply = new http.ServerResponse(request);
		reply.assignSocket(client);
		let opened: ReturnType<typeof open>;
		try {
			if (request.headers.upgrade?.toLowerCase() !== "websocket")
				throw new Error("Only WebSocket upgrades are supported.");
			opened = open(request, true);
		} catch {
			publicFailure(
				reply,
				403,
				"The development proxy rejected this WebSocket request. Use its printed loopback address from the same browser origin.",
			);
			return;
		}
		const { outbound, target, app } = opened;
		let upgraded = false;
		client.once("error", () => outbound.destroy());
		client.once("close", () => outbound.destroy());
		outbound.once("error", (error) => {
			if (!upgraded)
				publicFailure(reply, 502, connectionFailure(error, app, config));
		});
		outbound.once("response", (upstream) => {
			reply.shouldKeepAlive = false;
			reply.writeHead(
				upstream.statusCode ?? 502,
				responseHeaders(upstream, target, app),
			);
			upstream.once("error", () => client.destroy());
			upstream.pipe(reply);
		});
		outbound.once("upgrade", (upstream, peer, peerHead) => {
			upgraded = true;
			const headers = responseHeaders(upstream, target, app);
			headers.connection = "Upgrade";
			headers.upgrade = "websocket";
			reply.writeHead(101, headers);
			reply.flushHeaders();
			reply.detachSocket(client);
			sockets.add(peer);
			const destroy = () => {
				client.destroy();
				peer.destroy();
			};
			peer.once("close", () => {
				sockets.delete(peer);
				client.destroy();
			});
			client.once("close", () => peer.destroy());
			peer.once("error", destroy);
			client.once("error", destroy);
			const peerReady = head.length === 0 || peer.write(head);
			const clientReady = peerHead.length === 0 || client.write(peerHead);
			client.pipe(peer);
			peer.pipe(client);
			if (!peerReady) {
				client.pause();
				peer.once("drain", () => client.resume());
			}
			if (!clientReady) {
				peer.pause();
				client.once("drain", () => peer.resume());
			}
		});
		outbound.end();
	});
	return {
		server,
		async close() {
			const closed = new Promise<void>((resolve) =>
				server.close(() => resolve()),
			);
			for (const socket of sockets) socket.destroy();
			apiAgent.destroy();
			appAgent.destroy();
			await closed;
		},
	};
}
