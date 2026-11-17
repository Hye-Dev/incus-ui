// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { type QueryDescriptor, stableKey } from "@hyecompany/vem-data";
import type {
	DisclosureBasis,
	ObservationBatch,
} from "@hyecompany/vem-data/runtime";
import { eventSnapshot, projectLiveness } from "../events/continuity.ts";
import { identityRecord } from "../identity/resource-identity.ts";
import type { ResourceRepresentation } from "./resource-definition.ts";

export function collectionObservation(
	representation: ResourceRepresentation,
	query: Pick<QueryDescriptor, "scope" | "where">,
	evidence: {
		identities: readonly unknown[];
		basis: string;
		supportingBases: readonly DisclosureBasis[];
		complete: boolean;
		contextIndependent?: boolean;
	},
): ObservationBatch {
	const supportingBases = [
		...new Map(
			evidence.supportingBases.map((basis) => [stableKey(basis), basis]),
		).values(),
	];
	const scope = identityRecord(query.scope ?? {});
	return {
		grants: [
			{
				scope: evidence.basis,
				state: "allowed",
				...(evidence.contextIndependent ? { contextIndependent: true } : {}),
			},
		],
		memberships: [
			{
				resource: representation.name,
				scope: query.scope,
				where: query.where,
				identities: evidence.identities,
				complete: evidence.complete,
				basis: [{ all: [evidence.basis, ...supportingBases] }],
				liveness:
					representation.membershipLiveness ??
					(representation.route.projectScoped && !("allProjects" in scope)
						? projectLiveness(scope.project)
						: eventSnapshot),
			},
		],
	};
}
