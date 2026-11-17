// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { type QueryDescriptor, stableKey } from "@hyecompany/vem-data";
import type {
	ObservationBatch,
	ResourceContext,
} from "@hyecompany/vem-data/runtime";
import type { DomainOptions } from "../../runtime/services.ts";
import {
	IncusProtocolError,
	type RequestOptions,
} from "../../transport/client.ts";
import type { ReferenceParser } from "../identity/api-paths.ts";
import { readScope } from "../identity/resource-identity.ts";
import { mergeObservations } from "./batches.ts";
import { collectionObservation } from "./collection-observation.ts";
import { createRecordObserver } from "./observations.ts";
import { resolveReadTimeout, withReadDeadline } from "./read-deadline.ts";
import type { ResourceRepresentation } from "./resource-definition.ts";

type ResponseOptions = {
	additionalFields?: readonly string[];
	membership?:
		| { basis: string; contextIndependent?: boolean; complete?: boolean }
		| false;
};

export function createAcquisition(
	options: DomainOptions,
	parseReference: ReferenceParser,
) {
	const readTimeoutMs = resolveReadTimeout(options.readTimeoutMs);
	const recordObservation = createRecordObserver(parseReference);
	const reads = new Map<
		string,
		Promise<{ metadata: unknown; etag?: string }>
	>();
	async function get(
		path: string,
		query: RequestOptions["query"],
		context: ResourceContext,
	) {
		const key = stableKey([context.acquisitionFence, path, query]);
		const existing = reads.get(key);
		if (existing) return existing;
		const pending = withReadDeadline(readTimeoutMs, context.signal, (signal) =>
			options.transport.rawGet<unknown>(path, {
				query,
				priority: context.fetchPriority,
				signal,
			}),
		);
		reads.set(key, pending);
		try {
			return await pending;
		} finally {
			reads.delete(key);
		}
	}

	function response(
		representation: ResourceRepresentation,
		query: QueryDescriptor,
		metadata: unknown,
		context: ResourceContext,
		responseOptions: ResponseOptions = {},
	): ObservationBatch {
		const rows = query.mode === "list" ? metadata : [metadata];
		if (!Array.isArray(rows))
			throw new IncusProtocolError(
				`Incus returned an invalid ${representation.name} collection.`,
			);
		const scope =
			query.identity ??
			query.scope ??
			(representation.route.projectScoped ? { project: "default" } : undefined);
		const observations = rows.map((row) =>
			recordObservation(
				representation,
				row,
				context,
				scope,
				responseOptions.additionalFields,
				query.mode,
			),
		);
		const batch = mergeObservations(
			...observations.map((observation) => observation.batch),
		);
		if (query.mode !== "list" || responseOptions.membership === false)
			return batch;
		const membership = responseOptions.membership ?? {
			basis: `${readScope(representation.name, query.scope)}:membership`,
		};
		return mergeObservations(
			batch,
			collectionObservation(representation, query, {
				...membership,
				identities: observations.map(
					(observation) => observation.fact.identity,
				),
				supportingBases: observations.flatMap(
					(observation) => observation.fact.basis ?? [],
				),
				complete:
					observations.every((observation) => !observation.partial) &&
					membership.complete !== false,
			}),
		);
	}

	return {
		get,
		response,
		recordObservation,
		parseReference,
	};
}

export type IncusAcquisition = ReturnType<typeof createAcquisition>;
