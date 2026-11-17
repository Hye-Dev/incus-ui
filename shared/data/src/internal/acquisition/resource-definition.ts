// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceReadDefinition } from "@hyecompany/vem-data/client";
import type {
	AccessDecision,
	AccessRequirement,
	AcquisitionSource,
	DisclosureBasis,
	ObservationBatch,
	ObservationLiveness,
	ResourceContext,
	ResourceDefinition,
	Values,
} from "@hyecompany/vem-data/runtime";
import { callerPrerequisites } from "../access/access-dependencies.ts";
import { resourceDisclosure } from "../access/disclosure.ts";
import { readAccess, requiresAccess } from "../access/read-definition.ts";
import { withReferenceEvents } from "../events/reference-events.ts";
import type { ResourceRoute } from "../identity/api-paths.ts";
import { identityRecord } from "../identity/resource-identity.ts";
import type { IncusAcquisition } from "./execute.ts";
import { sourceQuery } from "./sources.ts";

export interface NormalizedRecord {
	identity: Values;
	values: Values;
	partial: boolean;
	replace: readonly string[];
}

export type ResourceRepresentation = {
	name: string;
	route: ResourceRoute;
	fields: readonly string[];
	snapshotFields: readonly string[];
	measurementFields?: readonly string[];
	liveness?(
		identity: Values,
		values: Values,
		context: ResourceContext,
	): ObservationLiveness;
	membershipLiveness?: ObservationLiveness;
	persistedFields: readonly string[];
	references?: readonly {
		field: string;
		resources: readonly string[];
		permissionFiltered?: boolean;
		mayUse?(
			source: Values,
			targetResource: string,
			target: Values,
			context: ResourceContext,
		): boolean;
	}[];
	isPartial?(value: Readonly<Values>): boolean;
	partialFields?: readonly string[];
	normalizeValues?(
		value: Values,
		identity: Values,
		context?: ResourceContext,
	): Values;
	disclosureProject?(
		identity: Values,
		context: ResourceContext,
	): string | undefined;
	readDisclosure?(
		identity: Values,
		context: ResourceContext,
		values?: Values,
		mode?: "one" | "list",
	): { basis: AccessRequirement; grants: readonly AccessDecision[] };
	disclosure?(
		value: Values,
		identity: Values,
		context: ResourceContext,
		mode?: "one" | "list",
	): { basis: DisclosureBasis; grants: readonly AccessDecision[] };
	extract?(
		record: NormalizedRecord,
		context: ResourceContext,
		evidence: { basis: DisclosureBasis; liveness: ObservationLiveness },
	): ObservationBatch;
};

type DefinitionOptions = {
	read: ResourceReadDefinition;
	representation: ResourceRepresentation;
	acquisition: IncusAcquisition;
	sources: readonly AcquisitionSource[];
	sampledFields?: readonly string[];
} & Pick<
	ResourceDefinition,
	| "event"
	| "derive"
	| "commands"
	| "edits"
	| "readPrerequisites"
	| "fieldDependencies"
	| "presenceDependencies"
	| "membershipDependencies"
>;

export function createResourceDefinition(
	options: DefinitionOptions,
): ResourceDefinition {
	const { representation, acquisition, sources } = options;
	const { name, persistedFields } = representation;
	if (options.read.name !== name)
		throw new Error(
			`The read definition for ${name} has a different resource name`,
		);
	return {
		...options.read,
		sources: sources.map((source) => ({
			...source,
			accessUnknown: (request, context) =>
				context.access("authenticated") === "unknown" &&
				requiresAccess(
					readAccess(options.read, sourceQuery(request)),
					"authenticated",
				)
					? "wait"
					: typeof source.accessUnknown === "function"
						? source.accessUnknown(request, context)
						: (source.accessUnknown ?? "attempt"),
			access:
				source.access ??
				((request, context) => {
					const global = readAccess(options.read, sourceQuery(request));
					return {
						all: [
							global,
							...(requiresAccess(global, "authenticated") &&
							request.mode === "one"
								? [
										resourceDisclosure(
											representation,
											identityRecord(request.identity ?? request.scope),
											context,
										).basis,
									]
								: []),
						],
					};
				}),
			available: (request, context) =>
				(!request.sample ||
					(request.sample.fields.length > 0 &&
						request.sample.fields.every((field) =>
							options.sampledFields?.includes(field),
						))) &&
				(source.available?.(request, context) ?? true),
		})),
		readPrerequisites: callerPrerequisites(
			options.read,
			options.readPrerequisites,
		),
		fieldDependencies: options.fieldDependencies,
		presenceDependencies: options.presenceDependencies,
		membershipDependencies: options.membershipDependencies,
		persist: (field) =>
			field === "$presence" || persistedFields.includes(field),
		event: withReferenceEvents(
			representation,
			acquisition.parseReference,
			options.event,
		),
		derive: options.derive,
		commands: options.commands,
		edits: options.edits,
	};
}
