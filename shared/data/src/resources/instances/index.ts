// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineResource } from "@hyecompany/vem-data";
import { defineRoute } from "../../internal/identity/api-paths.ts";
export type InstancesRef = { project: string; name: string };
export const route = defineRoute({
	resource: "instances",
	collection: "/1.0/instances",
	detail: "/1.0/instances/{name}",
	key: "name",
	identity: ["project", "name"],
});
export const instances = defineResource<
	InstancesRef,
	InstancesRef,
	{ project: string }
>()({
	name: "instances",
	fields: ["project", "name"],
	defaultSelect: ["project", "name"],
});
