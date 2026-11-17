// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { QueryDescriptor } from "@hyecompany/vem-data";
import type {
	AcquisitionRequest,
	AcquisitionSource,
} from "@hyecompany/vem-data/runtime";
import type { RequestOptions } from "../../transport/client.ts";
import { scopeQuery } from "../identity/resource-identity.ts";
import type { IncusAcquisition } from "./execute.ts";
import type { ResourceRepresentation } from "./resource-definition.ts";

export function sourceQuery(request: AcquisitionRequest): QueryDescriptor {
	return {
		kind: "query",
		resource: request.resource,
		mode: request.mode,
		identity: request.identity,
		scope: request.scope,
		select: request.fields,
		where: request.where,
		sample: request.sample,
	};
}

export function representationSource(
	representation: ResourceRepresentation,
	acquisition: IncusAcquisition,
	options: {
		key: string;
		mode: "one" | "list";
		cost?: NonNullable<AcquisitionSource["cost"]>;
		membership?: boolean;
		params?:
			| RequestOptions["query"]
			| ((request: AcquisitionRequest) => RequestOptions["query"]);
		filters?: AcquisitionSource["filters"];
		available?: AcquisitionSource["available"];
		additionalFields?: readonly string[];
	},
): AcquisitionSource {
	return {
		key: options.key,
		mode: options.mode,
		fields: [...representation.fields, ...(options.additionalFields ?? [])],
		membership: options.membership,
		cost: options.cost,
		filters: options.filters,
		available: options.available,
		scope: (query) => representation.route.scope(query.identity ?? query.scope),
		run: async (request, context) => {
			const query = sourceQuery(request);
			const result = await acquisition.get(
				representation.route.path(query.identity ?? query.scope, query.mode),
				{
					...scopeQuery(query.identity ?? query.scope),
					...(typeof options.params === "function"
						? options.params(request)
						: options.params),
				},
				context,
			);
			return acquisition.response(
				representation,
				query,
				result.metadata,
				context,
				{
					additionalFields: options.additionalFields,
					...(options.membership === false ? { membership: false } : {}),
				},
			);
		},
	};
}

export function representationSources(
	representation: ResourceRepresentation,
	acquisition: IncusAcquisition,
	cost: {
		detail?: NonNullable<AcquisitionSource["cost"]>;
		collection?: NonNullable<AcquisitionSource["cost"]>;
	} = {},
): readonly AcquisitionSource[] {
	return [
		representationSource(representation, acquisition, {
			key: "detail",
			mode: "one",
			cost: cost.detail,
		}),
		representationSource(representation, acquisition, {
			key: "collection",
			mode: "list",
			cost: cost.collection,
			membership: true,
			params: { recursion: 1 },
		}),
	];
}
