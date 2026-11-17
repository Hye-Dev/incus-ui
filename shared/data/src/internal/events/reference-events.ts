// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { stableKey } from "@hyecompany/vem-data";
import type {
	AccessDecision,
	ObservationBatch,
	ResourceContext,
	ResourceDefinition,
} from "@hyecompany/vem-data/runtime";
import { parseIncusEvent } from "../../runtime/event-stream.ts";
import { resourceDisclosure } from "../access/disclosure.ts";
import { mergeObservations } from "../acquisition/batches.ts";
import type { ResourceRepresentation } from "../acquisition/resource-definition.ts";
import type { ReferenceParser } from "../identity/api-paths.ts";
import { referenceObservations } from "../identity/references.ts";
import { identityRecord, readScope } from "../identity/resource-identity.ts";
import { eventSnapshot } from "./continuity.ts";
import { renamedIdentity } from "./rename.ts";

function referenceEvent(
	representation: ResourceRepresentation,
	parseReference: ReferenceParser,
	input: unknown,
	context: ResourceContext,
): ObservationBatch | undefined {
	if (!representation.references?.length) return;
	const event = parseIncusEvent(input);
	if (!event || event.type !== "lifecycle") return;
	const target = parseReference(event.metadata.source, event.project);
	if (
		!target ||
		!representation.references.some((reference) =>
			reference.resources.includes(target.resource),
		)
	)
		return;
	const action = event.metadata.action;
	const deletion = action.endsWith("-deleted");
	const route = parseReference.route(target.resource);
	const oldIdentity = route && renamedIdentity(route, event, target.identity);
	const rename = oldIdentity !== undefined;
	if (
		!deletion &&
		!rename &&
		!["-updated", "-restored", "-created"].some((suffix) =>
			action.endsWith(suffix),
		)
	)
		return;
	const previous = oldIdentity ? { ...target, identity: oldIdentity } : target;
	const batch: ObservationBatch = {
		facts: [],
		relationships: [],
		invalidate: [],
	};
	const grants: AccessDecision[] = [];
	const facts = [...(batch.facts ?? [])],
		relationships = [...(batch.relationships ?? [])],
		invalidate = [...(batch.invalidate ?? [])];
	for (const record of context.records(representation.name)) {
		const source = { ...identityRecord(record.identity), ...record.values };
		for (const reference of representation.references) {
			const urls = record.values[reference.field];
			if (!Array.isArray(urls)) continue;
			const matches = (url: unknown) =>
				typeof url === "string" &&
				url.startsWith("/1.0/") &&
				stableKey(parseReference(url)) === stableKey(previous);
			const includes = urls.some(matches);
			if (!deletion && !rename) {
				if (
					includes ||
					(reference.mayUse?.(
						source,
						target.resource,
						target.identity,
						context,
					) ??
						true)
				)
					invalidate.push(
						{
							resource: representation.name,
							identity: record.identity,
							field: reference.field,
						},
						{
							resource: representation.name,
							identity: record.identity,
							relationship: reference.field,
						},
					);
				continue;
			}
			if (!includes) continue;
			// A rename event is still emitted if upstream authorizer migration fails.
			if (
				rename &&
				reference.permissionFiltered &&
				context.access(readScope(target.resource, target.identity)) !==
					"allowed"
			) {
				invalidate.push(
					{
						resource: representation.name,
						identity: record.identity,
						field: reference.field,
					},
					{
						resource: representation.name,
						identity: record.identity,
						relationship: reference.field,
					},
				);
				continue;
			}
			const next = deletion
				? urls.filter((url) => !matches(url))
				: urls.map((url) => {
						if (!matches(url)) return url;
						const parsed = new URL(String(url), "http://incus.invalid");
						if (!route) return url;
						parsed.pathname = route.path(target.identity, "one");
						return parsed.pathname + parsed.search;
					});
			const basis = {
				any: ["one", "list"].map(
					(mode) =>
						resourceDisclosure(
							representation,
							identityRecord(record.identity),
							context,
							undefined,
							mode as "one" | "list",
						).basis,
				),
			};
			const extracted = referenceObservations(
				representation,
				record.identity,
				{ [reference.field]: next },
				basis,
				parseReference,
				context,
			);
			grants.push(
				...(extracted.grants ?? []).filter(
					(grant) => context.access(grant.scope) === "allowed",
				),
			);
			facts.push({
				resource: representation.name,
				identity: record.identity,
				values: { [reference.field]: next },
				basis: [basis],
				fieldBasis: extracted.fieldBasis,
				liveness: eventSnapshot,
			});
			relationships.push(
				...(extracted.relationships ?? []).map((relationship) => ({
					...relationship,
					removed: [previous],
				})),
			);
			if (record.fields[reference.field]?.stale)
				invalidate.push({
					resource: representation.name,
					identity: record.identity,
					field: reference.field,
				});
		}
	}
	return { facts, relationships, invalidate, grants };
}

export function withReferenceEvents(
	representation: ResourceRepresentation,
	parseReference: ReferenceParser,
	own?: ResourceDefinition["event"],
): NonNullable<ResourceDefinition["event"]> {
	return (input, context) => {
		const first = own?.(input, context);
		const next = referenceEvent(representation, parseReference, input, context);
		if (!first) return next;
		if (!next) return first;
		return mergeObservations(first, next);
	};
}
