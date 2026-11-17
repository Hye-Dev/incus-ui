// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { attachClient } from "../support/client.mjs";
import { browserFixture } from "../support/fixture.mjs";

import {
	option,
	projectRequests,
	reads,
	select,
	trigger,
} from "./support/options.mjs";

test("project acquisition failure retains permitted content, and retry and proven emptiness remain distinct", {
	timeout: 60_000,
}, async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", "team"],
	});
	const page = await newPage();
	await page.goto(api.url);
	await select(page, "team");
	await expect.poll(() => api.connections).toBe(1);
	api.event("project-updated", "/1.0/projects/team", {}, "team");
	api.holdProjectReads();
	api.disconnectEvents();
	await expect.poll(() => api.connections).toBe(0);
	await trigger(page).click();
	await expect(option(page, "team")).toBeVisible();
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toBeVisible();
	await page.evaluate(() => {
		window.projectStatusTransitions = [];
		document.addEventListener("transitionrun", (event) => {
			if (event.target.matches(".project-selector-message"))
				window.projectStatusTransitions.push(event.propertyName);
		});
	});
	api.releaseProjectReads({ fail: true });
	const retry = page.getByRole("button", {
		name: "Retry loading projects",
		exact: true,
	});
	await expect(retry).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() => window.projectStatusTransitions.includes("opacity")),
		)
		.toBe(true);
	await expect(option(page, "team")).toBeVisible();
	await expect(trigger(page)).toHaveAccessibleDescription(/^team/);
	await expect(trigger(page)).not.toHaveAccessibleDescription(
		/no longer available/,
	);
	const selectedRetry = page.getByRole("button", {
		name: "Retry selected project",
		exact: true,
	});
	await expect(selectedRetry).toHaveCount(0);
	api.releaseProjectReads();
	await retry.click();
	await expect(retry).toHaveCount(0);
	await page
		.getByRole("combobox", { name: "Project", exact: true })
		.fill("unknown");
	await expect(
		page.getByText("No projects match your search.", { exact: true }),
	).toBeVisible();
	await expect(option(page, "All projects")).toBeVisible();
	const { api: empty, newPage: newEmptyPage } = await browserFixture(t, {
		projectNames: [],
	});
	const emptyPage = await newEmptyPage();
	await emptyPage.goto(empty.url);
	await trigger(emptyPage).click();
	await expect.poll(() => reads(empty)).toBe(1);
	await expect(
		emptyPage.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	await expect(
		emptyPage.getByText("No projects are available.", { exact: true }),
	).toHaveCount(0);
	await expect(option(emptyPage, "All projects")).toBeEnabled();
});

test("access withdrawal preserves the choice and missed rename evidence never becomes an inferred alias", {
	timeout: 60_000,
}, async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", "team"],
	});
	const page = await newPage();
	await page.goto(api.url);
	await select(page, "team");
	await attachClient(page);
	api.setTrusted(false);
	await page.evaluate(
		() => window.vem.client.run(window.vem.server.refreshAccess()).result,
	);
	await expect(trigger(page)).toHaveValue("team");
	await expect(trigger(page)).toHaveAccessibleDescription(
		/team is not accessible with your current permissions\./i,
	);
	await trigger(page).click();
	await expect(
		page
			.getByLabel("Choose project")
			.getByText("team is not accessible with your current permissions.", {
				exact: true,
			}),
	).toBeVisible();
	await expect(page.getByText(/Select it again to continue/)).toHaveCount(0);
	await page.keyboard.press("Escape");
	api.setTrusted(true);
	await page.evaluate(
		() => window.vem.client.run(window.vem.server.refreshAccess()).result,
	);
	await expect(trigger(page)).toHaveAccessibleDescription("team");
	await select(page, "team");
	await expect(trigger(page)).not.toHaveAccessibleDescription(
		/could not be verified|not accessible/,
	);
	api.event("project-updated", "/1.0/projects/team", {}, "team");
	api.disconnectEvents();
	await expect.poll(() => api.connections).toBe(0);
	const beforeGap = projectRequests(api);
	api.renameProject("team", "new-team");
	api.reconnectEvents();
	await expect.poll(() => api.connections).toBe(1);
	await expect(trigger(page)).toHaveAccessibleDescription(
		"team could not be verified. Select it again to continue.",
	);
	await expect(trigger(page)).toHaveValue("team");
	assert.deepEqual(projectRequests(api), beforeGap);
	await select(page, "new-team");
});

test("permission-filtered project choices preserve All projects as an aggregate scope", async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", "team", "private"],
	});
	api.setProjectAccess("private", false);
	const page = await newPage();
	await page.goto(api.url);
	await expect(trigger(page)).toHaveValue("All projects");
	assert.equal(reads(api), 0);
	await trigger(page).click();
	await expect(option(page, "team")).toHaveAccessibleDescription(
		"team project",
	);
	await expect(page.getByRole("option")).toHaveCount(3);
	await expect(option(page, "private")).toHaveCount(0);
	await expect(option(page, "All projects")).toBeEnabled();
	await expect(option(page, "All projects")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await option(page, "team").click();
	await select(page, "All projects");
	assert.equal(api.writes, 0);
	assert.equal(
		api.requests.some((request) => request.path === "/1.0/projects/private"),
		false,
	);
});

test("denied project listing quietly retains the selected scope", async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", "team"],
	});
	const page = await newPage();
	await page.goto(api.url);
	api.setProjectListAccess(false);
	await trigger(page).click();
	await expect.poll(() => reads(api)).toBeGreaterThan(0);
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	await expect(page.getByRole("option")).toHaveCount(1);
	await expect(option(page, "All projects")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await expect(
		page.getByText("Could not load projects", { exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Retry loading projects" }),
	).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(trigger(page)).toHaveAccessibleDescription("All projects");
	api.setProjectListAccess(true);
	await attachClient(page);
	await page.evaluate(async () => {
		const query = window.vem.client.watch(
			window.vem.projects.list({ select: ["name"] }),
		);
		await query.retry();
		query.dispose();
	});
	await select(page, "team");
	await expect.poll(() => api.connections).toBe(1);
	api.setProjectListAccess(false);
	api.disconnectEvents();
	await expect.poll(() => api.connections).toBe(0);
	const before = reads(api);
	await trigger(page).click();
	await expect.poll(() => reads(api)).toBeGreaterThan(before);
	await expect(page.getByRole("option")).toHaveCount(1);
	await expect(option(page, "team")).toHaveAttribute("aria-selected", "true");
	await expect(
		page.getByText("Could not load projects", { exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Retry loading projects" }),
	).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(trigger(page)).toHaveValue("team");
});
