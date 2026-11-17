// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { expect } from "@playwright/test";
import { browserFixture } from "../support/fixture.mjs";

import { inventoryReads, option, trigger } from "./support/options.mjs";

test("large project lists acquire visible descriptions and preserve search, keyboard, and measured scrolling", {
	timeout: 90_000,
}, async (t) => {
	const names = Array.from(
		{ length: 500 },
		(_, index) => `project-${String(index).padStart(3, "0")}`,
	);
	const { api, newPage } = await browserFixture(t, { projectNames: names });
	const page = await newPage({ viewport: { width: 1100, height: 800 } });
	await page.goto(api.url);
	api.holdProjectDetails();
	await trigger(page).click();
	await expect(option(page, "project-000")).toBeVisible();
	await expect
		.poll(
			() =>
				api.requests.filter((request) =>
					request.path.startsWith("/1.0/projects/"),
				).length,
		)
		.toBeGreaterThan(0);
	assert.ok((await page.getByRole("option").count()) < 20);
	assert.ok(
		!api.requests.some(
			(request) =>
				request.path === "/1.0/projects" && request.query.includes("recursion"),
		),
	);
	assert.ok(
		!api.requests.some(
			(request) => request.path === "/1.0/projects/project-100",
		),
	);
	await page
		.locator('[data-slot="combobox-content"]')
		.evaluate(async (popup) => {
			let animations = popup.getAnimations();
			while (animations.length > 0) {
				await Promise.allSettled(
					animations.map((animation) => animation.finished),
				);
				animations = popup
					.getAnimations()
					.filter((animation) => animation.playState !== "finished");
			}
		});
	const initiallyVisibleNames = await page
		.getByRole("option")
		.evaluateAll((rows) => {
			const viewport = document
				.querySelector('[role="listbox"]')
				?.getBoundingClientRect();
			return rows
				.filter((row) => {
					const bounds = row.getBoundingClientRect();
					return (
						viewport &&
						bounds.bottom > viewport.top &&
						bounds.top < viewport.bottom
					);
				})
				.map((row) => row.getAttribute("aria-label"));
		});
	const beforeHeight = (await option(page, "project-000").boundingBox()).height;
	assert.ok(beforeHeight <= 32, "loading does not reserve a description line");
	for (const name of initiallyVisibleNames.filter(Boolean)) {
		await expect(option(page, name)).toHaveAttribute("aria-busy", "true");
		await expect(option(page, name)).toHaveAccessibleDescription(
			"Loading description.",
		);
		await expect(option(page, name).locator("[data-vem-spinner]")).toHaveCount(
			0,
		);
	}
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toBeVisible();
	api.releaseProjectDetails();
	await expect(option(page, "project-000")).toHaveAccessibleDescription(
		"project-000 project",
	);
	await expect
		.poll(async () => (await option(page, "project-000").boundingBox()).height)
		.toBeGreaterThan(beforeHeight);
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	await expect(page.locator('[role="option"][aria-busy="true"]')).toHaveCount(
		0,
	);
	await expect(page.locator('[role="option"] [data-vem-spinner]')).toHaveCount(
		0,
	);
	for (const request of api.requests.filter((request) =>
		request.path.startsWith("/1.0/projects/"),
	))
		assert.ok(
			initiallyVisibleNames.includes(
				decodeURIComponent(request.path.split("/").at(-1)),
			),
			`offscreen description acquired: ${request.path}`,
		);
	api.holdProjectDetails();
	api.event("project-updated", "/1.0/projects/project-000", {}, "project-000");
	await expect(option(page, "project-000")).toHaveAttribute(
		"aria-busy",
		"true",
	);
	await expect(option(page, "project-000")).toHaveAccessibleDescription(
		"project-000 project Updating description.",
	);
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toBeVisible();
	assert.ok(
		(await option(page, "project-000").boundingBox()).height > beforeHeight,
		"the readable description remains displayed during revalidation",
	);
	api.releaseProjectDetails();
	await expect(option(page, "project-000")).toHaveAccessibleDescription(
		"project-000 project",
	);
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	const list = page.getByRole("listbox", { name: "Projects" });
	await list.evaluate((element) => {
		element.scrollTop = 3000;
	});
	await expect
		.poll(async () => await option(page, "project-000").count())
		.toBe(0);
	assert.ok((await page.getByRole("option").count()) < 20);
	await trigger(page).fill("project-499");
	await expect(option(page, "project-499")).toBeVisible();
	await expect(option(page, "project-499")).toHaveAccessibleDescription(
		"project-499 project",
	);
	assert.equal(
		inventoryReads(api),
		1,
		"search reuses the name inventory; server filtering resolves unknown descriptions",
	);
	await trigger(page).fill("");
	for (let index = 0; index < 16; index++)
		await page.keyboard.press("ArrowDown");
	await expect(option(page, "project-014")).toBeVisible();
	const highlighted = page.locator('[role="option"][data-highlighted]');
	await expect(highlighted).toBeVisible();
	assert.ok(Number(await highlighted.getAttribute("aria-posinset")) > 10);
	await trigger(page).fill("project-499");
	await expect(option(page, "project-499")).toBeVisible();
	await expect(option(page, "project-499")).toHaveAttribute(
		"aria-posinset",
		"2",
	);
	await expect(option(page, "project-499")).toHaveAttribute(
		"aria-setsize",
		"2",
	);
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Enter");
	await expect(trigger(page)).toHaveValue("project-499");
	const selectedReads = () =>
		api.requests.filter(
			(request) => request.path === "/1.0/projects/project-499",
		).length;
	const beforeReopen = selectedReads();
	await trigger(page).click();
	await expect(option(page, "project-499")).toBeVisible();
	await expect(option(page, "project-499")).toHaveAccessibleDescription(
		"project-499 project",
	);
	assert.equal(
		selectedReads(),
		beforeReopen,
		"the selected description stays cached while newly visible neighbors can acquire theirs",
	);
	assert.equal(inventoryReads(api), 1);
	await page.keyboard.press("Escape");
	api.addProject("project-500");
	await trigger(page).click();
	await trigger(page).fill("project-500");
	try {
		await expect(option(page, "project-500")).toHaveAccessibleDescription(
			"project-500 project",
		);
	} catch (error) {
		t.diagnostic(
			`Recent Incus requests: ${JSON.stringify(api.requests.slice(-40))}`,
		);
		throw error;
	}
	assert.equal(
		inventoryReads(api),
		1,
		"an event supplies the new identity without reacquiring membership",
	);
	api.releaseProjectReads({ fail: true });
	api.event("project-updated", "/1.0/projects/project-500", {}, "project-500");
	await expect(
		page.getByText("Some details unavailable", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByText("Project list incomplete", { exact: true }),
	).toHaveCount(0);
	await expect(option(page, "project-500")).toHaveAccessibleDescription(
		"project-500 project",
	);
	const retryDetails = page.getByRole("button", {
		name: "Retry loading projects",
	});
	await expect(retryDetails).toBeEnabled();
	const beforeRetry = api.requests.length;
	api.releaseProjectReads();
	await retryDetails.click();
	await expect.poll(() => api.requests.length).toBeGreaterThan(beforeRetry);
	await expect(
		page.getByLabel("Loading projects", { exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByText("Some details unavailable", { exact: true }),
	).toHaveCount(0);
	assert.deepEqual(
		api.requests.slice(beforeRetry),
		[{ method: "GET", path: "/1.0/projects/project-500", query: "" }],
		"the shared status retry only retries the failed active description demand",
	);
});
