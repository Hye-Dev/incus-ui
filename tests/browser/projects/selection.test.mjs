// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { attachClient } from "../support/client.mjs";
import { browserFixture } from "../support/fixture.mjs";

import { projectRequests, select, trigger } from "./support/options.mjs";

test("restored project preferences retain target without acquiring project evidence", async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", "team"],
	});
	const page = await newPage();
	await page.goto(api.url);
	await page.evaluate(() => {
		sessionStorage.setItem(
			"incus-ui:project-scope:v1",
			JSON.stringify({
				project: "team",
				target: "member-1",
				incarnation: "obsolete-runtime-identity",
			}),
		);
	});
	await page.reload();
	await attachClient(page);
	await expect(trigger(page)).toHaveValue("team");
	await expect(trigger(page)).toHaveAccessibleDescription("team");
	await expect(page.getByRole("listbox")).toHaveCount(0);
	assert.deepEqual(projectRequests(api), []);
	await select(page, "default");
	const savedScope = () =>
		page.evaluate(() =>
			JSON.parse(sessionStorage.getItem("incus-ui:project-scope:v1")),
		);
	assert.deepEqual(await savedScope(), {
		project: "default",
		target: "member-1",
	});
	await select(page, "All projects");
	assert.deepEqual(await savedScope(), {
		allProjects: true,
		target: "member-1",
	});
	await page.reload();
	await expect(trigger(page)).toHaveValue("All projects");
	assert.deepEqual(await savedScope(), {
		allProjects: true,
		target: "member-1",
	});
});

test("malformed or blocked project preference storage does not break selection", {
	timeout: 60_000,
}, async (t) => {
	const { api, newPage } = await browserFixture(t);
	const page = await newPage();
	await page.goto(api.url);
	for (const saved of [
		"{",
		"null",
		'{"project":false}',
		'{"project":"team","allProjects":true}',
		'{"project":"team","target":23}',
	]) {
		await page.evaluate(
			(value) => sessionStorage.setItem("incus-ui:project-scope:v1", value),
			saved,
		);
		await page.reload();
		await expect(trigger(page)).toHaveValue("All projects");
	}
	await page.addInitScript(() => {
		for (const method of ["getItem", "setItem", "removeItem"]) {
			const original = Storage.prototype[method];
			Storage.prototype[method] = function (key, ...args) {
				if (key === "incus-ui:project-scope:v1")
					throw new DOMException("Storage is blocked", "SecurityError");
				return original.call(this, key, ...args);
			};
		}
	});
	await page.reload();
	await expect(trigger(page)).toHaveValue("All projects");
	await select(page, "default");
	await expect(trigger(page)).toHaveValue("default");
	await page.reload();
	await expect(trigger(page)).toHaveValue("All projects");
});

test("project selection survives reloads independently per tab, including renames and unavailable choices", {
	timeout: 60_000,
}, async (t) => {
	const { api, newContext } = await browserFixture(t, {
		projectNames: ["default", "team"],
	});
	const context = await newContext();
	const page = await context.newPage();
	await page.goto(api.url);
	await select(page, "team");
	const other = await context.newPage();
	await other.goto(api.url);
	await expect(trigger(other)).toHaveValue("All projects");
	await select(other, "default");
	const requests = projectRequests(api);
	await page.reload();
	await expect(trigger(page)).toHaveValue("team");
	await other.reload();
	await expect(trigger(other)).toHaveValue("default");
	assert.deepEqual(projectRequests(api), requests);
	await expect.poll(() => api.connections).toBe(1);
	api.renameProject("team", "group");
	await expect(trigger(page)).toHaveValue("group");
	await page.reload();
	await expect(trigger(page)).toHaveValue("group");
	api.deleteProject("group");
	await expect(trigger(page)).toHaveAccessibleDescription(
		/no longer available/,
	);
	await page.reload();
	await expect(trigger(page)).toHaveValue("group");
	await expect(trigger(page)).toHaveAccessibleDescription(
		/no longer available/,
	);
	assert.deepEqual(projectRequests(api), requests);
	await select(page, "All projects");
	assert.equal(
		await page.evaluate(() =>
			sessionStorage.getItem("incus-ui:project-scope:v1"),
		),
		null,
	);
	await page.reload();
	await expect(trigger(page)).toHaveValue("All projects");
	await expect(trigger(other)).toHaveValue("default");
});
