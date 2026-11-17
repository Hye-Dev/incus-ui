// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceDefinition } from "@hyecompany/vem-data/runtime";
import { createReadDefinition } from "../access/read-definition.ts";
import { basicLifecycle, readLifecycle } from "../events/lifecycle.ts";
import type { ResourceRoute } from "../identity/api-paths.ts";
/** Identity evidence has no endpoint source until an application needs that resource. */
export function referenceDefinition(route: ResourceRoute): ResourceDefinition {
	return {
		...createReadDefinition(route.resource),
		sources: [],
		persist: () => false,
		event: (input, context) => {
			const change = readLifecycle(route, input, context);
			return change ? basicLifecycle(change) : undefined;
		},
	};
}
