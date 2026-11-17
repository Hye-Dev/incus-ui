// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { browserFixture } from "../support/fixture.mjs";

import {
	option,
	projectRequests,
	select,
	trigger,
} from "./support/options.mjs";

test("selected project follows proven rename chains while the picker is closed and retains deletions", {
	timeout: 60_000,
}, async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", "team"],
	});
	const page = await newPage();
	await page.goto(api.url);
	await select(page, "team");
	await expect.poll(() => api.connections).toBe(1);
	const beforeRename = projectRequests(api);
	api.renameProject("team", "group");
	api.renameProject("group", "company");
	api.addProject("team");
	await expect(trigger(page)).toHaveValue("company");
	assert.deepEqual(projectRequests(api), beforeRename);
	await select(page, "team");
	await expect(trigger(page)).toHaveValue("team");
	api.deleteProject("team");
	await expect(trigger(page)).toHaveAccessibleDescription(
		/no longer available/,
	);
	await expect(trigger(page)).toHaveValue("team");
	await trigger(page).click();
	await expect(option(page, "team")).toBeDisabled();
	await expect(
		page
			.getByLabel("Choose project")
			.getByText("team is no longer available.", {
				exact: true,
			}),
	).toBeVisible();
	await page.keyboard.press("Escape");
	api.addProject("team");
	await expect(trigger(page)).toHaveValue("team");
	await trigger(page).click();
	await expect(option(page, "team")).toBeEnabled();
	await option(page, "team").click();
	await expect(trigger(page)).not.toHaveAccessibleDescription(
		/no longer|could not be verified/,
	);
});
