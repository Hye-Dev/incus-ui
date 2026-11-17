// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { withReadDeadline } from "../../src/definition-authoring.ts";
import { projectContinuity } from "../../src/internal/events/continuity.ts";
import { projects } from "../../src/resources.ts";
import { harness, observe, sync } from "../support/domain.ts";

test("read deadlines include connection waiting and response bodies without withdrawing stale values", async () => {
	for (const phase of ["connection", "body"] as const) {
		let waiting = true;
		const priorities: RequestInit["priority"][] = [];
		const app = harness(
			async (input, init) => {
				priorities.push(init?.priority);
				const value = { name: "team", description: "Updated description" };
				const metadata =
					new URL(String(input)).pathname === "/1.0/projects" ? [value] : value;
				if (!waiting) return sync(metadata);
				if (phase === "connection") {
					await delay(50, undefined, { signal: init?.signal ?? undefined });
					return sync(metadata);
				}
				return new Response(
					new ReadableStream({
						async start(controller) {
							try {
								await delay(50, undefined, {
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
			true,
			{ readTimeoutMs: 20 },
		);
		const query = projects.get({ name: "team" }, { select: ["description"] });
		observe(
			app.runtime,
			"projects",
			{ name: "team" },
			{
				name: "team",
				description: "Retained description",
			},
		);
		app.runtime.setContinuity(projectContinuity("team"), "interrupted");
		const handle = app.runtime.watch(query);
		try {
			const result = await app.runtime.read(query);
			assert.equal(result.settled, true);
			assert.equal(result.stale, true);
			assert.equal(result.rows[0]?.data.description, "Retained description");
			assert.ok(result.issues.length > 0);
			assert.ok(
				result.issues.every(
					(issue) =>
						issue.kind === "read" &&
						issue.message.includes("20 ms deadline") &&
						issue.message.includes("waiting for a connection"),
				),
			);
			assert.equal(app.runtime.access("authenticated"), "allowed");
			assert.ok(priorities.length > 0);
			assert.ok(priorities.every((priority) => priority === "low"));
			waiting = false;
			const retried = await handle.retry();
			assert.deepEqual(retried.issues, []);
			assert.equal(retried.rows[0]?.data.description, "Updated description");
		} finally {
			handle.dispose();
			app.close();
		}
	}
});

test("hosts can provide a longer end-to-end budget for queued reads", async () => {
	const app = harness(
		async (_input, init) => {
			await delay(50, undefined, { signal: init?.signal ?? undefined });
			return sync({ name: "team", description: "Ready" });
		},
		true,
		{ readTimeoutMs: 200 },
	);
	try {
		const result = await app.runtime.read(
			projects.get({ name: "team" }, { select: ["description"] }),
		);
		assert.deepEqual(result.issues, []);
		assert.equal(result.rows[0]?.data.description, "Ready");
	} finally {
		app.close();
	}
});

test("extension read deadlines preserve the caller's cancellation reason", async () => {
	const controller = new AbortController();
	const reason = new Error("This consumer stopped reading.");
	const reading = withReadDeadline(undefined, controller.signal, (signal) =>
		delay(1000, undefined, { signal }),
	);
	controller.abort(reason);
	await assert.rejects(reading, (error: unknown) => error === reason);
});
