// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { parseIncusEvent } from "../../src/runtime/event-stream.ts";
import type { Operation } from "../../src/runtime/operation.ts";
import { OperationMonitor } from "../../src/runtime/operation-monitor.ts";
import { IncusTransport } from "../../src/transport/client.ts";

const running = (id: string): Operation => ({
	id,
	status_code: 103,
	status: "Running",
});
const done = (id: string): Operation => ({
	id,
	status_code: 200,
	status: "Success",
});

test("one recursive operation collection settles a thousand explicitly monitored actions", async () => {
	const operations = Array.from({ length: 1000 }, (_, index) =>
		done(`job-${index}`),
	);
	const calls: URL[] = [];
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch: async (url) => {
			calls.push(new URL(String(url)));
			return Response.json({ type: "sync", metadata: { success: operations } });
		},
	});
	const monitor = new OperationMonitor(transport, () => false, 1);
	try {
		const outcomes = await Promise.all(
			operations.map((operation) =>
				monitor.watch(
					running(operation.id),
					"team",
					new AbortController().signal,
				),
			),
		);
		assert.ok(outcomes.every((outcome) => outcome.kind === "succeeded"));
		assert.equal(calls.length, 1);
		assert.equal(calls[0].pathname, "/1.0/operations");
		assert.equal(calls[0].searchParams.get("recursion"), "1");
		assert.equal(calls[0].searchParams.get("project"), "team");
	} finally {
		monitor.close();
	}
});

test("absence from a filtered list falls back to a bounded individual read", async () => {
	const calls: string[] = [];
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch: async (url) => {
			const path = new URL(String(url)).pathname;
			calls.push(path);
			return Response.json({
				type: "sync",
				metadata: path === "/1.0/operations" ? {} : done("private-job"),
			});
		},
	});
	const monitor = new OperationMonitor(transport, () => false, 1);
	try {
		const result = await monitor.watch(
			running("private-job"),
			"team",
			new AbortController().signal,
		);
		assert.equal(result.kind, "succeeded");
		assert.deepEqual(calls, ["/1.0/operations", "/1.0/operations/private-job"]);
	} finally {
		monitor.close();
	}
});

test("a removed operation is an unknown outcome, not a successful action", async () => {
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch: async (url) =>
			new URL(String(url)).pathname === "/1.0/operations"
				? Response.json({ type: "sync", metadata: {} })
				: Response.json(
						{ type: "error", error_code: 404, error: "Operation not found" },
						{ status: 404 },
					),
	});
	const monitor = new OperationMonitor(transport, () => false, 1);
	try {
		assert.equal(
			(
				await monitor.watch(
					running("gone"),
					"team",
					new AbortController().signal,
				)
			).kind,
			"unknown",
		);
	} finally {
		monitor.close();
	}
});

test("an operation event received before command registration retains its terminal result", async () => {
	const transport = new IncusTransport({
		fetch: async () => {
			throw new Error("No request should be necessary");
		},
	});
	const monitor = new OperationMonitor(transport, () => true);
	try {
		monitor.receive(done("fast"));
		assert.equal(
			(
				await monitor.watch(
					running("fast"),
					"team",
					new AbortController().signal,
				)
			).kind,
			"succeeded",
		);
		monitor.retire();
		const controller = new AbortController();
		const result = monitor.watch(running("fast"), "team", controller.signal);
		controller.abort();
		assert.equal((await result).kind, "unknown");
	} finally {
		monitor.close();
	}
});

test("event parsing rejects malformed operation payloads", () => {
	assert.equal(
		parseIncusEvent({ type: "operation", metadata: { id: "job" } }),
		undefined,
	);
	assert.equal(
		parseIncusEvent({
			type: "lifecycle",
			project: "team",
			metadata: {
				action: "instance-deleted",
				source: "/1.0/instances/demo?project=team",
			},
		})?.type,
		"lifecycle",
	);
});

test("actual early-event eviction triggers one bounded registration reconciliation", async () => {
	let reads = 0;
	const transport = new IncusTransport({
		fetch: async () => {
			reads++;
			return Response.json({
				type: "sync",
				metadata: { success: [done("fast")] },
			});
		},
	});
	const monitor = new OperationMonitor(transport, () => true, 1);
	try {
		const fence = monitor.registrationFence();
		monitor.receive(done("fast"));
		for (let index = 0; index < 2050; index++)
			monitor.receive(done(`unrelated-${index}`));
		const result = await monitor.watch(
			running("fast"),
			"team",
			new AbortController().signal,
			undefined,
			fence,
		);
		assert.equal(result.kind, "succeeded");
		assert.equal(reads, 1);
	} finally {
		monitor.close();
	}
});

test("an initial HTTP snapshot does not regress newer operation event progress", async () => {
	const monitor = new OperationMonitor(
		new IncusTransport({
			fetch: async () => {
				throw new Error("No read is required.");
			},
		}),
		() => true,
	);
	const controller = new AbortController();
	const progress: string[] = [];
	try {
		monitor.receive({ ...running("job"), description: "new event progress" });
		const result = monitor.watch(
			{ ...running("job"), description: "old HTTP snapshot" },
			"team",
			controller.signal,
			(operation) => {
				progress.push(operation.description ?? "");
			},
		);
		assert.deepEqual(progress, ["new event progress"]);
		controller.abort();
		await result;
	} finally {
		monitor.close();
	}
});
