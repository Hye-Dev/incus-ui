// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import {
	IncusError,
	IncusProtocolError,
	IncusTransport,
} from "../../src/transport/client.ts";
import { IncusApi } from "../../src/transport/typed-client.ts";

test("typed requests, resource reads and both upload transports preserve the same JSON outcomes", async () => {
	const operation = { id: "job", status_code: 103, status: "Running" };
	for (const scenario of [
		{
			status: 200,
			text: '{"type":"sync","metadata":{"saved":true}}',
			result: { type: "sync", metadata: { saved: true }, etag: '"revision"' },
		},
		{
			status: 202,
			text: JSON.stringify({
				type: "async",
				operation: "/1.0/operations/job",
				metadata: operation,
			}),
			result: {
				type: "async",
				operation: "/1.0/operations/job",
				metadata: operation,
				etag: '"revision"',
			},
		},
		{
			status: 204,
			text: "",
			result: { type: "sync", metadata: undefined, etag: '"revision"' },
		},
		{
			status: 403,
			text: '{"type":"error","error":"Denied","error_code":123}',
			error: IncusError,
			code: 123,
		},
		{ status: 403, text: "null", error: IncusError, code: 403 },
		{ status: 502, text: "Bad gateway", error: IncusError, code: 502 },
		{ status: 200, text: "Not JSON", error: IncusProtocolError },
		{
			status: 200,
			text: '{"type":"async","metadata":{}}',
			error: IncusProtocolError,
		},
	]) {
		const options = {
			baseURL: "https://incus.test",
			fetch: async () =>
				new Response(scenario.status === 204 ? null : scenario.text, {
					status: scenario.status,
					headers: { ETag: '"revision"' },
				}),
		};
		const transport = new IncusTransport(options);
		const xhrTransport = new IncusTransport({
			...options,
			xhr: () => {
				const xhr = {
					status: scenario.status,
					responseText: scenario.text,
					upload: {},
					onload: () => {},
					open() {},
					setRequestHeader() {},
					getResponseHeader: () => '"revision"',
					send: () => queueMicrotask(() => xhr.onload()),
				};
				return xhr as unknown as XMLHttpRequest;
			},
		});
		const input = { file: new Blob(["contents"]), path: "/tmp/file" };
		const calls = [
			() => new IncusApi(options).request("GET", "/1.0/projects"),
			() => transport.rawRequest("GET", "/1.0/projects?secret=private"),
			() => transport.upload("/1.0/instances/demo/files?secret=private", input),
			() =>
				xhrTransport.upload("/1.0/instances/demo/files?secret=private", input),
		];
		for (const call of calls) {
			if (scenario.error) {
				await assert.rejects(call, (error: unknown) => {
					assert.ok(error instanceof scenario.error);
					if (error instanceof IncusError) {
						assert.equal(error.status, scenario.status);
						assert.equal(error.code, scenario.code);
						assert.equal(new URL(error.url).search, "");
					}
					return true;
				});
			} else {
				const result = await call();
				const { response: _response, ...decoded } = result as typeof result & {
					response?: Response;
				};
				assert.deepEqual(decoded, scenario.result);
			}
		}
	}
});

test("JSON body cancellation preserves the caller's abort reason", async () => {
	for (const reason of [new Error("Stopped observing this response"), null]) {
		for (const kind of ["typed", "resource", "upload", "xhr"] as const) {
			const abort = new AbortController();
			const options = {
				baseURL: "https://incus.test",
				xhr:
					kind === "xhr"
						? () => {
								const xhr = {
									upload: {},
									onabort: () => {},
									open() {},
									setRequestHeader() {},
									abort: () => xhr.onabort(),
									send: () => abort.abort(reason),
								};
								return xhr as unknown as XMLHttpRequest;
							}
						: undefined,
				fetch: async () =>
					new Response(
						new ReadableStream({
							pull(controller) {
								abort.abort(reason);
								controller.error(
									new DOMException("Aborted body", "AbortError"),
								);
							},
						}),
					),
			};
			const transport = new IncusTransport(options);
			await assert.rejects(
				kind === "typed"
					? new IncusApi(options).request("GET", "/1.0/projects", {
							signal: abort.signal,
						})
					: kind === "resource"
						? transport.rawRequest("GET", "/1.0/projects", {
								signal: abort.signal,
							})
						: transport.upload(
								"/1.0/instances/demo/files",
								{ file: new Blob(), path: "/tmp/file" },
								{ signal: abort.signal },
							),
				(error) => error === reason,
			);
		}
	}
});

test("async acceptance preserves the operation instead of returning command success", async () => {
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch: async () =>
			Response.json(
				{
					type: "async",
					operation: "/1.0/operations/job",
					metadata: { id: "job", status: "Running", status_code: 103 },
				},
				{ status: 202 },
			),
	});
	const result = await transport.rawRequest(
		"PUT",
		"/1.0/instances/demo/state",
		{ body: { action: "start" } },
	);
	assert.equal(result.type, "async");
	if (result.type !== "async")
		throw new Error("An asynchronous response was required.");
	assert.equal(result.metadata.status_code, 103);
});

test("conditional writes carry the opaque ETag and preserve scoped denial details", async () => {
	let headers: Headers | undefined;
	let priority: RequestInit["priority"];
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch: async (_url, init) => {
			headers = new Headers(init?.headers);
			priority = init?.priority;
			return Response.json(
				{ type: "error", error_code: 412, error: "changed" },
				{ status: 412 },
			);
		},
	});
	await assert.rejects(
		transport.rawRequest("PUT", "/1.0/profiles/default", {
			etag: '"opaque"',
			body: { config: {} },
			priority: "high",
		}),
		(error: unknown) =>
			error instanceof IncusError &&
			error.status === 412 &&
			error.method === "PUT",
	);
	assert.equal(headers?.get("If-Match"), '"opaque"');
	assert.equal(priority, "high");
});

test("file uploads preserve the raw body, project, octal mode and synchronous response", async () => {
	const file = new Blob(["file contents"]);
	let received:
		| { url: URL; headers: Headers; body: BodyInit | null | undefined }
		| undefined;
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch: async (url, init) => {
			received = {
				url: new URL(String(url)),
				headers: new Headers(init?.headers),
				body: init?.body,
			};
			return Response.json({ type: "sync", metadata: {} });
		},
	});
	const result = await transport.upload(
		"/1.0/instances/demo/files?project=team",
		{ file, path: "/tmp/example.txt", mode: "0644", write: "overwrite" },
	);
	assert.equal(result.type, "sync");
	assert.equal(received?.body, file);
	assert.equal(received?.headers.get("X-Incus-mode"), "0644");
	assert.equal(
		received?.headers.get("Content-Type"),
		"application/octet-stream",
	);
	assert.equal(received?.url.searchParams.get("project"), "team");
	assert.equal(received?.url.searchParams.get("path"), "/tmp/example.txt");
});

test("transport refuses a foreign operation origin and malformed successful envelopes", async () => {
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch: async () => Response.json({ arbitrary: true }),
	});
	assert.throws(
		() => transport.url("https://elsewhere.test/1.0/operations/job"),
		IncusProtocolError,
	);
	assert.throws(
		() => transport.url("/1.00/operations/job"),
		IncusProtocolError,
	);
	await assert.rejects(transport.rawGet("/1.0"), IncusProtocolError);
});

test("error diagnostics omit request query credentials while root discovery remains available", async () => {
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch: async () =>
			Response.json(
				{ type: "error", error: "denied", error_code: 403 },
				{ status: 403 },
			),
	});
	assert.equal(transport.url("/").pathname, "/");
	await assert.rejects(
		transport.rawGet("/1.0/operations/job/websocket?secret=transient#private"),
		(error: unknown) =>
			error instanceof IncusError &&
			error.url === "https://incus.test/1.0/operations/job/websocket",
	);
	const options = {
		baseURL: "https://incus.test",
		fetch: async () =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.error(new TypeError("The body connection failed"));
					},
				}),
				{ status: 403 },
			),
	};
	const brokenBody = new IncusTransport(options);
	for (const call of [
		() => new IncusApi(options).request("GET", "/1.0/projects"),
		() => brokenBody.rawGet("/1.0/projects"),
		() =>
			brokenBody.upload("/1.0/instances/demo/files", {
				file: new Blob(),
				path: "/tmp/file",
			}),
	]) {
		await assert.rejects(
			call,
			(error: unknown) =>
				error instanceof IncusError &&
				error.status === 403 &&
				error.code === 403,
		);
	}
});
