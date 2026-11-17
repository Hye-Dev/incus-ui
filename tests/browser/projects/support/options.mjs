// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { expect } from "@playwright/test";

export const trigger = (page) =>
	page.getByRole("combobox", { name: "Project", exact: true });
export const option = (page, name) =>
	page.getByRole("option", { name, exact: true });
export const reads = (api) =>
	api.requests.filter((request) => request.path === "/1.0/projects").length;
export const inventoryReads = (api) =>
	api.requests.filter(
		(request) =>
			request.path === "/1.0/projects" &&
			!new URLSearchParams(request.query).has("filter"),
	).length;
export const projectRequests = (api) =>
	api.requests.filter((request) => request.path.startsWith("/1.0/projects"));
export const nameReads = (api) =>
	api.requests.filter(
		(request) =>
			request.path === "/1.0/projects" && !request.query.includes("recursion"),
	).length;
export async function select(page, name) {
	await trigger(page).click();
	await option(page, name).click();
	await expect(trigger(page)).toHaveValue(name);
}
