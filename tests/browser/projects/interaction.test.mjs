// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { browserFixture } from "../support/fixture.mjs";

import { option, trigger } from "./support/options.mjs";

test("project picker supports touch, long names, keyboard activation, and reduced motion", async (t) => {
	const longName =
		"project-with-a-long-name-that-needs-the-full-accessible-label";
	const { api, newPage } = await browserFixture(t, {
		projectNames: ["default", longName],
		projectDescriptions: { default: "" },
	});
	const page = await newPage({
		viewport: { width: 320, height: 740 },
		hasTouch: true,
		reducedMotion: "reduce",
	});
	await page.goto(api.url);
	const control = trigger(page);
	const box = await control.boundingBox();
	assert.ok(box.width <= 144 && box.height >= 24 && box.height <= 32);
	await page
		.locator('.project-selector-anchor [data-align="inline-start"]')
		.tap();
	await expect(control).toBeFocused();
	await expect(option(page, longName)).toBeVisible();
	const input = trigger(page);
	const inputBox = await input.boundingBox();
	assert.ok(inputBox.height >= 24 && inputBox.height <= 32);
	const plainRow = await option(page, "default").boundingBox();
	await expect(option(page, longName)).toHaveAccessibleDescription(
		`${longName} project`,
	);
	const describedRow = await option(page, longName).boundingBox();
	assert.ok(plainRow.height >= 24 && plainRow.height <= 32);
	assert.ok(describedRow.height > plainRow.height && describedRow.height <= 48);
	await input.tap();
	await input.fill("needs-the-full");
	await expect(control).toHaveValue("needs-the-full");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await expect(control).toHaveValue("needs-the-full");
	await page.keyboard.press("Enter");
	await expect(control).toHaveValue(longName);
	await control.tap();
	await expect(page.getByText(longName, { exact: true }).first()).toBeVisible();
	const popup = page.locator("[data-slot=combobox-content]");
	const popupBox = await popup.boundingBox();
	assert.ok(popupBox.x >= 0 && popupBox.x + popupBox.width <= 320);
	assert.equal(
		await popup.evaluate((element) => getComputedStyle(element).animationName),
		"none",
	);
	assert.equal(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
		true,
	);
	await option(page, "All projects").tap();
	await expect(control).toHaveValue("All projects");
	await expect(control).toBeFocused();
	await expect(control).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
	await page.keyboard.type("def");
	await expect(control).toHaveValue("def");
	await expect(control).not.toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
	await expect(option(page, "default")).toBeVisible();
});
