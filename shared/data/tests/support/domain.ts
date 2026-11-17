// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	createRuntime,
	type Runtime,
	type Values,
} from "@hyecompany/vem-data/runtime";
import {
	eventTransport,
	projectContinuity,
	projectLiveness,
	readScope,
} from "../../src/definition-authoring.ts";
import {
	createIncusDefinitions,
	type DomainOptions,
} from "../../src/runtime.ts";
import { IncusTransport } from "../../src/transport.ts";

export const sync = (metadata: unknown, etag?: string) =>
	Response.json(
		{ type: "sync", metadata },
		{ headers: etag ? { ETag: etag } : {} },
	);

export function harness(
	fetch: typeof globalThis.fetch,
	covered = true,
	options: Pick<DomainOptions, "readTimeoutMs"> = {},
) {
	const transport = new IncusTransport({
		baseURL: "https://incus.test",
		fetch,
	});
	const definitions = createIncusDefinitions({
		...options,
		transport,
		refreshAccess: async () => {},
	});
	const runtime = createRuntime({
		resources: definitions,
		transferFetch: fetch,
		contextId: "alice",
		access: [{ scope: "authenticated", state: "allowed" }],
	});
	if (covered) {
		runtime.setContinuity(eventTransport, "live");
		runtime.setContinuity(projectContinuity("team"), "live");
		runtime.setContinuity(projectContinuity("default"), "live");
	}
	return {
		runtime,
		definitions,
		close: () => {
			runtime.close();
		},
	};
}

export function observe(
	runtime: Runtime,
	resource: string,
	identity: unknown,
	values: Values,
) {
	const scope = readScope(resource, identity);
	const continuity = projectContinuity(
		resource === "projects" && typeof values.name === "string"
			? values.name
			: typeof identity === "object" &&
					identity !== null &&
					"project" in identity
				? identity.project
				: "default",
	);
	runtime.observe({
		grants: [{ scope, state: "allowed" }],
		facts: [
			{
				resource,
				identity,
				values,
				presence: "present",
				basis: [scope],
				liveness: projectLiveness(
					continuity.scope &&
						typeof continuity.scope === "object" &&
						"project" in continuity.scope
						? continuity.scope.project
						: "default",
				),
			},
		],
	});
}
