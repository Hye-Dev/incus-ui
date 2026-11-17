// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	filterFields,
	type QueryDescriptor,
	stableKey,
} from "@hyecompany/vem-data";
import type { ResourceReadDefinition } from "@hyecompany/vem-data/client";
import type { AccessRequirement } from "@hyecompany/vem-data/runtime";
import { inScope, matches } from "../identity/resource-identity.ts";
import { isRecord } from "../values.ts";

export function requiredFields(query: QueryDescriptor): readonly string[] {
	return [
		...new Set([
			...query.select,
			...filterFields(query.where),
			...(query.orderBy ?? []).map((order) => order.field),
		]),
	];
}

export function createReadDefinition(
	name: string,
	options: {
		memberScoped?: boolean;
		publicFields?: readonly string[] | "all";
	} = {},
): ResourceReadDefinition {
	return {
		name,
		key: stableKey,
		inScope: (identity, scope, values) =>
			inScope(identity, scope, values, options.memberScoped ?? false),
		matches,
		queryDependencies: (query) => [
			...filterFields(query.where),
			...(options.memberScoped &&
			isRecord(query.scope) &&
			typeof query.scope.target === "string"
				? ["location"]
				: []),
		],
		access: (query) =>
			options.publicFields === "all" ||
			(options.publicFields &&
				requiredFields(query).every((field) =>
					options.publicFields?.includes(field),
				))
				? "public"
				: "authenticated",
	};
}

export function readAccess(
	read: ResourceReadDefinition,
	query: QueryDescriptor,
): AccessRequirement {
	return typeof read.access === "function"
		? read.access(query)
		: (read.access ?? { all: [] });
}

export function requiresAccess(
	requirement: AccessRequirement,
	scope: string,
): boolean {
	if (typeof requirement === "string") return requirement === scope;
	return "all" in requirement
		? requirement.all.some((item) => requiresAccess(item, scope))
		: requirement.any.length > 0 &&
				requirement.any.every((item) => requiresAccess(item, scope));
}
