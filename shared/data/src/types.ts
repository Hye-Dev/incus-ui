// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

export type { Project, ProjectRef } from "./resources/projects/contract.ts";
export type { Server, ServerRef } from "./resources/server/contract.ts";
export type {
	IncusEvent,
	IncusLifecycleEvent,
	IncusOperationEvent,
} from "./runtime/event-types.ts";
export type { ActionOutcome, Operation } from "./runtime/operation.ts";
export type { AllProjectsScope, ProjectScope, ResourceScope } from "./scope.ts";
export type { UploadInput } from "./transport/upload.ts";

import type { components } from "./transport/generated/schema.ts";
export type WireModels = components["schemas"];
