// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";

import { browserFixture } from "./support/fixture.mjs";

const tools = (page) => page.getByRole("region", { name: "Data tools" });
const projectQuery = (page, mode, fields) =>
	tools(page)
		.locator('[data-query-resource="projects"]')
		.filter({
			has: page.getByRole("heading", {
				name: `projects · ${mode}`,
				exact: true,
			}),
		})
		.filter({ has: page.getByText(`Selected: ${fields}`, { exact: true }) });
async function openTools(page) {
	await page
		.getByRole("button", { name: "Open TanStack Devtools", exact: true })
		.click();
	if (!(await tools(page).isVisible()))
		await page.getByRole("button", { name: "Vem Data", exact: true }).click();
	await tools(page).waitFor();
}

async function checkActivityFeedback(page) {
	const id = await page.evaluate(async () => {
		const { client } = await import("/ui/src/development/client.ts");
		const { resources } = await import("/ui/__test-client.js");
		const action = client.run(resources.server.refreshAccess());
		await action.result;
		return action.id;
	});
	const toast = page
		.locator('[data-slot="toast"]')
		.filter({ hasText: "server: refreshAccess" });
	await expect(toast).toBeVisible();
	await page.keyboard.press("F6");
	await toast
		.getByRole("button", { name: "Close toast", exact: true })
		.press("Enter");
	await expect
		.poll(() =>
			page.evaluate(async (id) => {
				const { client } = await import("/ui/src/development/client.ts");
				return client.feedback().includes(id);
			}, id),
		)
		.toBe(false);
}

test("development tools discover the project consumer without acquiring more data", {
	timeout: 90_000,
}, async (t) => {
	const { api, newPage } = await browserFixture(t, { development: true });
	const page = await newPage({ viewport: { width: 1600, height: 1000 } });
	await page.goto(api.url);
	await page.getByRole("combobox", { name: "Project", exact: true }).click();
	await expect.poll(() => api.connections).toBe(1);
	await expect
		.poll(() =>
			api.requests.some((request) => request.path === "/1.0/projects"),
		)
		.toBe(true);
	await expect(
		page.getByRole("option", { name: "default", exact: true }),
	).toHaveAttribute("aria-description", "default project");
	await expect(
		page.getByRole("status", { name: "Loading projects", exact: true }),
	).toHaveCount(0);
	await page.keyboard.press("Escape");
	await checkActivityFeedback(page);
	const before = api.requests.length;
	await openTools(page);
	await expect(
		tools(page).getByText(/SharedWorker connection: ready/),
	).toBeVisible();
	await expect(projectQuery(page, "list", "name")).toHaveCount(1);
	await expect(projectQuery(page, "detail", "description")).toHaveCount(1);
	assert.equal(api.requests.length, before);
	await tools(page).getByRole("button", { name: "Use simulated data" }).click();
	await page.getByText("Simulated data", { exact: true }).waitFor();
	await tools(page).waitFor();
	await checkActivityFeedback(page);
	await page.getByRole("combobox", { name: "Project", exact: true }).click();
	await expect(
		page.getByRole("option", { name: "default", exact: true }),
	).toHaveAttribute("aria-description", "Default project");
	await page.keyboard.press("Escape");
	const simulatedAt = api.requests.length;
	const list = projectQuery(page, "list", "name");
	const detail = projectQuery(page, "detail", "description");
	await list.getByLabel("Acquisition state").selectOption("failed");
	await list.getByRole("button", { name: "Apply query scenario" }).click();
	await page.getByRole("combobox", { name: "Project", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Retry loading projects", exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await list.getByLabel("Acquisition state").selectOption("ready");
	await list.getByRole("button", { name: "Apply query scenario" }).click();
	await page.getByRole("combobox", { name: "Project", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Retry loading projects", exact: true }),
	).toHaveCount(0);
	await page.keyboard.press("Escape");
	await detail.getByLabel("Acquisition state").selectOption("partial");
	await detail
		.getByRole("checkbox", { name: "description", exact: true })
		.check();
	await detail.getByRole("button", { name: "Apply query scenario" }).click();
	await page.getByRole("combobox", { name: "Project", exact: true }).click();
	const warning = page.getByText("Some details unavailable", { exact: true });
	await expect(warning).toBeVisible();
	await expect(
		page.getByRole("option", { name: "default", exact: true }),
	).toBeEnabled();
	await expect(
		page.getByText("Some projects could not be loaded", { exact: false }),
	).toHaveCount(0);
	const retry = page.getByRole("button", {
		name: "Retry loading projects",
		exact: true,
	});
	await expect(retry).toHaveText("Retry");
	await expect(retry).toHaveCount(1);
	await expect(warning.locator("..")).toContainText("Retry");
	await page.setViewportSize({ width: 390, height: 740 });
	const badgeBox = await page
		.getByText("Simulated data", { exact: true })
		.boundingBox();
	const controlBox = await page
		.getByRole("combobox", { name: "Project", exact: true })
		.boundingBox();
	assert.ok(badgeBox.y >= controlBox.y + controlBox.height);
	assert.equal(api.requests.length, simulatedAt);
});
