// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineResource } from "@hyecompany/vem-data";
import { defineRoute } from "../../internal/identity/api-paths.ts";
export type ProfilesRef = { project: string; name: string };
export const route = defineRoute({
	resource: "profiles",
	collection: "/1.0/profiles",
	detail: "/1.0/profiles/{name}",
	key: "name",
	identity: ["project", "name"],
});
export const profiles = defineResource<
	ProfilesRef,
	ProfilesRef,
	{ project: string }
>()({
	name: "profiles",
	fields: ["project", "name"],
	defaultSelect: ["project", "name"],
});
