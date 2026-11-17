// SPDX-FileCopyrightText: 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { createServer } from "vite";
import { browser } from "../../../../tests/browser/support/browser.mjs";

test("shared components work without the application shell, styles, or Tailwind", async (t) => {
	const root = fileURLToPath(new URL("./fixture", import.meta.url));
	const server = await createServer({
		configFile: false,
		root,
		oxc: { jsx: { runtime: "automatic" } },
		server: { host: "127.0.0.1", port: 0 },
		optimizeDeps: { include: ["react", "react-dom/client"] },
	});
	await server.listen();
	t.after(() => server.close());
	const instance = await browser();
	for (const mobile of [false, true]) {
		const page = await instance.newPage({
			viewport: mobile
				? { width: 360, height: 640 }
				: { width: 1000, height: 700 },
			colorScheme: mobile ? "dark" : "light",
			reducedMotion: mobile ? "reduce" : "no-preference",
		});
		t.after(() => page.close());
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(server.resolvedUrls.local[0]);
		const input = page.getByRole("combobox", { name: "Project", exact: true });
		await expect(input).toHaveValue("All projects");
		await expect(page.locator(".project-selector-anchor")).toHaveCSS(
			"width",
			"240px",
		);
		await input.click();
		const option = page.getByRole("option", {
			name: "development",
			exact: true,
		});
		await expect(option).toBeVisible();
		await expect(option).toHaveAccessibleDescription("Development workloads");
		await expect(
			page.locator(".incus-project-selector-option-text").first(),
		).toHaveCSS("display", "flex");
		await expect(page.locator(".incus-project-selector-popup")).toHaveCSS(
			"width",
			"320px",
		);
		await expect
			.poll(() =>
				page.getByRole("option").evaluateAll((options) =>
					options.every((option, index) => {
						const bounds = option.getBoundingClientRect();
						const previous = options[index - 1]?.getBoundingClientRect();
						const description = option
							.querySelector(".incus-project-selector-description")
							?.getBoundingClientRect();
						return (
							(!previous || bounds.top >= previous.bottom - 1) &&
							(!description || description.bottom <= bounds.bottom)
						);
					}),
				),
			)
			.toBe(true);
		await input.fill("develop");
		await expect(
			page.getByRole("option", { name: "default", exact: true }),
		).toHaveCount(0);
		await option.click();
		await expect(input).toHaveValue("development");
		await expect(page.getByRole("status", { name: "Selection" })).toHaveText(
			"development",
		);
		await page.goto(new URL("?named-only", server.resolvedUrls.local[0]).href);
		await expect(input).toHaveValue("default");
		await input.click();
		await expect(option).toBeVisible();
		await expect(
			page.getByRole("option", { name: "All projects", exact: true }),
		).toHaveCount(0);
		assert.deepEqual(errors, []);
	}
	await t.test(
		"controlled selectors need no incarnation metadata and preserve a known obsolete identity",
		async (t) => {
			const page = await instance.newPage();
			t.after(() => page.close());
			await page.goto(
				new URL("?mode=minimal", server.resolvedUrls.local[0]).href,
			);
			const input = page.getByRole("combobox", {
				name: "Project",
				exact: true,
			});
			await input.click();
			const selected = page.getByRole("option", {
				name: "default",
				exact: true,
			});
			await expect(selected).toHaveAttribute("aria-selected", "true");
			await input.fill("development");
			await input.press("ArrowDown");
			await input.press("ArrowDown");
			await input.press("Enter");
			await expect(input).toHaveValue("development");
			await input.click();
			await expect(
				page.getByRole("option", { name: "development", exact: true }),
			).toHaveAttribute("aria-selected", "true");
			await page.goto(
				new URL("?mode=obsolete", server.resolvedUrls.local[0]).href,
			);
			await input.click();
			await expect(selected).toHaveAttribute("aria-selected", "false");
		},
	);

	await t.test(
		"touch selection stays closed after pending input-opening work",
		async (t) => {
			const page = await instance.newPage({
				hasTouch: true,
				reducedMotion: "reduce",
			});
			t.after(() => page.close());
			await page.goto(
				new URL("?mode=minimal", server.resolvedUrls.local[0]).href,
			);
			const input = page.getByRole("combobox", {
				name: "Project",
				exact: true,
			});
			await input.click();
			await page
				.getByRole("option", { name: "development", exact: true })
				.click();
			await expect(input).toHaveValue("development");
			await page.clock.install({ time: new Date("2026-11-17T00:00:00Z") });
			await page.clock.pauseAt(new Date("2026-11-17T00:00:01Z"));
			await input.tap();
			const all = page.getByRole("option", {
				name: "All projects",
				exact: true,
			});
			await expect(all).toBeVisible();
			await all.tap();
			await page.clock.runFor(1000);
			await expect(input).toHaveValue("All projects");
			await expect(input).toHaveAttribute("aria-expanded", "false");
			await expect(input).toBeFocused();
			await expect(input).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
			await input.tap();
			await page.clock.runFor(1000);
			await expect(all).toBeVisible();
			await input.tap();
			await all.tap();
			await page.clock.runFor(1000);
			await expect(input).toHaveValue("All projects");
			await expect(input).toHaveAttribute("aria-expanded", "false");
		},
	);

	await t.test(
		"messages translate search, acquisition, row progress, and selection problems",
		async (t) => {
			const page = await instance.newPage();
			t.after(() => page.close());
			const input = page.getByRole("combobox", {
				name: "Proyecto de origen",
				exact: true,
			});
			const visit = async (state = "") => {
				await page.goto(
					new URL(
						`?mode=translated&state=${state}`,
						server.resolvedUrls.local[0],
					).href,
				);
				await input.click();
			};
			await visit();
			await expect(input).toHaveAttribute("placeholder", "Buscar proyectos…");
			await expect(
				page.locator('button[aria-label="Mostrar opciones"]'),
			).toBeAttached();
			await expect(
				page.getByRole("listbox", { name: "Proyectos", exact: true }),
			).toBeVisible();
			await expect(
				page.locator(".incus-project-selector-popup"),
			).toHaveAttribute("aria-label", "Elegir proyecto");
			await expect(
				page.getByRole("option", { name: "Todos los proyectos", exact: true }),
			).toBeVisible();
			await input.fill("nonexistent");
			await expect(
				page.getByText("Ningún proyecto coincide.", { exact: true }),
			).toBeVisible();
			await visit("loading");
			await expect(
				page.getByLabel("Cargando proyectos", { exact: true }),
			).toBeVisible();
			await expect(
				page.getByRole("option", { name: "default", exact: true }),
			).toHaveAccessibleDescription("Cargando descripción.");
			await visit("updating");
			await expect(
				page.getByRole("option", { name: "default", exact: true }),
			).toHaveAccessibleDescription(
				"Default project Actualizando descripción.",
			);
			for (const [state, message] of [
				["failed", "No se pudieron cargar los proyectos"],
				["partial", "Lista de proyectos incompleta"],
				["details-failed", "Algunos detalles no están disponibles"],
			]) {
				await visit(state);
				await expect(page.getByText(message, { exact: true })).toBeVisible();
				const retry = page.getByRole("button", {
					name: "Reintentar la carga",
					exact: true,
				});
				await expect(retry).toHaveText("Reintentar");
			}
			await page.goto(
				new URL("?mode=translated&locale=sv", server.resolvedUrls.local[0])
					.href,
			);
			await input.click();
			await expect
				.poll(() =>
					page
						.getByRole("option")
						.evaluateAll((items) =>
							items.map(
								(item) => item.getAttribute("aria-label") ?? item.textContent,
							),
						),
				)
				.toEqual([
					"Todos los proyectos",
					"default",
					"development",
					"zebra",
					"älg",
				]);
			await input.fill("Ä");
			await expect(
				page.getByRole("option", { name: "älg", exact: true }),
			).toBeVisible();
			await input.fill("a");
			await expect(
				page.getByRole("option", { name: "älg", exact: true }),
			).toHaveCount(0);
			for (const [state, message] of [
				["unavailable", "Ya no está disponible: default."],
				["access", "Sin acceso a default."],
				["identity", "No se pudo verificar default. Vuelve a seleccionarlo."],
			]) {
				await visit(state);
				await expect(
					page.locator(".incus-project-selector-selection-message"),
				).toHaveText(message);
				await expect(input).toHaveAccessibleDescription(message);
			}
		},
	);

	await t.test(
		"two labelled selectors retain scoped themes and keyboard behavior inside a native dialog",
		async (t) => {
			const page = await instance.newPage();
			t.after(() => page.close());
			await page.goto(
				new URL("?mode=containers", server.resolvedUrls.local[0]).href,
			);
			const origin = page.getByRole("combobox", {
				name: "Proyecto de origen",
				exact: true,
			});
			await origin.click();
			const themedPopup = page
				.getByRole("region", { name: "Scoped theme" })
				.locator(".incus-project-selector-popup");
			await expect(themedPopup).toBeVisible();
			await expect(themedPopup).toHaveCSS(
				"background-color",
				"rgb(38, 58, 78)",
			);
			await origin.press("Escape");
			await expect(origin).toBeFocused();
			const open = page.getByRole("button", { name: "Open destination" });
			await open.click();
			const dialog = page.getByRole("dialog", {
				name: "Destination",
				exact: true,
			});
			const destination = dialog.getByRole("combobox", {
				name: "Destination project",
				exact: true,
			});
			await destination.click();
			await expect(
				dialog.getByRole("listbox", { name: "Projects", exact: true }),
			).toBeVisible();
			await expect(dialog.locator(".incus-project-selector-popup")).toHaveCSS(
				"background-color",
				"rgb(38, 58, 78)",
			);
			await destination.fill("development");
			await destination.press("ArrowDown");
			await destination.press("ArrowDown");
			await destination.press("Enter");
			await expect(destination).toHaveValue("development");
			await expect(destination).toBeFocused();
			await expect(origin).toHaveValue("default");
			await destination.click();
			await destination.press("Escape");
			await expect(dialog).toBeVisible();
			await expect(dialog.getByRole("listbox")).toHaveCount(0);
			await expect(destination).toBeFocused();
			await destination.press("Escape");
			await expect(dialog).not.toBeVisible();
			await expect(open).toBeFocused();
		},
	);
});
