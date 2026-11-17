// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { browserFixture } from "./support/fixture.mjs";

test("keyboard navigation reaches main content and project selection", async (t) => {
	const { api, newPage } = await browserFixture(t);
	const page = await newPage();
	await page.goto(api.url);
	await expect(page.getByRole("main")).toHaveCount(1);
	const firstRow = await page
		.getByRole("link", { name: "Instances", exact: true })
		.boundingBox();
	const nextRow = await page
		.getByRole("link", { name: "Networks", exact: true })
		.boundingBox();
	assert.equal(Math.round(nextRow.y - firstRow.y), 40);
	await page.keyboard.press("Tab");
	await expect(
		page.getByRole("link", { name: "Skip to main content" }),
	).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.getByRole("main")).toBeFocused();
	const project = page.getByRole("combobox", {
		name: "Project",
		exact: true,
	});
	await project.focus();
	await page.keyboard.press("Enter");
	await expect(
		page.getByRole("option", { name: "default", exact: true }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(project).toBeFocused();
	await page.getByRole("link", { name: "Instances", exact: true }).click();
	await expect(page).toHaveURL(/\/ui\/instances$/);
	const parent = page.getByRole("link", {
		name: "Storage Pools",
		exact: true,
	});
	await parent.hover();
	const flyout = page.getByRole("menu", { name: "Storage Pools" });
	await expect(flyout.getByRole("menuitem")).toHaveCount(4);
	await expect(
		flyout.getByRole("menuitem", { name: "Storage Pools", exact: true }),
	).toHaveAttribute("href", "/ui/storage-pools");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("main")).toHaveCount(1);
});

test("mobile navigation provides close and focus controls and respects reduced motion", async (t) => {
	const { api, newPage } = await browserFixture(t);
	const page = await newPage({
		viewport: { width: 320, height: 740 },
		hasTouch: true,
		reducedMotion: "reduce",
	});
	await page.goto(api.url);
	const trigger = page.getByRole("button", { name: "Toggle navigation" });
	const target = await trigger.boundingBox();
	assert.ok(target.width >= 44 && target.height >= 44);
	await trigger.click();
	const dialog = page.getByRole("dialog", {
		name: "Sidebar",
		exact: true,
	});
	await expect(dialog).toBeVisible();
	const close = dialog.getByRole("button", {
		name: "Close",
		exact: true,
	});
	const closeTarget = await close.boundingBox();
	assert.ok(closeTarget.width >= 44 && closeTarget.height >= 44);
	const motion = await dialog.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			transitions: style.transitionDuration.split(",").map(Number.parseFloat),
			animation: style.animationName,
		};
	});
	assert.ok(motion.transitions.every((duration) => duration === 0));
	assert.equal(motion.animation, "none");
	assert.equal(
		await dialog
			.getByRole("link")
			.first()
			.evaluate((element) => getComputedStyle(element, "::before").transform),
		"none",
	);
	await close.click();
	await expect(dialog).toHaveCount(0);
	await expect(trigger).toBeFocused();
	assert.equal(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
		true,
	);
});
