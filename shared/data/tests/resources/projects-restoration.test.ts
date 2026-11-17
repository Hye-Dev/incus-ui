// SPDX-FileCopyrightText: 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPersistence } from "@hyecompany/vem-data/testing";
import { readScope } from "../../src/definition-authoring.ts";
import { projects } from "../../src/resources.ts";
import { createIncusRuntime } from "../../src/runtime/create-runtime.ts";
import { sync } from "../support/domain.ts";

function deferred() {
	let resolve = () => {};
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

test("project descriptions survive owner restart as protected stale content during revalidation", async () => {
	const persistence = new MemoryPersistence();
	const requested = deferred();
	const reply = deferred();
	let hold = false;
	let reads = 0;
	let collectionReads = 0;
	const owner = () =>
		createIncusRuntime({
			baseUrl: "https://incus.test",
			persistence,
			socket: () => ({
				onopen: null,
				onclose: null,
				onerror: null,
				onmessage: null,
				close() {},
			}),
			fetch: async (input) => {
				const url = new URL(String(input));
				if (url.pathname === "/1.0")
					return sync({
						auth: "trusted",
						auth_user_name: "alice",
						auth_user_method: "tls",
						config: {},
					});
				if (url.pathname === "/1.0/projects") {
					collectionReads++;
					return sync(["/1.0/projects/team"]);
				}
				assert.equal(url.pathname, "/1.0/projects/team");
				reads++;
				if (hold) {
					requested.resolve();
					await reply.promise;
				}
				return sync({
					name: "team",
					description: hold ? "Updated description" : "Saved description",
				});
			},
		});
	const query = projects.get({ name: "team" });
	const first = await owner();
	try {
		await first.runtime.ready;
		assert.equal(
			(await first.runtime.read(query)).rows[0]?.data.description,
			"Saved description",
		);
		await first.runtime.flush();
	} finally {
		first.dispose();
	}
	hold = true;
	const second = await owner();
	try {
		await second.runtime.ready;
		const view = second.runtime.watch(query);
		assert.equal(
			view.getSnapshot().rows[0]?.data.description,
			"Saved description",
		);
		assert.equal(view.getSnapshot().rows[0]?.fields.description?.stale, true);
		assert.equal(
			collectionReads,
			0,
			"restoration does not require a project-list permission probe",
		);
		assert.equal(
			reads,
			1,
			"restoring knowledge does not acquire project details",
		);
		const reading = second.runtime.read(query);
		await requested.promise;
		assert.equal(
			view.getSnapshot().rows[0]?.data.description,
			"Saved description",
		);
		assert.equal(view.getSnapshot().revalidating, true);
		reply.resolve();
		assert.equal(
			(await reading).rows[0]?.data.description,
			"Updated description",
		);
		second.runtime.setAccess({
			decisions: [
				{ scope: readScope("projects", { name: "team" }), state: "denied" },
			],
		});
		assert.equal(view.getSnapshot().rows[0]?.data.description, undefined);
		await second.runtime.flush();
	} finally {
		reply.resolve();
		second.dispose();
	}
});
