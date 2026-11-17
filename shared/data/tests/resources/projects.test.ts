// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { readScope } from "../../src/definition-authoring.ts";
import { projectContinuity } from "../../src/internal/events/continuity.ts";
import { projects } from "../../src/resources.ts";
import { createIncusRuntime } from "../../src/runtime/create-runtime.ts";
import type { EventSocket } from "../../src/runtime/event-stream.ts";
import { harness, observe, sync } from "../support/domain.ts";
import { matchesIncusFilter } from "../support/filter.ts";

test("project search offers filtered URL membership and recursive representations without inventing descriptions", async () => {
	for (const recursive of [false, true]) {
		const items = [
			{ name: "team", description: "Other services" },
			{ name: "alpha", description: "TEAM services" },
			{ name: "other", description: "Unrelated" },
		];
		const reads: URL[] = [];
		const app = harness(async (input) => {
			const url = new URL(String(input));
			reads.push(url);
			assert.equal(url.pathname, "/1.0/projects");
			assert.equal(url.searchParams.has("recursion"), recursive);
			assert.ok(url.searchParams.get("filter"));
			const matches = items.filter((item) =>
				matchesIncusFilter(item, url.searchParams.get("filter")),
			);
			return sync(
				recursive
					? matches
					: matches.map((item) => `/1.0/projects/${item.name}`),
			);
		});
		try {
			const result = await app.runtime.read(
				projects.list({
					select: recursive ? ["name", "description"] : ["name"],
					where: {
						$or: [
							{ name: { contains: "team", case: "insensitive" } },
							{ description: { contains: "team", case: "insensitive" } },
						],
					},
				}),
			);
			assert.equal(result.confirmed.complete, true);
			assert.deepEqual(result.rows.map((row) => row.data.name).sort(), [
				"alpha",
				"team",
			]);
			assert.equal(reads.length, 1);
			const description = app.runtime.watch(
				projects.get({ name: "alpha" }, { select: ["description"] }),
				{ acquire: false },
			);
			assert.equal(
				description.getSnapshot().rows[0]?.data.description,
				recursive ? "TEAM services" : undefined,
			);
			description.dispose();
		} finally {
			app.close();
		}
	}
});

test("project search encodes literal text safely and keeps accents significant", async () => {
	for (const text of [
		"TEAM",
		"café",
		"cafe",
		"K",
		"[x].*",
		"a,b",
		"one\ntwo",
		'" or name eq .*',
		"🦊",
	]) {
		const items = [
			{ name: "match", description: `before ${text} after` },
			{ name: "accent", description: "CAFÉ" },
			{ name: "plain", description: "cafe" },
			{ name: "kelvin", description: "K" },
			{ name: "unrelated", description: "A project" },
		];
		const app = harness(async (input) => {
			const url = new URL(String(input));
			const expression = url.searchParams.get("filter");
			assert.ok(expression);
			return sync(
				items
					.filter((item) => matchesIncusFilter(item, expression))
					.map((item) => `/1.0/projects/${item.name}`),
			);
		});
		try {
			const result = await app.runtime.read(
				projects.list({
					select: ["name"],
					where: { description: { contains: text, case: "insensitive" } },
				}),
			);
			const names = result.rows.map((row) => row.data.name).sort();
			assert.equal(result.confirmed.complete, true, text);
			assert.deepEqual(
				names,
				text === "café"
					? ["accent", "match"]
					: text === "cafe"
						? ["match", "plain"]
						: text === "K"
							? ["kelvin", "match"]
							: ["match"],
				text,
			);
		} finally {
			app.close();
		}
	}
});

test("unsupported Incus text semantics use a broader representation and then reuse known values", async () => {
	for (const text of ["cafe", "CAFÉ"]) {
		const reads: URL[] = [];
		const app = harness(async (input) => {
			const url = new URL(String(input));
			reads.push(url);
			assert.equal(url.pathname, "/1.0/projects");
			assert.equal(url.searchParams.get("recursion"), "1");
			assert.equal(url.searchParams.has("filter"), false);
			return sync([
				{ name: "team", description: "CAFÉ" },
				{ name: "other", description: "Other" },
			]);
		});
		try {
			const query = projects.list({
				select: ["name"],
				where: {
					description: {
						contains: text,
						case: "insensitive",
						accents: "insensitive",
					},
				},
			});
			const result = await app.runtime.read(query);
			assert.equal(result.confirmed.complete, true);
			assert.deepEqual(
				result.rows.map((row) => row.data.name),
				["team"],
			);
			await app.runtime.read(query);
			assert.equal(reads.length, 1);
		} finally {
			app.close();
		}
	}
});

test("project acquisition weighs known collection size against the combined detail demand", async () => {
	for (const [count, requested, cached, bulk] of [
		[40, 3, 0, false],
		[4, 4, 0, true],
		[5, 2, 0, false],
		[5, 3, 0, false],
		[5, 5, 0, true],
		[8, 3, 0, false],
		[5, 3, 2, false],
		[5, 4, 1, false],
	] as const) {
		const names = Array.from(
			{ length: count },
			(_, index) => `project-${index}`,
		);
		const reads: URL[] = [];
		const representation = (name: string) => ({
			name,
			description: `${name} notes`,
		});
		const app = harness(async (input) => {
			const url = new URL(String(input));
			reads.push(url);
			return sync(
				url.pathname === "/1.0/projects"
					? url.searchParams.has("recursion")
						? names.map(representation)
						: names.map((name) => `/1.0/projects/${name}`)
					: representation(
							decodeURIComponent(url.pathname.split("/").at(-1) ?? ""),
						),
			);
		});
		try {
			await app.runtime.read(projects.list({ select: ["name"] }));
			await Promise.all(
				names
					.slice(0, cached)
					.map((name) =>
						app.runtime.read(
							projects.get({ name }, { select: ["description"] }),
						),
					),
			);
			reads.length = 0;
			const results = await Promise.all(
				names
					.slice(0, requested)
					.map((name) =>
						app.runtime.read(
							projects.get({ name }, { select: ["description"] }),
						),
					),
			);
			assert.ok(results.every((result) => result.rows[0]?.complete));
			assert.equal(
				reads.some((url) => url.searchParams.has("recursion")),
				bulk,
			);
			assert.equal(reads.length, bulk ? 1 : requested - cached);
		} finally {
			app.close();
		}
	}
});

test("an explicit cold project read uses its detail endpoint without acquiring the inventory", async () => {
	const app = harness(async (input, init) => {
		assert.equal(new URL(String(input)).pathname, "/1.0/projects/team");
		assert.equal(init?.priority, "high");
		return sync({ name: "team", description: "Team" });
	});
	try {
		const result = await app.runtime.read(
			projects.get({ name: "team" }, { select: ["name"] }),
		);
		assert.equal(result.rows[0]?.data.name, "team");
	} finally {
		app.close();
	}
});

test("project cost estimates retain known population across event connection changes", async () => {
	for (const connection of ["before", "after", "gap"] as const) {
		const socket: EventSocket = {
			onopen: null,
			onclose: null,
			onerror: null,
			onmessage: null,
			close() {},
		};
		const names = ["default", "team", "production", "staging", "test"];
		const reads: string[] = [];
		const representation = (name: string) => ({
			name,
			description: `${name} notes`,
		});
		const app = await createIncusRuntime({
			baseUrl: "https://incus.test",
			socket: () => socket,
			fetch: async (input) => {
				const url = new URL(String(input));
				if (url.pathname === "/1.0")
					return sync({
						auth: "trusted",
						auth_user_name: "alice",
						auth_user_method: "tls",
						config: {},
					});
				reads.push(url.pathname + url.search);
				return sync(
					url.pathname === "/1.0/projects"
						? url.searchParams.has("recursion")
							? names.map(representation)
							: names.map((name) => `/1.0/projects/${name}`)
						: representation(
								decodeURIComponent(url.pathname.split("/").at(-1) ?? ""),
							),
				);
			},
		});
		try {
			if (connection !== "after") socket.onopen?.(new Event("open"));
			await app.runtime.read(projects.list({ select: ["name"] }));
			if (connection === "after") socket.onopen?.(new Event("open"));
			if (connection === "gap")
				socket.onclose?.(new Event("close") as CloseEvent);
			reads.length = 0;
			const results = await Promise.all(
				names.map((name) =>
					app.runtime.read(projects.get({ name }, { select: ["description"] })),
				),
			);
			assert.ok(results.every((result) => result.rows[0]?.complete));
			assert.deepEqual(reads, ["/1.0/projects?recursion=1"], connection);
		} finally {
			app.dispose();
		}
	}
});

test("default project reads are complete without relationship data and reuse the acquired representation", async () => {
	let reads = 0;
	const app = harness(async () => {
		reads++;
		return sync([{ name: "team", description: "Team services" }]);
	});
	try {
		const list = await app.runtime.read(projects.list());
		assert.equal(list.settled, true);
		assert.equal(list.rows[0]?.complete, true);
		assert.deepEqual(list.rows[0]?.data, {
			name: "team",
			description: "Team services",
		});
		const detail = await app.runtime.read(projects.get({ name: "team" }));
		assert.equal(detail.rows[0]?.complete, true);
		assert.deepEqual(detail.rows[0]?.data, list.rows[0]?.data);
		assert.equal(reads, 1);
	} finally {
		app.close();
	}
});

test("URL and recursive collections retain the same membership and disclosure guarantees", async () => {
	for (const recursive of [false, true]) {
		const app = harness(async (input) => {
			const url = new URL(String(input));
			assert.equal(url.pathname, "/1.0/projects");
			assert.equal(url.searchParams.get("recursion"), recursive ? "1" : null);
			return sync(
				recursive
					? [
							{ name: "default", description: "Default project" },
							{ name: "team", description: "Team services" },
						]
					: ["/1.0/projects/default", "/1.0/projects/team"],
			);
		});
		try {
			const descriptor = projects.list({
				select: recursive ? ["name", "description"] : ["name"],
			});
			const list = await app.runtime.read(descriptor);
			assert.equal(list.confirmed.complete, true);
			assert.equal(list.confirmed.knownCount, 2);
			assert.equal(list.confirmed.total, 2);
			assert.deepEqual(list.rows.map((row) => row.data.name).sort(), [
				"default",
				"team",
			]);
			app.runtime.setAccess({
				contextId: "alice",
				decisions: [
					{ scope: readScope("projects", { name: "team" }), state: "denied" },
				],
			});
			const remaining = app.runtime.watch(descriptor).getSnapshot();
			assert.deepEqual(
				remaining.rows.map((row) => row.data.name),
				["default"],
			);
			assert.equal(remaining.confirmed.complete, false);
			assert.equal(remaining.confirmed.total, undefined);
		} finally {
			app.close();
		}
	}
});

test("identity names survive first operation coverage and renames while a real event gap still acquires membership", async () => {
	const socket: EventSocket = {
		onopen: null,
		onclose: null,
		onerror: null,
		onmessage: null,
		close() {},
	};
	let names = ["default", "team"];
	const reads: string[] = [];
	const app = await createIncusRuntime({
		baseUrl: "https://incus.test",
		socket: () => socket,
		fetch: async (input) => {
			const url = new URL(String(input));
			if (url.pathname === "/1.0")
				return sync({
					auth: "trusted",
					auth_user_name: "alice",
					auth_user_method: "tls",
					config: {},
				});
			reads.push(url.pathname + url.search);
			assert.equal(url.pathname, "/1.0/projects");
			return sync(names.map((name) => `/1.0/projects/${name}`));
		},
	});
	const query = projects.list({ select: ["name"] });
	const handle = app.runtime.watch(query);
	const stop = handle.subscribe(() => {});
	const emit = (event: unknown) =>
		socket.onmessage?.(
			new MessageEvent("message", { data: JSON.stringify(event) }),
		);
	try {
		socket.onopen?.(new Event("open"));
		await app.runtime.read(query);
		assert.equal(reads.length, 1);
		emit({
			type: "operation",
			metadata: { id: "rename-operation", status: "Running", status_code: 103 },
		});
		await setImmediate();
		assert.equal(
			reads.length,
			1,
			"first default-project event must not re-read a known name",
		);
		names = ["default", "company"];
		emit(renamed("team", "company"));
		await setImmediate();
		assert.deepEqual(
			handle
				.getSnapshot()
				.rows.map((row) => row.data.name)
				.sort(),
			[...names].sort(),
		);
		assert.equal(handle.getSnapshot().confirmed.complete, true);
		assert.equal(reads.length, 1);
		await app.runtime.read(
			projects.get({ name: "company" }, { select: ["name"] }),
		);
		assert.equal(
			reads.length,
			1,
			"following a proven rename must reuse its name evidence",
		);
		names = ["default", "company", "created-during-gap"];
		socket.onclose?.(new Event("close") as CloseEvent);
		await app.runtime.read(query);
		assert.equal(
			reads.length,
			2,
			"a stream gap still requires collection evidence",
		);
		assert.equal(handle.getSnapshot().rows.length, 3);
	} finally {
		stop();
		handle.dispose();
		app.dispose();
	}
});

function renamed(from: string, to: string) {
	return {
		type: "lifecycle",
		project: to,
		metadata: {
			action: "project-renamed",
			source: `/1.0/projects/${to}`,
			context: { old_name: from },
		},
	};
}

test("project rename supplies proven identity transitions without granting destination read access", () => {
	const app = harness(async () => {
		throw new Error("Project identity events need no acquisition");
	});
	try {
		observe(app.runtime, "projects", { name: "team" }, { name: "team" });
		const query = projects.get({ name: "team" }, { select: ["name"] });
		const before = app.runtime.watch(query).getSnapshot();
		assert.equal(before.exists, true);
		assert.ok(before.incarnation);
		app.runtime.setContinuity(projectContinuity("company"), "live");
		app.runtime.event("projects", renamed("team", "company"));
		const old = app.runtime.watch(query).getSnapshot();
		assert.equal(old.exists, false);
		assert.equal(old.rows.length, 0);
		assert.deepEqual(old.identityTransitions?.[0]?.from, {
			identity: { name: "team" },
			incarnation: before.incarnation,
		});
		assert.deepEqual(old.identityTransitions?.[0]?.to.identity, {
			name: "company",
		});
		const current = app.runtime
			.watch(projects.get({ name: "company" }, { select: ["name"] }))
			.getSnapshot();
		assert.equal(current.rows[0]?.data.name, "company");
		assert.equal(
			old.identityTransitions?.[0]?.to.incarnation,
			current.incarnation,
		);
		assert.equal(
			app.runtime.access(readScope("projects", { name: "company" })),
			"unknown",
		);
	} finally {
		app.close();
	}
});

test("project rename chains preserve the selected incarnation when the old name is reused", () => {
	const app = harness(async () => {
		throw new Error("Project identity events need no acquisition");
	});
	try {
		observe(app.runtime, "projects", { name: "team" }, { name: "team" });
		const query = projects.get({ name: "team" }, { select: ["name"] });
		const original = app.runtime.watch(query).getSnapshot().incarnation;
		for (const name of ["group", "company"])
			app.runtime.setContinuity(projectContinuity(name), "live");
		app.runtime.event("projects", renamed("team", "group"));
		app.runtime.event("projects", renamed("group", "company"));
		app.runtime.event("projects", {
			type: "lifecycle",
			project: "team",
			metadata: { action: "project-created", source: "/1.0/projects/team" },
		});
		const reused = app.runtime.watch(query).getSnapshot();
		assert.equal(reused.exists, true);
		assert.notEqual(reused.incarnation, original);
		const transition = reused.identityTransitions?.find(
			(item) => item.from.incarnation === original,
		);
		assert.deepEqual(transition?.to.identity, { name: "company" });
		assert.equal(
			reused.identityTransitions?.some(
				(item) => item.from.incarnation === reused.incarnation,
			),
			false,
		);
	} finally {
		app.close();
	}
});

test("project list denial is scoped to acquisition and permits retry without revoking readable details", async () => {
	let status = 403;
	const app = harness(async (input) => {
		const url = new URL(String(input));
		if (url.pathname !== "/1.0/projects")
			throw Error("Known details should not be acquired");
		return status === 200
			? sync(["/1.0/projects/team"])
			: Response.json(
					{ type: "error", error: "Request rejected", error_code: status },
					{ status },
				);
	});
	const list = app.runtime.watch(projects.list({ select: ["name"] }));
	try {
		observe(app.runtime, "projects", { name: "team" }, { name: "team" });
		const denied = await list.retry();
		assert.equal(denied.settled, true);
		assert.deepEqual(denied.issues, [
			{ kind: "access", message: "Listing projects is not permitted." },
		]);
		assert.equal(app.runtime.access("authenticated"), "allowed");
		const detail = await app.runtime.read(
			projects.get({ name: "team" }, { select: ["name"] }),
		);
		assert.equal(detail.rows[0]?.data.name, "team");
		assert.deepEqual(detail.issues, []);
		status = 500;
		assert.equal((await list.retry()).issues[0]?.kind, "read");
		status = 200;
		const retried = await list.retry();
		assert.deepEqual(retried.issues, []);
		assert.equal(retried.confirmed.complete, true);
	} finally {
		list.dispose();
		app.close();
	}
});
