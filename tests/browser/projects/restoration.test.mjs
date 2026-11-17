// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { attachClient } from "../support/client.mjs";
import { browserFixture } from "../support/fixture.mjs";

test("a restored selection label does not acquire details before the project list arrives", async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: [
			"test",
			...Array.from(
				{ length: 19 },
				(_, index) => `project-${String(index).padStart(3, "0")}`,
			),
		],
	});
	const page = await newPage();
	await page.goto(api.url);
	await page.evaluate(() => {
		sessionStorage.setItem(
			"incus-ui:project-scope:v1",
			JSON.stringify({ project: "test" }),
		);
	});
	await page.reload();
	await attachClient(page);
	const input = page.getByRole("combobox", { name: "Project", exact: true });
	await expect(input).toHaveValue("test");
	const projectReads = () =>
		api.requests.filter((request) => request.path.startsWith("/1.0/projects"));
	assert.deepEqual(projectReads(), []);
	api.holdProjectReads();
	api.holdProjectDetails();
	await input.click();
	await expect(
		page.getByRole("option", { name: "test", exact: true }),
	).toBeVisible();
	await expect.poll(() => projectReads().length).toBeGreaterThan(0);
	assert.deepEqual(projectReads(), [
		{ method: "GET", path: "/1.0/projects", query: "" },
	]);
	api.releaseProjectReads();
	await expect.poll(() => projectReads().length).toBeGreaterThan(1);
	const expected = projectReads();
	const visibleNames = await page
		.getByRole("option")
		.evaluateAll((options) =>
			options.map((option) => option.getAttribute("aria-label")),
		);
	for (const request of expected.slice(1)) {
		assert.equal(request.method, "GET");
		assert.equal(request.query, "");
		assert.match(request.path, /^\/1\.0\/projects\/project-\d+$/);
		assert.ok(visibleNames.includes(request.path.split("/").at(-1)));
	}
	assert.equal(
		new Set(expected.map((request) => request.path)).size,
		expected.length,
	);
	api.releaseProjectDetails();
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	const completed = projectReads();
	assert.equal(
		completed.filter((request) => request.path === "/1.0/projects").length,
		1,
	);
	assert.equal(
		new Set(completed.map((request) => request.path)).size,
		completed.length,
	);
	for (const request of completed.slice(1))
		assert.match(request.path, /^\/1\.0\/projects\/project-\d+$/);
});

test("a new owner retains the selected scope without reads, then revalidates the open list in one recursive read", async (t) => {
	const { api, newContext } = await browserFixture(t, {
		projectNames: [
			"default",
			"test",
			...Array.from(
				{ length: 10 },
				(_, index) => `project-${String(index).padStart(3, "0")}`,
			),
		],
	});
	const original = await newContext();
	const page = await original.newPage();
	await page.goto(api.url);
	await page.getByRole("combobox", { name: "Project", exact: true }).click();
	await expect(
		page.getByRole("option", { name: "default", exact: true }),
	).toHaveAccessibleDescription("default project");
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	await page
		.getByRole("combobox", { name: "Project", exact: true })
		.fill("test");
	await page.getByRole("option", { name: "test", exact: true }).click();
	const selected = await page.evaluate(() =>
		sessionStorage.getItem("incus-ui:project-scope:v1"),
	);
	let saved;
	await expect
		.poll(async () => {
			saved = await original.storageState({ indexedDB: true });
			return JSON.stringify(saved);
		})
		.toContain("default project");
	await original.close();
	await expect.poll(() => api.connections).toBe(0);
	const start = api.requests.length;
	api.holdProjectDetails();
	const restored = await newContext({ storageState: saved });
	await restored.addInitScript(
		({ origin, selected }) => {
			if (location.origin === origin)
				sessionStorage.setItem("incus-ui:project-scope:v1", selected);
		},
		{ origin: new URL(api.url).origin, selected },
	);
	const returningPage = await restored.newPage();
	await returningPage.goto(api.url);
	await attachClient(returningPage);
	await expect(
		returningPage.getByRole("combobox", { name: "Project", exact: true }),
	).toHaveValue("test");
	await expect
		.poll(() =>
			returningPage.evaluate(() => {
				const known = window.vem.client.watch(
					window.vem.projects.list({ select: ["name"] }),
				);
				const count = known.getSnapshot().rows.length;
				known.dispose();
				return count;
			}),
		)
		.toBe(12);
	assert.deepEqual(
		api.requests
			.slice(start)
			.filter((request) => request.path.startsWith("/1.0/projects")),
		[],
	);
	await returningPage
		.getByRole("combobox", { name: "Project", exact: true })
		.click();
	const row = returningPage.getByRole("option", {
		name: "test",
		exact: true,
	});
	await expect(row).toHaveAccessibleDescription(
		"test project Updating description.",
	);
	await expect(
		row.locator(".incus-project-selector-description"),
	).toBeVisible();
	await expect(
		row.locator(".incus-project-selector-description"),
	).toContainText("test project");
	await expect(
		returningPage.getByLabel("Loading projects", { exact: true }),
	).toBeVisible();
	await expect(
		returningPage.locator('[role="option"] [data-vem-spinner]'),
	).toHaveCount(0);
	assert.deepEqual(
		api.requests
			.slice(start)
			.filter((request) => request.path.startsWith("/1.0/projects")),
		[{ method: "GET", path: "/1.0/projects", query: "?recursion=1" }],
	);
	api.releaseProjectDetails();
	await expect(row).toHaveAccessibleDescription("test project");
	await expect(
		returningPage.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	assert.deepEqual(
		api.requests
			.slice(start)
			.filter((request) => request.path.startsWith("/1.0/projects")),
		[{ method: "GET", path: "/1.0/projects", query: "?recursion=1" }],
	);
});

test("stale permitted choices revalidate together without reading names before descriptions", async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", "team", "production", "staging", "test"],
	});
	const page = await newPage();
	await page.goto(api.url);
	const input = page.getByRole("combobox", { name: "Project", exact: true });
	const row = page.getByRole("option", { name: "default", exact: true });
	const spinner = page.getByLabel("Loading projects", { exact: true });
	await input.click();
	await expect(row).toHaveAccessibleDescription("default project");
	await expect(spinner).toHaveCount(0);
	await page.keyboard.press("Escape");
	api.disconnectEvents();
	await expect.poll(() => api.connections).toBe(0);
	const start = api.requests.length;
	api.holdProjectDetails();
	await input.click();
	await expect(row).toHaveAccessibleDescription(
		"default project Updating description.",
	);
	await expect(spinner).toBeVisible();
	await expect
		.poll(
			() =>
				api.requests
					.slice(start)
					.filter((request) => request.path.startsWith("/1.0/projects")).length,
		)
		.toBe(1);
	api.releaseProjectDetails();
	await expect(row).toHaveAccessibleDescription("default project");
	await expect(spinner).toHaveCount(0);
	assert.deepEqual(
		api.requests
			.slice(start)
			.filter((request) => request.path.startsWith("/1.0/projects")),
		[{ method: "GET", path: "/1.0/projects", query: "?recursion=1" }],
	);
});
