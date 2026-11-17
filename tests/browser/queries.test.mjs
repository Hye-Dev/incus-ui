// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { browserFixture } from "./support/fixture.mjs";

test("project selection retries failed caller discovery without an authentication detour", {
	timeout: 60_000,
}, async (t) => {
	const { api, newPage } = await browserFixture(t, {
		discoveryUnavailable: true,
	});
	const page = await newPage();
	await page.goto(api.url);
	await page.getByRole("combobox", { name: "Project", exact: true }).click();
	const retry = page.getByRole("button", {
		name: "Retry loading projects",
		exact: true,
	});
	await retry.waitFor();
	assert.equal(api.connections, 0);
	api.recoverDiscovery();
	await retry.click();
	await expect(retry).toHaveCount(0);
	await expect.poll(() => api.connections).toBe(1);
	await page.getByRole("option", { name: "All projects", exact: true }).click();
	await expect(
		page.getByRole("combobox", { name: "Project", exact: true }),
	).toHaveValue("All projects");
	assert.equal(api.writes, 0);
});
