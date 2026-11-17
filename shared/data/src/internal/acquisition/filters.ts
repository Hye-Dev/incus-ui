// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	type FilterCapabilities,
	type FilterExpression,
	isFilterExpression,
} from "@hyecompany/vem-data";
import type { AcquisitionRequest } from "@hyecompany/vem-data/runtime";

/** Incus evaluates clauses left to right and cannot group mixed boolean operators. */
function clauses(
	expression: FilterExpression,
	combination?: "all" | "any",
): boolean {
	if (expression.$filter === "contains")
		return !/[\uD800-\uDFFF]/u.test(expression.value);
	if (expression.$filter === "equal") return false;
	return (
		expression.conditions.length > 0 &&
		(combination === undefined || expression.$filter === combination) &&
		expression.conditions.every((condition) =>
			clauses(condition, expression.$filter),
		)
	);
}

export function incusTextFilters(
	fields: readonly string[],
): FilterCapabilities {
	return {
		fields,
		operators: ["contains"],
		combinations: ["all", "any"],
		text: [{ case: "insensitive", accents: "sensitive" }],
		supports: (expression) => clauses(expression),
	};
}

/** Encode every scalar so punctuation, commas, whitespace and quotes remain literal regex text. */
function literal(value: string): string {
	return Array.from(
		value,
		(character) => `\\x{${character.codePointAt(0)?.toString(16)}}`,
	).join("");
}

function serialize(expression: FilterExpression): string {
	if (expression.$filter === "contains")
		return `${expression.field} eq (?s).*${literal(expression.value)}.*`;
	if (expression.$filter === "equal")
		throw new TypeError("Unsupported Incus text filter.");
	return expression.conditions
		.map(serialize)
		.join(expression.$filter === "all" ? " and " : " or ");
}

export function incusFilterQuery(request: AcquisitionRequest): {
	filter?: string;
} {
	if (!request.where || Object.keys(request.where).length === 0) return {};
	if (!isFilterExpression(request.where) || !clauses(request.where))
		throw new TypeError("Unsupported Incus filter expression.");
	return { filter: serialize(request.where) };
}
