// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type {
	AcquisitionRequest,
	AcquisitionSource,
	Values,
} from "@hyecompany/vem-data/runtime";
import type { RequestOptions } from "../../transport/client.ts";
import { IncusProtocolError } from "../../transport/errors.ts";
import { resourceDisclosure } from "../access/disclosure.ts";
import { recordLiveness } from "../events/continuity.ts";
import { identityFieldLiveness } from "../identity/api-paths.ts";
import {
	identityRecord,
	readScope,
	scopeQuery,
} from "../identity/resource-identity.ts";
import { mergeObservations } from "./batches.ts";
import { collectionObservation } from "./collection-observation.ts";
import type { IncusAcquisition } from "./execute.ts";
import type { ResourceRepresentation } from "./resource-definition.ts";

export function membershipSource(
	representation: ResourceRepresentation,
	acquisition: IncusAcquisition,
	options: {
		fields: readonly string[];
		values?(identity: Values): Values;
		urlProject?: "default";
		record?(
			identity: Values,
			scope: Values,
		): { identity: Values; values: Values };
		validate?(scope: Values): void;
		key?: string;
		cost?: NonNullable<AcquisitionSource["cost"]>;
		filters?: AcquisitionSource["filters"];
		params?(request: AcquisitionRequest): RequestOptions["query"];
		available?: AcquisitionSource["available"];
		basis?(scope: Values): string;
	},
): AcquisitionSource {
	return {
		key: options.key ?? "membership",
		mode: "list",
		membership: true,
		fields: options.fields,
		cost: options.cost,
		filters: options.filters,
		available: options.available,
		scope: (query) => representation.route.scope(query.identity ?? query.scope),
		run: async (request, context) => {
			const scope = identityRecord(request.scope ?? {});
			options.validate?.(scope);
			const response = await acquisition.get(
				representation.route.path(scope, "list"),
				{ ...scopeQuery(scope), ...options.params?.(request) },
				context,
			);
			if (!Array.isArray(response.metadata))
				throw new IncusProtocolError(
					`Incus returned invalid ${representation.name} membership.`,
				);
			const records = response.metadata.map((url) => {
				const parsed =
					typeof url === "string"
						? representation.route.parse(
								url,
								options.urlProject ?? String(scope.project ?? "default"),
							)
						: undefined;
				if (!parsed)
					throw new IncusProtocolError(
						`Incus returned an invalid ${representation.name} member URL.`,
					);
				const record = options.record?.(parsed.identity, scope) ?? {
					identity: parsed.identity,
					values: options.values?.(parsed.identity) ?? parsed.identity,
				};
				if (
					["project", "instance"].some(
						(key) =>
							scope[key] !== undefined && record.identity[key] !== scope[key],
					)
				)
					throw new IncusProtocolError(
						`Incus returned an invalid ${representation.name} member scope.`,
					);
				return record;
			});
			const basis =
				options.basis?.(scope) ??
				`${readScope(representation.name, request.scope)}:membership`;
			const disclosures = records.map(({ identity, values }) =>
				resourceDisclosure(representation, identity, context, values, "list"),
			);

			return mergeObservations(
				{
					grants: disclosures.flatMap((disclosure) => disclosure.grants),
					facts: records.map(({ identity, values }, index) => ({
						resource: representation.name,
						identity,
						values,
						presence: "present" as const,
						basis: [{ all: [basis, disclosures[index].basis] }],
						liveness: recordLiveness(representation, identity, values, context),
						fieldLiveness: identityFieldLiveness(
							representation.route.identityField,
							identity,
							values,
						),
					})),
				},
				collectionObservation(representation, request, {
					basis,
					identities: records.map((record) => record.identity),
					supportingBases: disclosures.map((disclosure) => disclosure.basis),
					complete: true,
				}),
			);
		},
	};
}
