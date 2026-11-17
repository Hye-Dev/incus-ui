// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
	createServer,
	request as requestHttp,
	ServerResponse,
} from "node:http";
import { extname, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { matchesIncusFilter } from "../../../shared/data/tests/support/filter.ts";
import { clientBundle } from "./client.mjs";

// These wire cases follow Incus v7.6 handlers; they are not a simulated data runtime.
export async function deployment({
	trusted = true,
	assetsOrigin,
	ownerBuild,
	discoveryUnavailable = false,
	projectNames = ["default"],
	projectDescriptions = {},
	projectFiltering = true,
} = {}) {
	const root = resolve("dist");
	const requests = [];
	const sockets = new WebSocketServer({ noServer: true });
	const developmentSockets = new Set();
	let eventsEnabled = true;
	const projects = new Set(projectNames);
	let discoveryReadGate;
	let projectReadGate;
	let projectDetailGate;
	let projectsUnavailable = false;
	let projectListDenied = false;
	const deniedProjects = new Set();
	const project = (name) => ({
		name,
		description: projectDescriptions[name] ?? `${name} project`,
		config: { "features.images": "true", "features.profiles": "true" },
		used_by: [],
	});
	const broadcast = (type, metadata, project = "default") => {
		for (const peer of sockets.clients)
			peer.send(
				JSON.stringify({
					type,
					project,
					timestamp: new Date().toISOString(),
					metadata,
				}),
			);
	};
	const send = (response, metadata, code = 200, headers = {}) => {
		response.writeHead(code, {
			"content-type": "application/json",
			...headers,
		});
		response.end(
			JSON.stringify({
				type: "sync",
				status: "Success",
				status_code: 200,
				metadata,
			}),
		);
	};
	const fail = (response, code, error) => {
		response.writeHead(code, { "content-type": "application/json" });
		response.end(JSON.stringify({ type: "error", error_code: code, error }));
	};
	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url, "http://localhost");
			if (url.pathname === "/ui/__test-client.js") {
				response.writeHead(200, { "content-type": "text/javascript" });
				response.end(await clientBundle());
				return;
			}
			if (url.pathname === "/ui/__test-compatibility.json") {
				response.writeHead(200, { "content-type": "application/json" });
				response.end(
					await readFile(resolve(root, "vem-runtime-manifest.json")),
				);
				return;
			}
			if (url.pathname.startsWith("/1.0"))
				requests.push({
					method: request.method,
					path: url.pathname,
					query: url.search,
				});
			if (url.pathname === "/1.0" && discoveryReadGate)
				await discoveryReadGate.promise;
			if (url.pathname === "/1.0" && discoveryUnavailable)
				return fail(
					response,
					502,
					"The Incus development proxy cannot reach the selected remote.",
				);
			if (url.pathname === "/1.0")
				return send(response, {
					auth: trusted ? "trusted" : "untrusted",
					auth_methods: ["tls"],
					api_version: "1.0",
					api_status: "stable",
					api_extensions: trusted
						? [
								"projects",
								"instances",
								"instance_state",
								"resources",
								...(projectFiltering ? ["api_filtering_extended"] : []),
							]
						: undefined,
					public: false,
					config: trusted
						? { "user.ui.title": "Public title", "core.https_address": ":8443" }
						: { "user.ui.title": "Public title" },
					...(trusted
						? {
								auth_user_name: "test-certificate",
								auth_user_method: "tls",
								environment: { server_version: "7.6" },
							}
						: {}),
				});
			if (/^\/1\.0\/projects(?:\/|$)/.test(url.pathname)) {
				if (projectReadGate) await projectReadGate.promise;
				if (
					projectDetailGate &&
					(url.pathname.startsWith("/1.0/projects/") ||
						url.searchParams.has("recursion"))
				)
					await projectDetailGate.promise;
				if (projectsUnavailable)
					return fail(response, 503, "Projects are unavailable");
			}
			if (url.pathname === "/1.0/projects") {
				const visible = [...projects].filter(
					(name) =>
						!deniedProjects.has(name) &&
						matchesIncusFilter(project(name), url.searchParams.get("filter")),
				);
				return trusted && !projectListDenied
					? send(
							response,
							url.searchParams.has("recursion")
								? visible.map(project)
								: visible.map(
										(name) => `/1.0/projects/${encodeURIComponent(name)}`,
									),
						)
					: fail(response, 403, "Forbidden");
			}
			if (url.pathname.startsWith("/1.0/projects/")) {
				const name = decodeURIComponent(
					url.pathname.slice("/1.0/projects/".length),
				);
				if (!trusted || deniedProjects.has(name))
					return fail(response, 403, "Forbidden");
				return projects.has(name)
					? send(response, project(name))
					: fail(response, 404, "Project not found");
			}
			if (url.pathname.startsWith("/1.0"))
				return fail(response, 404, "No fixture for this API request");
			if (assetsOrigin) {
				const asset = await fetch(new URL(request.url, assetsOrigin));
				response.writeHead(asset.status, {
					"content-type":
						asset.headers.get("content-type") ?? "application/octet-stream",
					...(asset.headers.has("service-worker-allowed")
						? {
								"service-worker-allowed": asset.headers.get(
									"service-worker-allowed",
								),
							}
						: {}),
				});
				response.end(Buffer.from(await asset.arrayBuffer()));
				return;
			}
			const relative = url.pathname.replace(/^\/ui\/?/, "");
			const path = resolve(root, relative || "index.html");
			if (path !== root && !path.startsWith(root + sep))
				return fail(response, 400, "Invalid path");
			let file;
			try {
				file = await readFile(path);
			} catch {
				file = await readFile(resolve(root, "index.html"));
			}
			if (relative === "vem-runtime-manifest.json" && ownerBuild)
				file = Buffer.from(
					JSON.stringify({ ...JSON.parse(file), build: ownerBuild }),
				);
			const mime =
				{
					".js": "text/javascript",
					".json": "application/json",
					".css": "text/css",
					".svg": "image/svg+xml",
					".woff2": "font/woff2",
				}[extname(path)] ?? "text/html";
			response.writeHead(200, { "content-type": mime });
			response.end(file);
		} catch (error) {
			fail(response, 500, String(error));
		}
	});
	server.on("upgrade", (request, socket, head) => {
		if (new URL(request.url, "http://localhost").pathname !== "/1.0/events") {
			if (assetsOrigin)
				forwardDevelopmentUpgrade(
					assetsOrigin,
					request,
					socket,
					head,
					developmentSockets,
				);
			else socket.destroy();
			return;
		}
		if (!eventsEnabled) {
			socket.end(
				"HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
			);
			return;
		}
		sockets.handleUpgrade(request, socket, head, (peer) =>
			sockets.emit("connection", peer, request),
		);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		url: `http://127.0.0.1:${server.address().port}/ui/`,
		requests,
		get writes() {
			return requests.filter(
				(request) => !["GET", "HEAD"].includes(request.method),
			).length;
		},
		get connections() {
			return sockets.clients.size;
		},
		recoverDiscovery() {
			discoveryUnavailable = false;
		},
		holdDiscoveryRead() {
			if (discoveryReadGate) throw new Error("Discovery is already held");
			let release;
			const promise = new Promise((resolve) => {
				release = resolve;
			});
			discoveryReadGate = { promise, release };
		},
		releaseDiscoveryRead() {
			discoveryReadGate?.release();
			discoveryReadGate = undefined;
		},
		setTrusted(value) {
			trusted = value;
		},
		event(action, source, context = {}, project = "default") {
			broadcast("lifecycle", { action, source, context }, project);
		},
		renameProject(from, to) {
			broadcast("operation", {
				id: randomUUID(),
				status: "Running",
				status_code: 103,
			});
			projects.delete(from);
			projects.add(to);
			this.event(
				"project-renamed",
				`/1.0/projects/${encodeURIComponent(to)}`,
				{ old_name: from },
				to,
			);
		},
		deleteProject(name) {
			projects.delete(name);
			this.event(
				"project-deleted",
				`/1.0/projects/${encodeURIComponent(name)}`,
				{},
				name,
			);
		},
		addProject(name) {
			projects.add(name);
			this.event(
				"project-created",
				`/1.0/projects/${encodeURIComponent(name)}`,
				{},
				name,
			);
		},
		setProjectListAccess(allowed) {
			projectListDenied = !allowed;
		},
		setProjectAccess(name, allowed) {
			if (allowed) deniedProjects.delete(name);
			else deniedProjects.add(name);
		},
		holdProjectReads() {
			if (projectReadGate) throw new Error("Project reads are already held");
			let release;
			const promise = new Promise((resolve) => {
				release = resolve;
			});
			projectReadGate = { promise, release };
		},
		holdProjectDetails() {
			if (projectDetailGate)
				throw new Error("Project details are already held");
			let release;
			const promise = new Promise((resolve) => {
				release = resolve;
			});
			projectDetailGate = { promise, release };
		},
		releaseProjectDetails() {
			projectDetailGate?.release();
			projectDetailGate = undefined;
		},
		releaseProjectReads({ fail = false } = {}) {
			projectsUnavailable = fail;
			projectReadGate?.release();
			projectReadGate = undefined;
		},
		disconnectEvents() {
			eventsEnabled = false;
			for (const peer of sockets.clients) peer.terminate();
		},
		reconnectEvents() {
			eventsEnabled = true;
		},
		async close() {
			discoveryReadGate?.release();
			projectReadGate?.release();
			projectDetailGate?.release();
			for (const socket of developmentSockets) socket.destroy();
			for (const peer of sockets.clients) peer.terminate();
			sockets.close();
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

function forwardDevelopmentUpgrade(origin, request, socket, head, connections) {
	const target = new URL(request.url, origin);
	socket.pause();
	connections.add(socket);
	const outbound = requestHttp(target, {
		headers: { ...request.headers, host: target.host },
	});
	socket.once("close", () => {
		connections.delete(socket);
		outbound.destroy();
	});
	socket.once("error", () => outbound.destroy());
	outbound.once("error", () => socket.destroy());
	outbound.once("response", () => {
		outbound.destroy();
		socket.destroy();
	});
	outbound.once("upgrade", (upstream, peer, peerHead) => {
		const response = new ServerResponse(request);
		response.assignSocket(socket);
		response.writeHead(upstream.statusCode, upstream.headers);
		response.flushHeaders();
		response.detachSocket(socket);
		connections.add(peer);
		peer.once("close", () => {
			connections.delete(peer);
			socket.destroy();
		});
		peer.once("error", () => socket.destroy());
		socket.once("close", () => peer.destroy());
		const peerReady = head.length === 0 || peer.write(head);
		const clientReady = peerHead.length === 0 || socket.write(peerHead);
		socket.pipe(peer);
		peer.pipe(socket);
		if (!peerReady) {
			socket.pause();
			peer.once("drain", () => socket.resume());
		}
		if (!clientReady) {
			peer.pause();
			socket.once("drain", () => peer.resume());
		}
	});
	outbound.end();
}
