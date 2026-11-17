// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceReadDefinition } from "@hyecompany/vem-data/client";
import { createReadDefinition } from "./internal/access/read-definition.ts";
import { readDefinition as projects } from "./resources/projects/contract.ts";
import { referenceRoutes } from "./resources/references.ts";
import { readDefinition as server } from "./resources/server/contract.ts";
export const incusReadDefinitions: readonly ResourceReadDefinition[] = [
	...referenceRoutes.map((route) => createReadDefinition(route.resource)),
	projects,
	server,
];
