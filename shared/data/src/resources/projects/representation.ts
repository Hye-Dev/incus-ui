// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceRepresentation } from "../../internal/acquisition/resource-definition.ts";
import { defineRoute } from "../../internal/identity/api-paths.ts";
import { referenceRoutes } from "../references.ts";
import { fields } from "./contract.ts";
export const projectRoute = defineRoute({
	resource: "projects",
	collection: "/1.0/projects",
	detail: "/1.0/projects/{name}",
	key: "name",
	identity: ["name"],
});

export const representation = {
	route: projectRoute,
	name: "projects",
	fields,
	snapshotFields: ["used_by"],
	persistedFields: ["name", "description"],
	references: [
		{
			field: "used_by",
			resources: referenceRoutes.map((route) => route.resource),
		},
	],
} as const satisfies ResourceRepresentation;
