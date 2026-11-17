// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { query, stableKey } from "@hyecompany/vem-data";
import {
	createReferenceParser,
	incusRoutes,
	readScope,
} from "../../src/definition-authoring.ts";
import { projects } from "../../src/index.ts";
import { harness, sync } from "../support/domain.ts";

const urls = [
	"/1.0/instances/web?project=team",
	"/1.0/profiles/web?project=team",
	"/1.0/images/abc123?project=team",
	"/1.0/networks/private?project=team",
	"/1.0/network-acls/internal?project=team",
	"/1.0/network-zones/example.test?project=team",
	"/1.0/storage-pools/local/buckets/media?project=team&target=node-a",
	"/1.0/storage-pools/local/volumes/custom/data?project=team&target=node-a",
];

test("project responses discover reference identities without reading their endpoints or granting detail access", async () => {
	const requests: string[] = [];
	const { runtime, close } = harness(async (input) => {
		requests.push(String(input));
		return sync([{ name: "team", description: "Team", used_by: urls }]);
	});
	try {
		await runtime.read(projects.list());
		const parse = createReferenceParser(incusRoutes);
		assert.equal(
			runtime.relationship("projects", { name: "team" }, "used_by")?.complete,
			true,
		);
		for (const url of urls) {
			const target = parse(url);
			assert.ok(target);
			const result = await runtime.read(
				query({
					resource: target.resource,
					mode: "one",
					identity: target.identity,
					select: Object.keys(target.identity),
				}),
			);
			assert.deepEqual(result.rows[0]?.data, target.identity);
			assert.equal(result.rows[0]?.complete, true);
			assert.equal(
				runtime.access(readScope(target.resource, target.identity)),
				"unknown",
			);
		}
		assert.equal(requests.length, 1);
		const volumeUrl = urls[urls.length - 1];
		const volume = parse(volumeUrl);
		assert.ok(volume);
		assert.equal(volume.identity.target, "node-a");
		assert.notDeepEqual(
			volume.identity,
			parse(volumeUrl.replace("node-a", "node-b"))?.identity,
		);
		runtime.setAccess({
			contextId: "alice",
			decisions: [
				{ scope: readScope("projects", { name: "team" }), state: "denied" },
			],
		});
		assert.equal(
			runtime
				.watch(
					query({
						resource: "instances",
						mode: "one",
						identity: { project: "team", name: "web" },
						select: ["name"],
					}),
				)
				.getSnapshot().rows.length,
			0,
		);
	} finally {
		close();
	}
});

test("unknown used_by routes preserve partial relationship evidence", async () => {
	const { runtime, close } = harness(async () =>
		sync([
			{
				name: "team",
				description: "Team",
				used_by: [urls[0], "/1.0/future/things"],
			},
		]),
	);
	try {
		await runtime.read(projects.list({ select: ["name", "description"] }));
		const related = runtime.relationship(
			"projects",
			{ name: "team" },
			"used_by",
		);
		assert.equal(related?.complete, false);
		assert.equal(related?.targets.length, 1);
	} finally {
		close();
	}
});

test("storage renames update identity and project references without losing nested context or reading", async () => {
	const previous =
		"/1.0/storage-pools/local/volumes/custom/data?project=team&target=node-a";
	const next = previous.replace("/data?", "/renamed?");
	const unrelated = [
		previous.replace("node-a", "node-b"),
		previous.replace("local", "other"),
		previous.replace("team", "default"),
	];
	let reads = 0;
	const { runtime, close } = harness(async () => {
		reads++;
		return sync([
			{ name: "team", description: "Team", used_by: [previous, ...unrelated] },
		]);
	});
	try {
		await runtime.read(projects.list({ select: ["used_by"] }));
		const parse = createReferenceParser(incusRoutes);
		const before = parse(previous);
		const after = parse(next);
		assert.ok(before && after);
		const descriptor = query({ ...before, mode: "one", select: ["name"] });
		const incarnation = runtime.watch(descriptor).getSnapshot().incarnation;
		const event = {
			type: "lifecycle",
			project: "team",
			metadata: {
				action: "storage-volume-renamed",
				source: next,
				context: { old_name: "data" },
			},
		};
		runtime.event("storageVolumes", event);
		runtime.event("projects", event);
		const old = runtime.watch(descriptor).getSnapshot();
		assert.equal(old.exists, false);
		assert.deepEqual(old.identityTransitions?.[0]?.from, {
			identity: before.identity,
			incarnation,
		});
		assert.deepEqual(old.identityTransitions?.[0]?.to.identity, after.identity);
		const current = runtime
			.watch(
				query({ ...after, mode: "one", select: Object.keys(after.identity) }),
			)
			.getSnapshot();
		assert.deepEqual(current.rows[0]?.data, after.identity);
		assert.equal(
			runtime.access(readScope(after.resource, after.identity)),
			"unknown",
		);
		assert.deepEqual(
			runtime
				.watch(projects.get({ name: "team" }, { select: ["used_by"] }))
				.getSnapshot().rows[0]?.data.used_by,
			[next, ...unrelated],
		);
		assert.deepEqual(
			runtime
				.relationship("projects", { name: "team" }, "used_by")
				?.targets.map(stableKey)
				.sort(),
			[next, ...unrelated].map((url) => stableKey(parse(url))).sort(),
		);
		assert.equal(reads, 1);
	} finally {
		close();
	}
});
