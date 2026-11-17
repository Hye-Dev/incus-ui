// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type {
	AccessDecision,
	AccessRequirement,
	ResourceContext,
	Values,
} from "@hyecompany/vem-data/runtime";
import type { ResourceRepresentation } from "../acquisition/resource-definition.ts";
import { readScope } from "../identity/resource-identity.ts";

export function resourceDisclosure(
	representation: ResourceRepresentation,
	identity: Values,
	context: ResourceContext,
	values?: Values,
	mode: "one" | "list" = "one",
) {
	if (representation.readDisclosure)
		return representation.readDisclosure(identity, context, values, mode);
	const known = context.get(representation.name, identity);
	const knownOwner = !known?.fields.project?.stale
		? known?.values.project
		: undefined;
	const owner =
		typeof values?.project === "string"
			? values.project
			: typeof knownOwner === "string"
				? knownOwner
				: representation.disclosureProject?.(identity, context);
	return readDisclosure(representation.name, identity, owner);
}

export function readDisclosure(
	resource: string,
	identity: Values,
	ownerProject?: string,
): { basis: AccessRequirement; grants: readonly AccessDecision[] } {
	const requestScope = readScope(resource, identity);
	const scopes =
		typeof identity.project === "string" &&
		ownerProject !== undefined &&
		ownerProject !== identity.project
			? [
					requestScope,
					readScope(resource, { ...identity, project: ownerProject }),
					readScope("projects", { name: identity.project }),
				]
			: [requestScope];
	return {
		basis: scopes.length === 1 ? requestScope : { all: scopes },
		grants: scopes.map((scope, index) => ({
			scope,
			state: "allowed",
			...(index === 0 && ownerProject !== undefined
				? { requires: { all: scopes.slice(1) } }
				: {}),
		})),
	};
}
