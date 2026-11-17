// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { isRecord } from "../internal/values.ts";
import { IncusError, type IncusTransport } from "../transport/client.ts";
import {
	type ActionOutcome,
	isOperation,
	isTerminalOperation,
	type Operation,
	operationOutcome,
} from "./operation.ts";

type PendingOperation = {
	operation: Operation;
	project: string;
	registrationGap: boolean;
	listeners: Set<{
		resolve(outcome: ActionOutcome): void;
		signal: AbortSignal;
		abort(): void;
		progress?: (operation: Operation) => void;
	}>;
};

export class OperationMonitor {
	private readonly pending = new Map<string, PendingOperation>();
	private readonly recent = new Map<string, Operation>();
	private timer?: ReturnType<typeof setTimeout>;
	private polling = false;
	private cursor = 0;
	private closed = false;
	private generation = 0;
	private cacheGeneration = 0;
	private controller = new AbortController();
	private readonly transport: IncusTransport;
	private readonly covered: (project: string) => boolean;
	private readonly intervalMs: number;

	constructor(
		transport: IncusTransport,
		covered: (project: string) => boolean,
		intervalMs = 1000,
	) {
		this.transport = transport;
		this.covered = covered;
		this.intervalMs = intervalMs;
	}

	registrationFence(): number {
		return this.cacheGeneration;
	}

	receive(operation: Operation): void {
		const previous = this.recent.get(operation.id);
		if (previous && isTerminalOperation(previous)) return;
		this.recent.set(operation.id, operation);
		if (this.recent.size > 2048) {
			this.cacheGeneration++;
			this.recent.delete(this.recent.keys().next().value as string);
		}
		const entry = this.pending.get(operation.id);
		if (!entry) return;
		entry.operation = operation;
		entry.registrationGap = false;
		for (const listener of entry.listeners) listener.progress?.(operation);
		if (isTerminalOperation(operation))
			this.finish(operation.id, operationOutcome(operation));
	}

	watch(
		operation: Operation,
		project: string,
		signal: AbortSignal,
		progress?: (operation: Operation) => void,
		registrationFence = this.cacheGeneration,
	): Promise<ActionOutcome> {
		if (signal.aborted || this.closed)
			return Promise.resolve({
				kind: "unknown",
				message: "Operation monitoring is unavailable.",
			});
		const registrationGap = registrationFence !== this.cacheGeneration;
		if (!this.recent.has(operation.id)) this.receive(operation);
		const current = this.recent.get(operation.id) ?? operation;
		if (isTerminalOperation(current))
			return Promise.resolve(operationOutcome(current));
		return new Promise((resolve) => {
			let entry = this.pending.get(operation.id);
			if (!entry) {
				entry = {
					operation: current,
					project,
					registrationGap,
					listeners: new Set(),
				};
				this.pending.set(operation.id, entry);
			}
			const listener = {
				resolve,
				signal,
				progress,
				abort: () => {
					entry.listeners.delete(listener);
					if (entry.listeners.size === 0) this.pending.delete(operation.id);
					resolve({
						kind: "unknown",
						message: "Monitoring stopped; the server operation may continue.",
					});
				},
			};
			entry.listeners.add(listener);
			signal.addEventListener("abort", listener.abort, { once: true });
			progress?.(current);
			this.wake();
		});
	}

	wake(): void {
		if (
			this.closed ||
			this.polling ||
			this.timer ||
			![...this.pending.values()].some(
				(entry) => entry.registrationGap || !this.covered(entry.project),
			)
		)
			return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			void this.poll();
		}, this.intervalMs);
	}

	close(): void {
		this.closed = true;
		this.retire();
	}

	retire(): void {
		this.generation++;
		this.cacheGeneration++;
		clearTimeout(this.timer);
		this.timer = undefined;
		this.controller.abort();
		this.controller = new AbortController();
		for (const id of this.pending.keys())
			this.finish(id, {
				kind: "unknown",
				message:
					"The owning connection closed before the operation outcome was observed.",
			});
		this.recent.clear();
	}

	private finish(id: string, outcome: ActionOutcome): void {
		const entry = this.pending.get(id);
		if (!entry) return;
		this.pending.delete(id);
		for (const listener of entry.listeners) {
			listener.signal.removeEventListener("abort", listener.abort);
			listener.resolve(outcome);
		}
	}

	private async poll(): Promise<void> {
		if (this.closed) return;
		const generation = this.generation;
		this.polling = true;
		try {
			const projects = [
				...new Set(
					[...this.pending.values()]
						.filter(
							(entry) => entry.registrationGap || !this.covered(entry.project),
						)
						.map((entry) => entry.project),
				),
			].sort();
			if (projects.length === 0) return;
			const project = projects[this.cursor++ % projects.length];
			const observed = new Set<string>();
			const signal = AbortSignal.any([
				this.controller.signal,
				AbortSignal.timeout(15_000),
			]);
			try {
				const response = await this.transport.rawGet<unknown>(
					"/1.0/operations",
					{ query: { project, recursion: 1 }, signal },
				);
				if (generation !== this.generation) return;
				if (isRecord(response.metadata)) {
					for (const group of Object.values(response.metadata)) {
						if (!Array.isArray(group)) continue;
						for (const operation of group)
							if (isOperation(operation)) {
								observed.add(operation.id);
								this.receive(operation);
							}
					}
				}
			} catch {
				/* Individual reads remain available when collection permissions differ. */
			}
			if (generation !== this.generation) return;
			const missing = [...this.pending.values()].filter(
				(entry) =>
					entry.project === project &&
					(entry.registrationGap || !this.covered(project)) &&
					!observed.has(entry.operation.id),
			);
			const offset = missing.length ? this.cursor % missing.length : 0;
			const selected = Array.from(
				{ length: Math.min(2, missing.length) },
				(_, index) => missing[(offset + index) % missing.length],
			);
			await Promise.all(
				selected.map(async (entry) => {
					try {
						const response = await this.transport.rawGet<unknown>(
							`/1.0/operations/${encodeURIComponent(entry.operation.id)}`,
							{
								signal: AbortSignal.any([
									this.controller.signal,
									AbortSignal.timeout(15_000),
								]),
							},
						);
						if (
							generation === this.generation &&
							isOperation(response.metadata)
						)
							this.receive(response.metadata);
					} catch (error) {
						if (
							generation === this.generation &&
							error instanceof IncusError &&
							[401, 403, 404].includes(error.status)
						)
							this.finish(entry.operation.id, {
								kind: "unknown",
								message:
									"The operation result is no longer observable. Its absence does not establish success or failure.",
							});
					}
				}),
			);
		} finally {
			this.polling = false;
			this.wake();
		}
	}
}
