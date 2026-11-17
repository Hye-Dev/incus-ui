// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { browserFixture } from "../support/fixture.mjs";

import { option, projectRequests, trigger } from "./support/options.mjs";

test("project search finds uncached offscreen descriptions and ranks name matches first", {
	timeout: 60_000,
}, async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: [
			...Array.from(
				{ length: 500 },
				(_, index) => `project-${String(index).padStart(3, "0")}`,
			),
			"zz-description",
			"zz-second",
			"zzz-needle",
			"zz-cafe",
		],
		projectDescriptions: {
			"zz-description": "Needle tools",
			"zz-second": "Shared tools",
			"zzz-needle": "Other services",
			"zz-cafe": "CAFÉ",
		},
	});
	const page = await newPage();
	await page.goto(api.url);
	await trigger(page).click();
	await expect(option(page, "project-000")).toHaveAccessibleDescription(
		"project-000 project",
	);
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	assert.equal(
		projectRequests(api).some((request) => request.path.includes("/zz")),
		false,
	);
	const beforeSearch = projectRequests(api).length;
	api.holdProjectReads();
	await trigger(page).fill("needle");
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toBeVisible();
	await expect
		.poll(() =>
			projectRequests(api)
				.slice(beforeSearch)
				.some((request) => request.query.includes("filter=")),
		)
		.toBe(true);
	await expect(option(page, "zzz-needle")).toBeVisible();
	await expect
		.poll(() =>
			projectRequests(api)
				.slice(beforeSearch)
				.some((request) => request.path === "/1.0/projects/zzz-needle"),
		)
		.toBe(true);
	api.releaseProjectReads();
	await expect(option(page, "zz-description")).toHaveAccessibleDescription(
		"Needle tools",
	);
	await expect(option(page, "zzz-needle")).toHaveAccessibleDescription(
		"Other services",
	);
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	assert.deepEqual(
		await page
			.getByRole("option")
			.evaluateAll((items) =>
				items.map(
					(item) => item.getAttribute("aria-label") ?? item.textContent,
				),
			),
		["All projects", "zzz-needle", "zz-description"],
	);
	const searchReads = projectRequests(api).slice(beforeSearch);
	assert.equal(
		searchReads.length,
		3,
		"the known name match acquires immediately; the later match needs only one remaining detail",
	);
	assert.deepEqual(
		searchReads.map((request) => request.path),
		[
			"/1.0/projects",
			"/1.0/projects/zzz-needle",
			"/1.0/projects/zz-description",
		],
	);
	assert.ok(
		searchReads.some((request) =>
			new URLSearchParams(request.query)
				.get("filter")
				?.includes("description eq"),
		),
	);
	assert.equal(
		searchReads.some(
			(request) =>
				request.path === "/1.0/projects" && !request.query.includes("filter="),
		),
		false,
		"search does not fetch the entire project inventory again",
	);
	const complete = projectRequests(api).length;
	await trigger(page).fill("NEEDLE");
	await expect(option(page, "zz-description")).toBeVisible();
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	assert.equal(
		projectRequests(api).length,
		complete,
		"case-equivalent searches reuse known membership",
	);
	await trigger(page).fill("café");
	await expect(option(page, "zz-cafe")).toHaveAccessibleDescription("CAFÉ");
	await expect(option(page, "zz-description")).toHaveCount(0);
	await page.close();
	const fresh = await newPage();
	await fresh.goto(api.url);
	await trigger(fresh).click();
	await expect(option(fresh, "project-000")).toHaveAccessibleDescription(
		"project-000 project",
	);
	await expect(
		fresh.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	const beforeTogether = projectRequests(api).length;
	await trigger(fresh).fill("tools");
	await expect(option(fresh, "zz-description")).toHaveAccessibleDescription(
		"Needle tools",
	);
	await expect(option(fresh, "zz-second")).toHaveAccessibleDescription(
		"Shared tools",
	);
	await expect(
		fresh.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	const together = projectRequests(api).slice(beforeTogether);
	assert.equal(
		together.length,
		2,
		"matching rows discovered together share one recursive representation read",
	);
	assert.ok(
		together.every(
			(request) =>
				request.path === "/1.0/projects" &&
				new URLSearchParams(request.query).has("filter"),
		),
	);
	assert.equal(new URLSearchParams(together[0].query).has("recursion"), false);
	assert.equal(new URLSearchParams(together[1].query).get("recursion"), "1");
});
