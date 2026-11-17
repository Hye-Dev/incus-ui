// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineResource } from "@hyecompany/vem-data";
import { defineRoute } from "../../internal/identity/api-paths.ts";
export type NetworkZonesRef = { project: string; name: string };
export const route = defineRoute({
	resource: "networkZones",
	collection: "/1.0/network-zones",
	detail: "/1.0/network-zones/{name}",
	key: "name",
	identity: ["project", "name"],
});
export const networkZones = defineResource<
	NetworkZonesRef,
	NetworkZonesRef,
	{ project: string }
>()({
	name: "networkZones",
	fields: ["project", "name"],
	defaultSelect: ["project", "name"],
});
