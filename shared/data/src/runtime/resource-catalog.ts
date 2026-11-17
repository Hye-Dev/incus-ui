// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceDefinition } from "@hyecompany/vem-data/runtime";
import { createAcquisition } from "../internal/acquisition/execute.ts";
import { referenceDefinition } from "../internal/acquisition/reference-resource.ts";
import { createReferenceParser } from "../internal/identity/api-paths.ts";
import { createProjectsDefinition } from "../resources/projects/definition.ts";
import { referenceRoutes } from "../resources/references.ts";
import { createServerDefinition } from "../resources/server/definition.ts";
import { incusRoutes } from "./api-paths.ts";
import type { DomainOptions } from "./services.ts";

export function createIncusDefinitions(
	options: DomainOptions,
): readonly ResourceDefinition[] {
	const acquisition = createAcquisition(
		options,
		createReferenceParser([...incusRoutes, ...(options.routes ?? [])]),
	);
	return [
		...referenceRoutes.map(referenceDefinition),
		createServerDefinition(options, acquisition),
		createProjectsDefinition(options, acquisition),
	];
}
