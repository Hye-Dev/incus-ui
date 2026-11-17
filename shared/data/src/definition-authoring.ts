// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

export { createReadDefinition } from "./internal/access/read-definition.ts";
export { withReadDeadline } from "./internal/acquisition/read-deadline.ts";
export {
	eventTransport,
	projectContinuity,
	projectLiveness,
} from "./internal/events/continuity.ts";
export { renamedIdentity } from "./internal/events/rename.ts";
export type {
	IncusReference,
	ReferenceParser,
	ResourceRoute,
} from "./internal/identity/api-paths.ts";
/** Incus semantics shared by resource definitions; transport stays in the host services. */
export {
	createReferenceParser,
	defineRoute,
	identityFieldLiveness,
} from "./internal/identity/api-paths.ts";
export { readScope } from "./internal/identity/resource-identity.ts";
export { eventIdentity, incusRoutes } from "./runtime/api-paths.ts";
export type {
	IncusAdapterServices,
	IncusOperationMonitor,
} from "./runtime/services.ts";
