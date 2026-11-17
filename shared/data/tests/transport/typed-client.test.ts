// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { IncusApi } from "../../src/transport.ts";

test("typed path parameters and fixed query representations use one URL and preserve Fetch options", async () => {
	let captured: { url: string; options?: RequestInit } | undefined;
	const api = new IncusApi({
		baseURL: "https://incus.example",
		fetch: async (url, options) => {
			captured = { url: String(url), options };
			return Response.json(
				{ type: "sync", metadata: [] },
				{ headers: { ETag: '"read-1"' } },
			);
		},
	});
	const result = await api.request("GET", "/1.0/instances?recursion=2", {
		params: { query: { project: "production" } },
		headers: { "X-Trace": "example" },
		credentials: "omit",
		redirect: "error",
		priority: "low",
	});
	assert.equal(
		captured?.url,
		"https://incus.example/1.0/instances?recursion=2&project=production",
	);
	assert.equal(captured?.options?.credentials, "omit");
	assert.equal(captured?.options?.redirect, "error");
	assert.equal(captured?.options?.priority, "low");
	assert.equal(
		new Headers(captured?.options?.headers).get("X-Trace"),
		"example",
	);
	assert.equal(result.etag, '"read-1"');
	for (const parseAs of ["text", undefined] as const) {
		const parsed = await api.request("GET", "/1.0", { parseAs });
		if (parseAs === "text") assert.equal(typeof parsed, "string");
		else {
			assert.notEqual(typeof parsed, "string");
			if (typeof parsed !== "string") assert.equal(parsed.type, "sync");
		}
	}
});

test("binary responses, raw HEAD and asynchronous acceptance retain their distinct meanings", async () => {
	const api = new IncusApi({
		baseURL: "https://incus.example",
		fetch: async (_url, options) => {
			if (options?.method === "HEAD")
				return new Response(null, { headers: { "X-Incus-type": "file" } });
			if (options?.method === "PUT")
				return Response.json(
					{
						type: "async",
						operation: "/1.0/operations/operation-1",
						metadata: {
							id: "operation-1",
							status_code: 103,
							status: "Running",
						},
					},
					{ status: 202 },
				);
			return new Response(new Uint8Array([0, 1, 255]));
		},
	});
	const bytes = await api.request("GET", "/1.0/instances/{name}/files", {
		params: { path: { name: "a/b" }, query: { path: "/tmp/file" } },
		parseAs: "arrayBuffer",
	});
	assert.deepEqual(new Uint8Array(bytes), new Uint8Array([0, 1, 255]));
	assert.equal(
		(
			await api.raw("HEAD", "/1.0/instances/web-1/files?path=/tmp/file")
		).headers.get("X-Incus-type"),
		"file",
	);
	const head = await api.request("HEAD", "/1.0/instances/{name}/files", {
		params: { path: { name: "web-1" }, query: { path: "/tmp/file" } },
	});
	assert.ok(head instanceof Response);
	assert.equal(head.bodyUsed, false);
	for (const parseAs of ["text", undefined] as const) {
		const parsed = await api.request("HEAD", "/1.0/instances/{name}/files", {
			params: { path: { name: "web-1" }, query: { path: "/tmp/file" } },
			parseAs,
		});
		if (parseAs === "text") assert.equal(parsed, "");
		else assert.ok(parsed instanceof Response);
	}
	const headJson = await api.request("HEAD", "/1.0/instances/{name}/files", {
		params: { path: { name: "web-1" }, query: { path: "/tmp/file" } },
		parseAs: "json",
	});
	assert.equal(headJson.type, "sync");
	assert.equal(headJson.metadata, undefined);
	assert.equal(headJson.response.bodyUsed, false);
	const result = await api.request("PUT", "/1.0/instances/{name}/state", {
		params: { path: { name: "web-1" }, query: { project: "default" } },
		body: { action: "start" },
	});
	assert.equal(result.type, "async");
	if (result.type === "async") assert.equal(result.metadata.status_code, 103);
});

test("transport rejects cross-origin paths and encodes named segments", async () => {
	let called = "";
	const api = new IncusApi({
		baseURL: "https://incus.example",
		fetch: async (url) => {
			called = String(url);
			return Response.json({ type: "sync", metadata: {} });
		},
	});
	await api.request("GET", "/1.0/instances/{name}", {
		params: { path: { name: "space slash/a" } },
	});
	assert.equal(new URL(called).pathname, "/1.0/instances/space%20slash%2Fa");
	await assert.rejects(api.raw("GET", "https://elsewhere.example/1.0"));
});

test("WebSockets use typed URL parameters and reject unsupported HTTP options before connecting", (t) => {
	const connections: { url: string; protocols?: string | string[] }[] = [];
	class Socket {
		constructor(url: string | URL, protocols?: string | string[]) {
			connections.push({ url: String(url), protocols });
		}
	}
	t.mock.method(globalThis, "WebSocket", Socket as unknown as typeof WebSocket);
	const api = new IncusApi({ baseURL: "https://incus.example" });
	api.websocket("/1.0/events", {
		params: { query: { "all-projects": true, type: "lifecycle,operation" } },
	});
	api.websocket("/1.0/operations/{id}/websocket", {
		params: { path: { id: "space/slash" }, query: { secret: "a&b" } },
		protocols: ["example"] as const,
	});
	api.websocket("/1.0/operations/{id}/websocket?public", {
		params: { path: { id: "operation-1" }, query: { secret: "token" } },
	});
	assert.deepEqual(connections, [
		{
			url: "wss://incus.example/1.0/events?all-projects=true&type=lifecycle%2Coperation",
			protocols: undefined,
		},
		{
			url: "wss://incus.example/1.0/operations/space%2Fslash/websocket?secret=a%26b",
			protocols: ["example"],
		},
		{
			url: "wss://incus.example/1.0/operations/operation-1/websocket?public=&secret=token",
			protocols: undefined,
		},
	]);
	for (const options of [
		{ headers: { "X-Trace": "example" } },
		{ signal: new AbortController().signal },
		{ body: "payload" },
		{ parseAs: "json" },
		{ params: { header: { Authorization: "token" } } },
	]) {
		assert.throws(
			() => Reflect.apply(api.websocket, api, ["/1.0/events", options]),
			{
				name: "TypeError",
				message: "WebSocket requests accept only URL parameters and protocols.",
			},
		);
	}
	assert.equal(connections.length, 3);
});
