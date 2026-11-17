// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type {
	DisclosureBasis,
	FactObservation,
	ObservationBatch,
	ObservationLiveness,
	ResourceContext,
} from "@hyecompany/vem-data/runtime";
import { resourceDisclosure } from "../access/disclosure.ts";
import { recordLiveness } from "../events/continuity.ts";
import {
	identityFieldLiveness,
	type ReferenceParser,
} from "../identity/api-paths.ts";
import { referenceObservations } from "../identity/references.ts";
import { mergeObservations } from "./batches.ts";
import { normalize } from "./normalize.ts";
import type {
	NormalizedRecord,
	ResourceRepresentation,
} from "./resource-definition.ts";

export function fieldObservations(
	representation: ResourceRepresentation,
	record: NormalizedRecord,
	basis: DisclosureBasis,
	liveness: ObservationLiveness,
): FactObservation[] {
	const fields = Object.keys(record.values);
	const sampled = fields.filter((field) =>
		representation.snapshotFields.includes(field),
	);
	const sampledReplacement = record.replace.filter((field) =>
		representation.snapshotFields.includes(field),
	);
	const ordinary = fields.filter(
		(field) => !representation.snapshotFields.includes(field),
	);
	return [
		...(sampled.length || sampledReplacement.length
			? [
					{
						resource: representation.name,
						identity: record.identity,
						values: Object.fromEntries(
							sampled.map((field) => [field, record.values[field]]),
						),
						replace: sampledReplacement,
						basis: [basis],
						liveness: { all: [liveness, "snapshot"] } as const,
						fieldLiveness: Object.fromEntries(
							(representation.measurementFields ?? []).map((field) => [
								field,
								"snapshot" as const,
							]),
						),
					},
				]
			: []),
		{
			resource: representation.name,
			identity: record.identity,
			values: Object.fromEntries(
				ordinary.map((field) => [field, record.values[field]]),
			),
			replace: record.replace.filter(
				(field) => !representation.snapshotFields.includes(field),
			),
			presence: "present" as const,
			basis: [basis],
			liveness,
			fieldLiveness: identityFieldLiveness(
				representation.route.identityField,
				record.identity,
				record.values,
			),
		},
	];
}

export function createRecordObserver(parseReference: ReferenceParser) {
	return (
		representation: ResourceRepresentation,
		value: unknown,
		context: ResourceContext,
		scope?: unknown,
		additionalFields: readonly string[] = [],
		mode: "one" | "list" = "one",
	): { fact: FactObservation; batch: ObservationBatch; partial: boolean } => {
		const normalized = normalize(
			representation,
			value,
			scope,
			additionalFields,
			context,
		);
		const disclosure =
			representation.disclosure?.(
				normalized.values,
				normalized.identity,
				context,
				mode,
			) ??
			resourceDisclosure(
				representation,
				normalized.identity,
				context,
				normalized.values,
				mode,
			);
		const liveness = recordLiveness(
			representation,
			normalized.identity,
			normalized.values,
			context,
		);
		const facts = fieldObservations(
			representation,
			normalized,
			disclosure.basis,
			liveness,
		);
		const references = referenceObservations(
			representation,
			normalized.identity,
			normalized.values,
			disclosure.basis,
			parseReference,
			context,
		);
		for (const fact of facts) fact.fieldBasis = references.fieldBasis;
		const extracted = normalized.partial
			? undefined
			: representation.extract?.(normalized, context, {
					basis: disclosure.basis,
					liveness: liveness,
				});
		return {
			fact: facts[facts.length - 1],
			partial: normalized.partial,
			batch: mergeObservations(
				{ facts, grants: disclosure.grants },
				references,
				extracted,
			),
		};
	};
}
