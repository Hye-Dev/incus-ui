// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { query } from "@hyecompany/vem-data";
import { BrowserClient, protocolVersion } from "@hyecompany/vem-data/client";
import {
	createRuntime,
	persistenceSchemaVersion,
	type ResourceDefinition,
} from "@hyecompany/vem-data/runtime";
import { deferred } from "@hyecompany/vem-data/testing";
import { createSharedHost } from "@hyecompany/vem-data/worker";
import {
	createReadDefinition,
	createReferenceParser,
	defineRoute,
	type IncusAdapterServices,
	identityFieldLiveness,
	projectLiveness,
	readScope,
	renamedIdentity,
	withReadDeadline,
} from "../../src/definition-authoring.ts";
import { projects, server } from "../../src/index.ts";
import { incusReadDefinitions } from "../../src/read-definitions.ts";
import type { EventSocket } from "../../src/runtime.ts";
import {
	createIncusDefinitions,
	createIncusRuntime,
} from "../../src/runtime.ts";
import { IncusProtocolError, IncusTransport } from "../../src/transport.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

const memberReadDefinition = createReadDefinition("members");

function memberDefinition(
	{ api, readTimeoutMs }: IncusAdapterServices,
	receive: () => void,
): ResourceDefinition {
	return {
		...memberReadDefinition,
		readPrerequisites: (_query, context) =>
			context.access("authenticated") === "unknown"
				? [server.current({ select: ["auth"] })]
				: [],
		sources: [
			{
				key: "member-detail",
				mode: "one",
				fields: ["server_name", "status"],
				access: "authenticated",
				accessUnknown: "wait",
				run: async (descriptor, context) => {
					if (
						!isRecord(descriptor.identity) ||
						typeof descriptor.identity.name !== "string"
					)
						throw new TypeError("A member name is required.");
					const name = descriptor.identity.name;
					const response = await withReadDeadline(
						readTimeoutMs,
						context.signal,
						(signal) =>
							api.request("GET", "/1.0/cluster/members/{name}", {
								params: { path: { name } },
								signal,
							}),
					);
					if (
						response.type !== "sync" ||
						!response.metadata ||
						typeof response.metadata.server_name !== "string"
					)
						throw new Error("Incus returned no cluster member.");
					const scope = readScope("members", descriptor.identity);
					return {
						grants: [{ scope, state: "allowed" }],
						facts: [
							{
								resource: "members",
								identity: descriptor.identity,
								presence: "present",
								values: response.metadata,
								basis: [scope],
								liveness: projectLiveness("default"),
							},
						],
					};
				},
			},
		],
		event: () => {
			receive();
		},
	};
}

test("public definition composition requires only the services consumed by its resources", async () => {
	const requests: string[] = [];
	const runtime = createRuntime({
		resources: createIncusDefinitions({
			transport: new IncusTransport({
				baseURL: "https://incus.test",
				fetch: async (url) => {
					requests.push(new URL(String(url)).pathname);
					return Response.json({
						type: "sync",
						metadata: { name: "default", description: "Default project" },
					});
				},
			}),
			refreshAccess: async () => {},
		}),
		contextId: "independent-host",
		access: [{ scope: "authenticated", state: "allowed" }],
	});
	try {
		const result = await runtime.read(projects.get({ name: "default" }));
		assert.equal(result.rows[0]?.data.description, "Default project");
		assert.deepEqual(requests, ["/1.0/projects/default"]);
	} finally {
		runtime.close();
	}
});

test("a public resource extension projects locally and revalidates after its event stream is interrupted", {
	timeout: 10_000,
}, async (t) => {
	const memberRoute = defineRoute({
		resource: "members",
		collection: "/1.0/cluster/members",
		detail: "/1.0/cluster/members/{name}",
		key: "name",
		identity: ["name"],
	});
	const socket: EventSocket = {
		onopen: null,
		onclose: null,
		onerror: null,
		onmessage: null,
		close() {},
	};
	let received = 0;
	const requests: string[] = [];
	const revalidating = deferred<void>();
	const refreshed = deferred<void>();
	let hold = false;
	let stalled = false;
	const app = await createIncusRuntime({
		baseUrl: "https://incus.test",
		readTimeoutMs: 20,
		socket: () => socket,
		additionalRoutes: [memberRoute],
		additionalDefinitions: (services) => [
			memberDefinition(services, () => {
				received++;
			}),
		],
		fetch: async (url, init) => {
			const path = new URL(String(url)).pathname;
			requests.push(path);
			if (stalled && path === "/1.0/cluster/members/node-a") {
				const signal = init?.signal;
				return new Response(
					new ReadableStream({
						start(controller) {
							const abort = () => controller.error(signal?.reason);
							if (signal?.aborted) abort();
							else signal?.addEventListener("abort", abort, { once: true });
						},
					}),
				);
			}
			if (hold && path === "/1.0/cluster/members/node-a") {
				revalidating.resolve();
				await refreshed.promise;
			}
			return Response.json({
				type: "sync",
				metadata:
					path === "/1.0"
						? {
								auth: "trusted",
								auth_user_name: "alice",
								auth_user_method: "tls",
								config: {},
							}
						: path === "/1.0/projects/default"
							? {
									name: "default",
									config: {},
									devices: {},
									used_by: ["/1.0/cluster/members/node-a"],
								}
							: { server_name: "node-a", status: hold ? "Offline" : "Online" },
			});
		},
	});
	const compatibility = {
		protocol: protocolVersion,
		schema: persistenceSchemaVersion,
		definitions: 1,
		build: "independent-consumer",
	};
	const closed = deferred<void>();
	const attach = await createSharedHost({
		compatibility,
		lockName: `incus-extension-test:${crypto.randomUUID()}`,
		locks: navigator.locks,
		create: async () => ({ client: app.runtime, dispose: app.dispose }),
		onClosed: () => closed.resolve(),
	});
	const channel = new MessageChannel();
	attach(channel.port1);
	const client = new BrowserClient(channel.port2, compatibility, {
		locks: navigator.locks,
		readDefinitions: [...incusReadDefinitions, memberReadDefinition],
	});
	t.after(async () => {
		refreshed.resolve();
		await client.upgrade();
		await closed.promise;
		client.close();
		app.dispose();
	});
	socket.onopen?.(new Event("open"));
	socket.onmessage?.(
		new MessageEvent("message", {
			data: JSON.stringify({
				type: "lifecycle",
				project: "default",
				metadata: {
					action: "instance-started",
					source: "/1.0/instances/example",
				},
			}),
		}),
	);
	try {
		const descriptor = query<{ server_name: string }, { name: string }>({
			resource: "members",
			mode: "one",
			identity: { name: "node-a" },
			select: ["server_name"],
		});
		const result = await client.read(descriptor);
		assert.equal(result.rows[0]?.data.server_name, "node-a");
		await client.read(
			projects.get({ name: "default" }, { select: ["used_by"] }),
		);
		assert.deepEqual(
			app.runtime.relationship("projects", { name: "default" }, "used_by")
				?.targets,
			[{ resource: "members", identity: { name: "node-a" } }],
		);
		assert.equal(received, 1);
		const status = query<{ status: string }, { name: string }>({
			resource: "members",
			mode: "one",
			identity: { name: "node-a" },
			select: ["status"],
		});
		const cached = client.watch(status, { acquire: false });
		t.after(() => cached.dispose());
		assert.equal(cached.getSnapshot().rows[0]?.data.status, "Online");
		assert.equal(cached.getSnapshot().stale, false);
		const before = requests.length;
		const interrupted = deferred<void>();
		const stop = cached.subscribe(() => {
			if (cached.getSnapshot().stale) interrupted.resolve();
		});
		t.after(stop);
		socket.onclose?.(new CloseEvent("close"));
		await interrupted.promise;
		assert.equal(cached.getSnapshot().rows[0]?.data.status, "Online");
		assert.equal(requests.length, before);
		hold = true;
		const reread = client.read(status);
		await revalidating.promise;
		assert.equal(cached.getSnapshot().rows[0]?.data.status, "Online");
		assert.deepEqual(requests.slice(before), ["/1.0/cluster/members/node-a"]);
		refreshed.resolve();
		assert.equal((await reread).rows[0]?.data.status, "Offline");
		stalled = true;
		app.runtime.observe({
			invalidate: [
				{ resource: "members", identity: { name: "node-a" }, field: "status" },
			],
		});
		const failed = await client.read(status);
		assert.equal(failed.rows[0]?.data.status, "Offline");
		assert.equal(failed.stale, true);
		assert.ok(
			failed.issues.some(
				(issue) =>
					issue.kind === "read" && issue.message.includes("20 ms deadline"),
			),
		);
	} finally {
		refreshed.resolve();
	}
});

test("resource-local route metadata preserves nested context and rejects malformed external references", () => {
	const identity = ["project", "pool", "volume"];
	const queryIdentity = ["target"];
	const route = defineRoute({
		resource: "volumes",
		collection: "/1.0/storage-pools/{pool}/volumes/custom",
		detail: "/1.0/storage-pools/{pool}/volumes/custom/{volume}",
		key: "volume",
		identity,
		queryIdentity,
	});
	identity.push("unexpected");
	queryIdentity.push("unexpected");
	assert.ok(Object.isFrozen(route));
	const parse = createReferenceParser([route]);
	const ref = { project: "team", pool: "fast", volume: "data" };
	assert.deepEqual(parse(`${route.path(ref)}?project=team`), {
		resource: "volumes",
		identity: ref,
	});
	assert.deepEqual(
		parse(`${route.path(ref)}?project=team&target=node-a&unexpected=ignored`),
		{
			resource: "volumes",
			identity: { ...ref, target: "node-a" },
		},
	);
	assert.equal(
		route.path(ref, "list"),
		"/1.0/storage-pools/fast/volumes/custom",
	);
	assert.deepEqual(route.identity({ volume: "data" }, ref), ref);
	assert.throws(() => route.identity({}, ref), IncusProtocolError);
	assert.deepEqual(
		identityFieldLiveness(route.identityField, ref, {
			...ref,
			project: "default",
		}),
		{ volume: "immutable" },
	);
	assert.deepEqual(
		identityFieldLiveness(route.identityField, ref, { volume: "other" }),
		{},
	);
	assert.equal(parse.route("volumes")?.identityField, "volume");
	assert.deepEqual(
		renamedIdentity(
			route,
			{
				type: "lifecycle",
				project: "team",
				metadata: {
					action: "storage-volume-renamed",
					source: route.path(ref),
					context: { old_name: "previous" },
				},
			},
			ref,
		),
		{ project: "team", pool: "fast", volume: "previous" },
	);

	for (const source of [
		"https://other.test/1.0/storage-pools/fast/volumes/custom/data",
		"/1.0/storage-pools/fast/volumes/custom/%E0%A4%A",
		"/1.0/storage-pools/fast/volumes/custom/data?project=",
		"/1.0/storage-pools/fast/volumes/custom/",
	])
		assert.equal(parse(source), undefined);
});
