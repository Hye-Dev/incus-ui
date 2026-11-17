// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceContext } from "@hyecompany/vem-data/runtime";
import type { ResourceRoute } from "../internal/identity/api-paths.ts";
import type { IncusTransport } from "../transport/client.ts";
import type { IncusApi } from "../transport/typed-client.ts";
import type { ActionOutcome, Operation } from "./operation.ts";

/** Observe accepted Incus work without controlling the runtime's monitor lifetime. */
export interface IncusOperationMonitor {
	registrationFence(): number;
	watch(
		operation: Operation,
		project: string,
		signal: AbortSignal,
		progress?: (operation: Operation) => void,
		registrationFence?: number,
	): Promise<ActionOutcome>;
}

export type IncusAdapterServices = {
	/** End-to-end read deadline, including browser queueing and response bodies; defaults to 30,000 ms. */
	readTimeoutMs?: number;
	transport: IncusTransport;
	api: IncusApi;
	monitor: IncusOperationMonitor;
	covered(project: string): boolean;
	refreshAccess(): Promise<void>;
	retireAccess(): void;
};

export type DomainOptions = Pick<
	IncusAdapterServices,
	"transport" | "readTimeoutMs" | "refreshAccess"
> & {
	routes?: readonly ResourceRoute[];
	retireAccess?(): void;
	acceptServer?(
		value: unknown,
		context: ResourceContext,
	): boolean | Promise<boolean>;
};
