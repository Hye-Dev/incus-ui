// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { deferred } from "@hyecompany/vem-data/testing";
import { projects, server } from "../../src/index.ts";
import { createIncusRuntime } from "../../src/runtime.ts";
import { IncusReadTimeoutError } from "../../src/transport.ts";
import { sync } from "../support/domain.ts";

const socket = () => ({
	onopen: null,
	onmessage: null,
	onerror: null,
	onclose: null,
	close() {},
});

test("failed caller discovery retries with project demand without acquiring unrelated resources", async () => {
	let online = false;
	const paths: string[] = [];
	const app = await createIncusRuntime({
		baseUrl: "https://incus.test",
		socket,
		fetch: async (input) => {
			const path = new URL(String(input)).pathname;
			paths.push(path);
			if (!online)
				return Response.json(
					{ type: "error", error_code: 502, error: "Offline" },
					{ status: 502 },
				);
			if (path === "/1.0")
				return sync({
					auth: "trusted",
					auth_user_name: "alice",
					auth_user_method: "tls",
				});
			assert.equal(path, "/1.0/projects");
			return sync(["/1.0/projects/default"]);
		},
	});
	const handle = app.runtime.watch(projects.list({ select: ["name"] }));
	try {
		const failed = await app.runtime.read(projects.list({ select: ["name"] }));
		assert.equal(failed.settled, true);
		assert.equal(failed.empty, false);
		assert.equal(app.runtime.access("authenticated"), "unknown");
		online = true;
		const result = await handle.retry();
		assert.equal(result.rows[0]?.data.name, "default");
		assert.equal(result.confirmed.complete, true);
		assert.equal(paths.filter((path) => path === "/1.0/projects").length, 1);
	} finally {
		handle.dispose();
		app.dispose();
	}
});

test("network failure retains disclosure; logout withdraws protected project knowledge", async () => {
	let trusted = true;
	let online = true;
	const app = await createIncusRuntime({
		baseUrl: "https://incus.test",
		socket,
		fetch: async (input) => {
			if (!online) throw new TypeError("Offline");
			return sync(
				new URL(String(input)).pathname === "/1.0"
					? {
							auth: trusted ? "trusted" : "untrusted",
							...(trusted
								? { auth_user_name: "alice", auth_user_method: "tls" }
								: {}),
						}
					: ["/1.0/projects/default"],
			);
		},
	});
	const handle = app.runtime.watch(projects.list({ select: ["name"] }));
	try {
		await app.runtime.read(projects.list({ select: ["name"] }));
		online = false;
		await assert.rejects(app.refreshAccess());
		assert.equal(handle.getSnapshot().rows[0]?.data.name, "default");
		assert.equal(app.runtime.access("authenticated"), "allowed");
		online = true;
		trusted = false;
		await app.refreshAccess();
		assert.equal(handle.getSnapshot().rows.length, 0);
		assert.equal(app.runtime.access("authenticated"), "denied");
		const publicInfo = await app.runtime.read(
			server.current({ select: ["auth"] }),
		);
		assert.equal(publicInfo.rows[0]?.data.auth, "untrusted");
	} finally {
		handle.dispose();
		app.dispose();
	}
});

test("initial and explicit access discovery share the configured end-to-end read deadline", async () => {
	for (const phase of ["connection", "body"] as const) {
		let waiting = true;
		const errors: unknown[] = [];
		const metadata = {
			auth: "trusted",
			auth_user_name: "alice",
			auth_user_method: "tls",
		};
		const app = await createIncusRuntime({
			baseUrl: "https://incus.test",
			readTimeoutMs: 20,
			socket,
			onError: (error) => errors.push(error),
			fetch: async (_url, init) => {
				if (!waiting) return sync(metadata);
				if (phase === "connection") {
					await delay(1000, undefined, { signal: init?.signal ?? undefined });
					return sync(metadata);
				}
				return new Response(
					new ReadableStream({
						async start(controller) {
							try {
								await delay(1000, undefined, {
									signal: init?.signal ?? undefined,
								});
								controller.enqueue(
									new TextEncoder().encode(
										JSON.stringify({ type: "sync", metadata }),
									),
								);
								controller.close();
							} catch (error) {
								controller.error(error);
							}
						},
					}),
				);
			},
		});
		try {
			assert.equal(errors.length, 1);
			assert.ok(errors[0] instanceof IncusReadTimeoutError);
			assert.equal(errors[0].timeoutMs, 20);
			assert.equal(app.runtime.access("authenticated"), "unknown");
			waiting = false;
			await app.refreshAccess();
			assert.equal(app.runtime.access("authenticated"), "allowed");
			waiting = true;
			await assert.rejects(app.refreshAccess(), (error: unknown) => {
				assert.ok(error instanceof IncusReadTimeoutError);
				assert.equal(error.timeoutMs, 20);
				return true;
			});
			assert.equal(app.runtime.access("authenticated"), "allowed");
			assert.equal(
				errors.length,
				1,
				"explicit discovery reports failure to its caller",
			);
		} finally {
			app.dispose();
		}
	}
});

test("retired and disposed discovery responses cannot restore a caller or restart events", async () => {
	let metadata = {
		auth: "trusted",
		auth_user_name: "alice",
		auth_user_method: "tls",
	};
	let reply: ReturnType<typeof deferred<Response>> | undefined;
	let signal: AbortSignal | null | undefined;
	let connections = 0;
	const app = await createIncusRuntime({
		baseUrl: "https://incus.test",
		socket: () => {
			connections++;
			return socket();
		},
		fetch: async (_url, init) => {
			signal = init?.signal;
			return reply ? reply.promise : sync(metadata);
		},
	});
	try {
		reply = deferred<Response>();
		const oldReply = reply;
		const oldMetadata = metadata;
		const retiring = app.refreshAccess();
		app.retireAccess();
		assert.equal(app.runtime.access("authenticated"), "denied");
		assert.equal(connections, 1);
		reply = undefined;
		metadata = { ...metadata, auth_user_name: "bob" };
		await app.refreshAccess();
		assert.equal(app.runtime.access("authenticated"), "allowed");
		assert.equal(connections, 2);
		oldReply.resolve(sync(oldMetadata));
		await retiring;
		const caller = app.runtime.watch(
			server.current({ select: ["auth_user_name"] }),
			{ acquire: false },
		);
		try {
			assert.equal(caller.getSnapshot().rows[0]?.data.auth_user_name, "bob");
		} finally {
			caller.dispose();
		}
		assert.equal(connections, 2);
		reply = deferred<Response>();
		const closing = app.refreshAccess();
		assert.equal(signal?.aborted, false);
		app.dispose();
		assert.equal(signal?.aborted, true);
		reply.resolve(sync(metadata));
		await closing;
		assert.equal(connections, 2);
		await assert.rejects(app.refreshAccess(), /closed/);
	} finally {
		app.dispose();
	}
});
