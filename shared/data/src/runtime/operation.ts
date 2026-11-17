// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ActionOutcome as FoundationOutcome } from "@hyecompany/vem-data";
import { isRecord } from "../internal/values.ts";
import type { components } from "../transport/generated/schema.ts";
export type Operation = components["schemas"]["Operation"] & { id: string };
export type ActionOutcome = Exclude<
	FoundationOutcome<{ operation?: Operation }, never>,
	{ kind: "partial" }
>;
export function isOperation(value: unknown): value is Operation {
	return (
		isRecord(value) &&
		typeof value.id === "string" &&
		typeof value.status_code === "number"
	);
}

export function isTerminalOperation(operation: Operation): boolean {
	return (
		typeof operation.status_code === "number" && operation.status_code >= 200
	);
}

export function operationOutcome(operation: Operation): ActionOutcome {
	if (!isTerminalOperation(operation)) {
		return {
			kind: "unknown",
			message: "The operation has not reached a final state.",
		};
	}
	return operation.status_code === 200
		? { kind: "succeeded", value: { operation } }
		: {
				kind: "failed",
				submitted: true,
				error: {
					message: operation.err || operation.status || "The operation failed.",
					code: String(operation.status_code),
				},
			};
}
