// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceContext } from "@hyecompany/vem-data/runtime";
import { IncusProtocolError } from "../../transport/client.ts";
import { isRecord } from "../values.ts";
import type {
	NormalizedRecord,
	ResourceRepresentation,
} from "./resource-definition.ts";

export function normalize(
	representation: ResourceRepresentation,
	value: unknown,
	scope?: unknown,
	additionalFields: readonly string[] = [],
	context?: ResourceContext,
): NormalizedRecord {
	if (!isRecord(value))
		throw new IncusProtocolError(
			`Incus returned an invalid ${representation.name} object.`,
		);
	const identity = representation.route.identity(value, scope);
	const partial = representation.isPartial?.(value) ?? false;
	const represented = [...representation.fields, ...additionalFields];
	const fields = partial ? (representation.partialFields ?? []) : represented;
	const source = representation.normalizeValues?.(value, identity, context) ?? {
		...identity,
		...value,
	};
	const values = Object.fromEntries(
		fields
			.filter(
				(field) => Object.hasOwn(source, field) && source[field] !== undefined,
			)
			.map((field) => [field, source[field]]),
	);
	return { identity, values, partial, replace: partial ? [] : represented };
}

export function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
