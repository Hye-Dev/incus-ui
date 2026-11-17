// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineResource } from "@hyecompany/vem-data";
import { defineRoute } from "../../internal/identity/api-paths.ts";
export type NetworksRef = { project: string; name: string };
export const route = defineRoute({
	resource: "networks",
	collection: "/1.0/networks",
	detail: "/1.0/networks/{name}",
	key: "name",
	identity: ["project", "name"],
});
export const networks = defineResource<
	NetworksRef,
	NetworksRef,
	{ project: string }
>()({
	name: "networks",
	fields: ["project", "name"],
	defaultSelect: ["project", "name"],
});
