// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	AcquisitionError,
	type AcquisitionSource,
} from "@hyecompany/vem-data/runtime";
import type { IncusAcquisition } from "../../internal/acquisition/execute.ts";
import {
	incusFilterQuery,
	incusTextFilters,
} from "../../internal/acquisition/filters.ts";
import { membershipSource } from "../../internal/acquisition/membership-source.ts";
import { createResourceDefinition } from "../../internal/acquisition/resource-definition.ts";
import { representationSource } from "../../internal/acquisition/sources.ts";
import type { DomainOptions } from "../../runtime/services.ts";
import { IncusError } from "../../transport/client.ts";
import { readDefinition } from "./contract.ts";
import { projectEvent } from "./events.ts";
import { representation } from "./representation.ts";

export function createProjectsDefinition(
	_options: DomainOptions,
	acquisition: IncusAcquisition,
) {
	const filters = incusTextFilters(["name", "description"]);
	return createResourceDefinition({
		read: readDefinition,
		representation,
		acquisition,
		sources: [
			membershipSource(representation, acquisition, {
				fields: ["name"],
				filters,
				params: incusFilterQuery,
			}),
			representationSource(representation, acquisition, {
				key: "detail",
				mode: "one",
			}),
			representationSource(representation, acquisition, {
				key: "collection",
				mode: "list",
				membership: true,
				filters,
				params: (request) => ({ recursion: 1, ...incusFilterQuery(request) }),
			}),
		].map(classifyProjectListFailure),
		event: projectEvent,
	});
}

function classifyProjectListFailure(
	source: AcquisitionSource,
): AcquisitionSource {
	if (source.mode !== "list") return source;
	return {
		...source,
		run: async (request, context) => {
			try {
				return await source.run(request, context);
			} catch (error) {
				if (error instanceof IncusError && error.status === 403)
					throw new AcquisitionError(
						{ kind: "access", message: "Listing projects is not permitted." },
						{ cause: error },
					);
				throw error;
			}
		},
	};
}
