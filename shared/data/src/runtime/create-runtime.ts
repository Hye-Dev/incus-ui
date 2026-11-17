// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { stableKey } from "@hyecompany/vem-data";
import {
	createRuntime,
	type PersistenceAdapter,
	type ResourceDefinition,
} from "@hyecompany/vem-data/runtime";
import {
	resolveReadTimeout,
	withReadDeadline,
} from "../internal/acquisition/read-deadline.ts";
import {
	eventTransport,
	projectContinuity,
} from "../internal/events/continuity.ts";
import type { ResourceRoute } from "../internal/identity/api-paths.ts";
import { isRecord } from "../internal/values.ts";
import { serverObservations } from "../resources/server/observations.ts";
import {
	IncusProtocolError,
	type TransportOptions,
} from "../transport/client.ts";
import { IncusApi } from "../transport/typed-client.ts";
import { type EventSocket, IncusEvents } from "./event-stream.ts";
import { OperationMonitor } from "./operation-monitor.ts";
import { createIncusDefinitions } from "./resource-catalog.ts";
import type { IncusAdapterServices } from "./services.ts";

/** Resolves after initial access discovery is attempted; discovery failure leaves access unknown and calls onError. */
export async function createIncusRuntime(
	options: {
		baseUrl?: string;
		/** End-to-end read deadline, including browser queueing and response bodies; defaults to 30,000 ms. */
		readTimeoutMs?: number;
		persistence?: PersistenceAdapter;
		fetch?: TransportOptions["fetch"];
		xhr?: TransportOptions["xhr"];
		socket?: (url: string) => EventSocket;
		additionalRoutes?: readonly ResourceRoute[];
		additionalDefinitions?(
			services: IncusAdapterServices,
		): readonly ResourceDefinition[];
		onError?(error: unknown): void;
	} = {},
) {
	const readTimeoutMs = resolveReadTimeout(options.readTimeoutMs);
	const api = new IncusApi({
		baseURL: options.baseUrl,
		fetch: options.fetch,
		xhr: options.xhr,
	});
	const transport = api.transport;
	let runtime: ReturnType<typeof createRuntime>;
	let definitions: readonly ResourceDefinition[];
	let verifiedIdentity: string | undefined;
	let generation = 0;
	let disposed = false;
	let discovery: { generation: number; result: Promise<void> } | undefined;
	const lifetime = new AbortController();
	const continuousProjects = new Set<string>();
	function interruptContinuity(): void {
		if (disposed) return;
		runtime.setContinuity(eventTransport, "interrupted");
		for (const project of continuousProjects)
			runtime.setContinuity(projectContinuity(project), "interrupted");
		continuousProjects.clear();
	}

	const events = new IncusEvents({
		baseURL: transport.baseURL,
		socket: options.socket,
		onEvent: (event) => {
			const project = event.project ?? "default";
			continuousProjects.add(project);
			runtime.setContinuity(projectContinuity(project), "live");
			if (event.type === "operation") monitor.receive(event.metadata);
			for (const definition of definitions)
				runtime.event(definition.name, event);
		},
		onGap: () => {
			interruptContinuity();
			monitor.wake();
		},
		onConnection: (connected) => {
			if (connected) runtime.setContinuity(eventTransport, "live");
			monitor.wake();
		},
	});
	const monitor = new OperationMonitor(transport, (project) =>
		events.covered(project),
	);

	async function acceptServer(
		value: unknown,
		expectedGeneration = generation,
	): Promise<boolean> {
		if (disposed) return false;
		if (!isRecord(value))
			throw new IncusProtocolError(
				"Incus did not return server access information.",
			);
		const trusted = value.auth === "trusted";
		if (
			trusted &&
			(typeof value.auth_user_method !== "string" ||
				typeof value.auth_user_name !== "string" ||
				!value.auth_user_name)
		)
			throw new IncusProtocolError(
				"The authenticated caller could not be identified.",
			);
		const caller = trusted
			? [value.auth_user_method, value.auth_user_name]
			: ["anonymous"];
		const bytes = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(
				stableKey([new URL(transport.baseURL).origin, ...caller]),
			),
		);
		const identity = [...new Uint8Array(bytes)]
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("");
		if (disposed || generation !== expectedGeneration) return false;
		if (identity !== verifiedIdentity) {
			events.stop();
			monitor.retire();
			generation++;
			runtime.setAccess({
				contextId: `incus:${identity}`,
				retirePrevious: true,
				decisions: [
					{ scope: "authenticated", state: trusted ? "allowed" : "denied" },
				],
			});
			verifiedIdentity = identity;
		}
		runtime.observe(serverObservations(value, {}, trusted));
		if (trusted) {
			events.start();
		}
		return true;
	}

	function refreshAccess(): Promise<void> {
		if (disposed)
			return Promise.reject(new Error("The Incus runtime is closed."));
		if (discovery?.generation === generation) return discovery.result;
		const expectedGeneration = generation;
		const result = (async () => {
			let response: { metadata: unknown };
			try {
				response = await withReadDeadline(
					readTimeoutMs,
					lifetime.signal,
					(signal) => transport.rawGet<unknown>("/1.0", { signal }),
				);
			} catch (error) {
				if (disposed || generation !== expectedGeneration) return;
				throw error;
			}
			if (disposed || generation !== expectedGeneration) return;
			await acceptServer(response.metadata, expectedGeneration);
		})().finally(() => {
			if (discovery?.result === result) discovery = undefined;
		});
		discovery = { generation: expectedGeneration, result };
		return result;
	}

	function retireAccess(): void {
		if (disposed) return;
		events.stop();
		monitor.retire();
		verifiedIdentity = undefined;
		runtime.setAccess({
			contextId: `retired:${++generation}`,
			retirePrevious: true,
			decisions: [{ scope: "authenticated", state: "denied" }],
		});
	}

	const services: IncusAdapterServices = {
		readTimeoutMs,
		api,
		transport,
		monitor: {
			registrationFence: () => monitor.registrationFence(),
			watch: (...args) => monitor.watch(...args),
		},
		covered: (project) => events.covered(project),
		refreshAccess,
		retireAccess,
	};
	definitions = [
		...createIncusDefinitions({
			...services,
			routes: options.additionalRoutes,
			acceptServer: async (value, context) => {
				if (
					context.signal.aborted ||
					context.accessContext !== runtime.accessSnapshot().contextId ||
					runtime.accessSnapshot().contextId.startsWith("retired:")
				)
					return false;
				return acceptServer(value);
			},
		}),
		...(options.additionalDefinitions?.(services) ?? []),
	];
	runtime = createRuntime({
		resources: definitions,
		persistence: options.persistence,
		contextId: "discovering",
		access: [{ scope: "authenticated", state: "unknown" }],
		onError: options.onError,
	});
	try {
		await refreshAccess();
	} catch (error) {
		options.onError?.(error);
	}
	return {
		runtime,
		api,
		transport,
		refreshAccess,
		retireAccess,
		dispose: () => {
			if (disposed) return;
			disposed = true;
			generation++;
			verifiedIdentity = undefined;
			lifetime.abort();
			events.stop();
			monitor.close();
			runtime.close();
		},
	};
}
