// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { attachClient } from "../support/client.mjs";
import { browserFixture } from "../support/fixture.mjs";

import {
	nameReads,
	option,
	projectRequests,
	reads,
	select,
	trigger,
} from "./support/options.mjs";

test("project demand follows the open picker, shared knowledge survives closing, and search stays local", {
	timeout: 60_000,
}, async (t) => {
	const { api, newContext } = await browserFixture(t, {
		projectNames: ["default", "cafe", "production", "staging", "test"],
	});
	const context = await newContext();
	const page = await context.newPage();
	await page.goto(api.url);
	await attachClient(page);
	await expect(trigger(page)).toHaveValue("All projects");
	await trigger(page).focus();
	assert.equal(nameReads(api), 0);
	api.holdProjectReads();
	await page
		.locator('.project-selector-anchor [data-align="inline-start"]')
		.click();
	await expect(trigger(page)).toBeFocused();
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toBeVisible();
	const motion = await page.evaluate(() => {
		const anchor = document.querySelector(".project-selector-anchor");
		const popup = document.querySelector('[data-slot="combobox-content"]');
		return {
			expand: getComputedStyle(anchor).transitionDuration,
			open: getComputedStyle(popup).animationDuration,
		};
	});
	assert.equal(
		motion.expand,
		motion.open,
		"search expansion and popup opening share a duration",
	);
	await expect.poll(() => nameReads(api)).toBe(1);
	const other = await context.newPage();
	await other.goto(api.url);
	await attachClient(other);
	await trigger(other).click();
	await expect(
		other.getByLabel("Loading projects", { exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	api.releaseProjectReads();
	await expect(option(other, "cafe")).toBeVisible();
	assert.equal(nameReads(api), 1);
	await expect(option(other, "production")).toHaveAccessibleDescription(
		"production project",
	);
	await expect(
		other.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	assert.equal(
		api.requests.filter(
			(request) =>
				request.path === "/1.0/projects" &&
				request.query.includes("recursion=1"),
		).length,
		1,
		"one recursive read supplies descriptions for the five visible projects",
	);
	assert.equal(
		api.requests.filter((request) => request.path.startsWith("/1.0/projects/"))
			.length,
		0,
		"the combined demand must not be split into individual project reads",
	);
	await other.keyboard.press("Escape");
	await page.evaluate(() => {
		window.projectLoadingFlash = false;
		window.projectObserver = new MutationObserver((changes) => {
			for (const change of changes)
				for (const node of change.addedNodes) {
					if (
						node instanceof Element &&
						(node.matches("[data-vem-spinner]") ||
							node.querySelector("[data-vem-spinner]"))
					)
						window.projectLoadingFlash = true;
				}
		});
		window.projectObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	});
	await trigger(page).click();
	await expect(option(page, "production")).toBeVisible();
	await expect(option(page, "production")).toHaveAccessibleDescription(
		"production project",
	);
	await expect(trigger(page)).toBeFocused();
	await expect(option(page, "All projects")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	assert.equal(await page.evaluate(() => window.projectLoadingFlash), false);
	const before = api.requests.length;
	await trigger(page).fill("CAFE");
	await expect(option(page, "cafe")).toBeVisible();
	await expect(option(page, "production")).toHaveCount(0);
	await expect(option(page, "All projects")).toBeVisible();
	await expect(trigger(page)).toHaveValue("CAFE");
	assert.equal(api.requests.length, before);
	await trigger(page).fill("CAFÉ");
	await expect(option(page, "cafe")).toHaveCount(0);
	await expect(
		page.getByText("No projects match your search.", { exact: true }),
	).toBeVisible();
	assert.equal(
		api.requests.length,
		before,
		"complete known fields also prove accent-sensitive nonmatches locally",
	);
	await page.keyboard.press("Escape");
	await expect(trigger(page)).toBeFocused();
	await page.keyboard.type("prod");
	await expect(trigger(page)).toHaveValue("prod");
	await expect(option(page, "production")).toBeVisible();
	await expect(option(page, "cafe")).toHaveCount(0);
	assert.equal(nameReads(api), 1);
	await page.keyboard.press("Escape");
	await select(page, "cafe");
	await expect(trigger(other)).toHaveValue("All projects");
	await trigger(page).click();
	await expect(trigger(page)).toHaveValue("");
	await expect(option(page, "cafe")).toHaveAttribute("aria-selected", "true");
	assert.equal(nameReads(api), 1);
	const beforeRename = reads(api);
	api.renameProject("cafe", "cafeteria");
	await expect(option(page, "cafe")).toHaveCount(0);
	await expect(option(page, "cafeteria")).toBeVisible();
	await expect(option(page, "cafeteria")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await expect(trigger(page)).toBeFocused();
	assert.equal(reads(api), beforeRename);
});

test("reloaded project lists retain saved names and descriptions while one recursive read revalidates them", {
	timeout: 60_000,
}, async (t) => {
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", "cafe", "production", "staging", "test"],
	});
	const page = await newPage();
	await page.goto(api.url);
	await trigger(page).click();
	await expect(option(page, "production")).toHaveAccessibleDescription(
		"production project",
	);
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	await option(page, "test").click();
	for (const openBeforeReady of [false, true]) {
		await page.goto("about:blank");
		await expect.poll(() => api.connections).toBe(0);
		const previousRequests = projectRequests(api).length;
		api.holdProjectReads();
		if (openBeforeReady) api.holdDiscoveryRead();
		await page.goto(api.url);
		if (!openBeforeReady) await attachClient(page);
		await expect(trigger(page)).toHaveValue("test");
		assert.equal(projectRequests(api).length, previousRequests);
		await trigger(page).click();
		if (openBeforeReady) api.releaseDiscoveryRead();
		await expect(option(page, "production")).toBeVisible();
		await expect(option(page, "production")).toHaveAccessibleDescription(
			"production project Updating description.",
		);
		await expect(
			page.getByLabel("Loading projects", { exact: true }),
		).toBeVisible();
		await expect
			.poll(() => projectRequests(api).slice(previousRequests))
			.toEqual([
				{ method: "GET", path: "/1.0/projects", query: "?recursion=1" },
			]);
		api.releaseProjectReads();
		await expect(
			page.getByLabel("Loading projects", { exact: true }),
		).toHaveCount(0);
		await expect(option(page, "production")).toHaveAccessibleDescription(
			"production project",
		);
		await page.keyboard.press("Escape");
	}
});
