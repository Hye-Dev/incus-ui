// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { stableKey } from "@hyecompany/vem-data";
import type { FactRef, Values } from "@hyecompany/vem-data/runtime";
import type { RequestOptions } from "../../transport/client.ts";
import { isRecord } from "../values.ts";

export function readScope(resource: string, identity: unknown): string {
	return `incus:read:${resource}:${stableKey(identity)}`;
}

export function scopeQuery(
	scope: unknown,
): NonNullable<RequestOptions["query"]> {
	if (!isRecord(scope)) return {};
	return {
		project: typeof scope.project === "string" ? scope.project : undefined,
		"all-projects": scope.allProjects === true ? true : undefined,
		target: typeof scope.target === "string" ? scope.target : undefined,
	};
}

export function identityRecord(value: unknown): Values {
	if (!isRecord(value))
		throw new TypeError("An Incus resource reference is required.");
	return value;
}

export function matches(
	values: Readonly<Values>,
	where: Readonly<Values>,
): boolean | "unknown" {
	for (const [field, expected] of Object.entries(where)) {
		const path = field.split(".");
		let actual: unknown = values;
		for (const key of path) {
			if (!isRecord(actual) || !Object.hasOwn(actual, key)) return "unknown";
			actual = actual[key];
		}
		if (stableKey(actual) !== stableKey(expected)) return false;
	}
	return true;
}

export function inScope(
	identity: unknown,
	scope: unknown,
	values: Readonly<Values>,
	memberScoped: boolean,
): boolean | "unknown" {
	if (!isRecord(identity) || !isRecord(scope)) return true;
	if (typeof scope.project === "string" && identity.project !== scope.project)
		return false;
	if (
		typeof scope.instance === "string" &&
		identity.instance !== scope.instance
	)
		return false;
	if (scope.allProjects === true) {
		if (typeof values.project !== "string") return "unknown";
		if (identity.project !== values.project) return false;
	}
	if (memberScoped && typeof scope.target === "string") {
		if (typeof values.location !== "string") return "unknown";
		if (values.location !== scope.target) return false;
	}
	return true;
}
export function changedFields(
	resource: string,
	identity: unknown,
	fields: readonly string[],
): FactRef[] {
	return fields.map((field) => ({ resource, identity, field }));
}
