// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { createReferenceParser } from "../internal/identity/api-paths.ts";
import { projectRoute } from "../resources/projects/representation.ts";
import { referenceRoutes } from "../resources/references.ts";
import { serverRoute } from "../resources/server/representation.ts";
import type { IncusLifecycleEvent } from "./event-types.ts";
export const incusRoutes = Object.freeze([
	serverRoute,
	projectRoute,
	...referenceRoutes,
]);
const parse = createReferenceParser(incusRoutes);
export function eventIdentity(event: IncusLifecycleEvent) {
	return parse(event.metadata.source, event.project);
}
