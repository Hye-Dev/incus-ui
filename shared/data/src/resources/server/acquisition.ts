// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { AcquisitionSource } from "@hyecompany/vem-data/runtime";
import type { IncusAcquisition } from "../../internal/acquisition/execute.ts";
import { scopeQuery } from "../../internal/identity/resource-identity.ts";
import { isRecord } from "../../internal/values.ts";
import type { DomainOptions } from "../../runtime/services.ts";
import { fields } from "./contract.ts";
import { serverObservations } from "./observations.ts";
import { serverRoute } from "./representation.ts";

export function createServerSources(
	options: DomainOptions,
	acquisition: IncusAcquisition,
): readonly AcquisitionSource[] {
	return [
		{
			key: "server",
			mode: "one",
			fields,
			run: async (query, context) => {
				const response = await acquisition.get(
					serverRoute.path(),
					scopeQuery(query.identity),
					context,
				);
				if (
					(!isRecord(query.identity) || !query.identity.target) &&
					(await options.acceptServer?.(response.metadata, context))
				)
					return {};
				return serverObservations(
					response.metadata,
					query.identity ?? {},
					context.access("authenticated") === "allowed",
				);
			},
		},
	];
}
