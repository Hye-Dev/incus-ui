// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceRepresentation } from "../../internal/acquisition/resource-definition.ts";
import { defineRoute } from "../../internal/identity/api-paths.ts";
import { fields } from "./contract.ts";
export const serverRoute = defineRoute({
	resource: "server",
	collection: "/1.0",
	detail: "/1.0",
	identity: [],
});

export const representation = {
	route: serverRoute,
	name: "server",
	fields,
	snapshotFields: [],
	persistedFields: [],
} as const satisfies ResourceRepresentation;
