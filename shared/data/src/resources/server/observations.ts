// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ObservationBatch } from "@hyecompany/vem-data/runtime";
import { readScope } from "../../internal/identity/resource-identity.ts";
import { isRecord } from "../../internal/values.ts";
import { IncusProtocolError } from "../../transport/client.ts";
export function serverObservations(
	value: unknown,
	identity: unknown,
	authenticated: boolean,
): ObservationBatch {
	if (
		!isRecord(value) ||
		!["trusted", "untrusted"].includes(String(value.auth))
	)
		throw new IncusProtocolError(
			"Incus returned invalid authentication information.",
		);
	const scope = readScope("server", identity);
	const trusted = authenticated && value.auth === "trusted";
	return {
		grants: trusted ? [{ scope, state: "allowed" }] : [],
		facts: [
			{
				resource: "server",
				identity,
				values: {
					auth: value.auth,
					...(Array.isArray(value.api_extensions) &&
					value.api_extensions.every((item) => typeof item === "string")
						? { api_extensions: value.api_extensions }
						: {}),
				},
				replace: ["auth", "api_extensions"],
				presence: "present",
				basis: ["public"],
				liveness: "snapshot",
			},
			{
				resource: "server",
				identity,
				values: trusted
					? {
							auth_user_name: value.auth_user_name,
							auth_user_method: value.auth_user_method,
						}
					: {},
				replace: ["auth_user_name", "auth_user_method"],
				basis: [trusted ? scope : "public"],
				liveness: "snapshot",
			},
		],
	};
}
