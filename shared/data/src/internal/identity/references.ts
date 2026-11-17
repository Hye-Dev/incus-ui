// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { stableKey } from "@hyecompany/vem-data";
import type {
	AccessDecision,
	DisclosureBasis,
	FactObservation,
	ObservationBatch,
	RelationshipObservation,
	ResourceContext,
	ResourceReference,
	Values,
} from "@hyecompany/vem-data/runtime";
import type { ResourceRepresentation } from "../acquisition/resource-definition.ts";
import { eventSnapshot, projectLiveness } from "../events/continuity.ts";
import { identityFieldLiveness, type ReferenceParser } from "./api-paths.ts";
import { readScope } from "./resource-identity.ts";

export function referenceObservations(
	representation: ResourceRepresentation,
	identity: unknown,
	values: Values,
	basis: DisclosureBasis,
	parseReference: ReferenceParser,
	context?: ResourceContext,
): ObservationBatch & {
	fieldBasis: NonNullable<FactObservation["fieldBasis"]>;
} {
	const relationships: RelationshipObservation[] = [];
	const facts: FactObservation[] = [];
	const grants: AccessDecision[] = [];
	const fieldBasis: Record<string, readonly DisclosureBasis[]> = {};
	for (const reference of representation.references ?? []) {
		const urls = values[reference.field];
		if (!Array.isArray(urls)) continue;
		const targets: ResourceReference[] = [];
		const permissions: string[] = [];
		const targetBasis: {
			target: ResourceReference;
			basis: readonly DisclosureBasis[];
		}[] = [];
		let complete = Array.isArray(urls);
		for (const source of Array.isArray(urls) ? urls : []) {
			const target =
				typeof source === "string" && source.startsWith("/1.0/")
					? parseReference(source)
					: undefined;
			if (!target) {
				complete = false;
				continue;
			}
			targets.push(target);
			const targetScope = readScope(target.resource, target.identity);
			const protectedReference = reference.permissionFiltered;
			if (protectedReference) {
				permissions.push(targetScope);
				grants.push({ scope: targetScope, state: "allowed" });
			}
			targetBasis.push({
				target,
				basis: [protectedReference ? { all: [basis, targetScope] } : basis],
			});
			if (!reference.resources.includes(target.resource)) continue;
			facts.push({
				resource: target.resource,
				identity: target.identity,
				values: target.identity,
				presence: "present",
				basis: [protectedReference ? { all: [basis, targetScope] } : basis],
				liveness: projectLiveness(target.identity.project),
				fieldLiveness: identityFieldLiveness(
					parseReference.route(target.resource)?.identityField,
					target.identity,
					target.identity,
				),
			});
		}
		const proof = permissions.length ? { all: [basis, ...permissions] } : basis;
		const targetKeys = new Set(targets.map(stableKey));
		fieldBasis[reference.field] = [proof];
		relationships.push({
			resource: representation.name,
			identity,
			relationship: reference.field,
			targets,
			complete,
			basis: [proof],
			targetBasis,
			liveness: eventSnapshot,
			removed: complete
				? context
						?.relationship(representation.name, identity, reference.field)
						?.targets.filter((previous) => !targetKeys.has(stableKey(previous)))
				: undefined,
			...(!reference.permissionFiltered
				? {
						dependsOn: [
							{
								resource: representation.name,
								identity,
								field: reference.field,
							},
						],
					}
				: {}),
		});
	}
	return { facts, relationships, grants, fieldBasis };
}
