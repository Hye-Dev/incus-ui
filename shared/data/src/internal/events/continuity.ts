// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type {
	ContinuityRef,
	ObservationLiveness,
	ResourceContext,
	Values,
} from "@hyecompany/vem-data/runtime";

import type { ResourceRepresentation } from "../acquisition/resource-definition.ts";

/** Continuity of the connected Incus event stream, independent of project delivery. */
export const eventTransport = Object.freeze({ channel: "incus:events" });

/** Continuity established by receiving events for this project; connection alone is not proof. */
export function projectContinuity(project: unknown = "default"): ContinuityRef {
	return {
		channel: "incus:events",
		scope: { project: typeof project === "string" ? project : "default" },
	};
}

/** Use only for values the definition updates or invalidates from these projects' events. */
export function projectLiveness(
	project: unknown = "default",
	...relatedProjects: readonly unknown[]
): ObservationLiveness {
	return {
		all: [
			eventTransport,
			...[project, ...relatedProjects].map(projectContinuity),
		],
	};
}

export const eventSnapshot: ObservationLiveness = {
	all: [eventTransport, "snapshot"],
};

export function recordLiveness(
	representation: ResourceRepresentation,
	identity: Values,
	values: Values,
	context: ResourceContext,
): ObservationLiveness {
	return (
		representation.liveness?.(identity, values, context) ??
		projectLiveness(
			representation.name === "projects"
				? identity.name
				: (values.project ?? identity.project),
		)
	);
}
