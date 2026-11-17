// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { stableKey } from "@hyecompany/vem-data";
import type {
	FactObservation,
	ObservationBatch,
	ResourceContext,
	Values,
} from "@hyecompany/vem-data/runtime";
import { parseIncusEvent } from "../../runtime/event-stream.ts";
import type { IncusLifecycleEvent } from "../../runtime/event-types.ts";
import {
	identityFieldLiveness,
	type ResourceRoute,
} from "../identity/api-paths.ts";
import { identityRecord } from "../identity/resource-identity.ts";
import { projectLiveness } from "./continuity.ts";
import { renamedIdentity } from "./rename.ts";

export type LifecycleChange = {
	route: ResourceRoute;
	resource: string;
	event: IncusLifecycleEvent;
	context: ResourceContext;
	parsed: { resource: string; identity: Values };
	action: string;
	eventScope: string;
	identities: unknown[];
};

export function readLifecycle(
	route: ResourceRoute,
	input: unknown,
	context: ResourceContext,
	inherited = false,
): LifecycleChange | undefined {
	const event = parseIncusEvent(input);
	if (!event || event.type !== "lifecycle") return;
	const resource = route.resource;
	const parsed = route.parse(event.metadata.source, event.project);
	if (parsed?.resource !== resource) return;
	const eventScope = `incus:events:${event.project ?? "default"}`;
	context.grant(eventScope, "allowed");
	const aliases = (inherited ? context.records(resource) : [])
		.filter((record) => {
			const ref = identityRecord(record.identity);
			return (
				(ref.name ?? ref.fingerprint) ===
					(parsed.identity.name ?? parsed.identity.fingerprint) &&
				(record.values.project ?? ref.project) === parsed.identity.project
			);
		})
		.map((record) => record.identity);
	return {
		route,
		resource,
		event,
		context,
		parsed,
		action: event.metadata.action,
		eventScope,
		identities: [
			parsed.identity,
			...aliases.filter(
				(identity) => stableKey(identity) !== stableKey(parsed.identity),
			),
		],
	};
}

export function basicLifecycle(
	change: LifecycleChange,
	onRename?: (oldIdentity: Values, facts: FactObservation[]) => void,
): ObservationBatch | undefined {
	const { route, resource, event, parsed, action, eventScope, identities } =
		change;
	const oldIdentity = renamedIdentity(route, event, parsed.identity);
	if (oldIdentity) {
		const facts: FactObservation[] = [
			{
				resource,
				identity: oldIdentity,
				presence: "absent",
				basis: [eventScope],
				liveness: projectLiveness(
					event.project,
					parsed.identity.project ?? event.project,
				),
			},
			{
				resource,
				identity: parsed.identity,
				presence: "present",
				values: parsed.identity,
				fieldLiveness: identityFieldLiveness(
					route.identityField,
					parsed.identity,
					parsed.identity,
				),
				basis: [eventScope],
				liveness: projectLiveness(
					event.project,
					parsed.identity.project ?? event.project,
				),
			},
		];
		onRename?.(oldIdentity, facts);
		return {
			facts,
			identityTransitions: [
				{
					resource,
					from: oldIdentity,
					to: parsed.identity,
					basis: [eventScope],
					liveness: projectLiveness(
						event.project,
						parsed.identity.project ?? event.project,
					),
				},
			],
		};
	}
	if (action.endsWith("-deleted"))
		return {
			facts: identities.map((identity) => ({
				resource,
				identity,
				presence: "absent",
				basis: [eventScope],
				liveness: projectLiveness(
					event.project,
					identityRecord(identity).project ?? event.project,
				),
			})),
		};
	if (action.endsWith("-created"))
		return {
			facts: [
				{
					resource,
					identity: parsed.identity,
					presence: "present",
					values: parsed.identity,
					fieldLiveness: identityFieldLiveness(
						route.identityField,
						parsed.identity,
						parsed.identity,
					),
					basis: [eventScope],
					liveness: projectLiveness(
						event.project,
						parsed.identity.project ?? event.project,
					),
				},
			],
		};
}
