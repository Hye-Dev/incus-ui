// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { isRecord } from "../internal/values.ts";
import type { IncusEvent } from "./event-types.ts";
import { isOperation } from "./operation.ts";

export interface EventSocket {
	onopen: ((event: Event) => void) | null;
	onclose: ((event: CloseEvent) => void) | null;
	onerror: ((event: Event) => void) | null;
	onmessage: ((event: MessageEvent) => void) | null;
	close(): void;
}

type EventOptions = {
	baseURL: string;
	socket?: (url: string) => EventSocket;
	onEvent(event: IncusEvent): void;
	onGap(): void;
	onConnection?(connected: boolean): void;
};

export function parseIncusEvent(value: unknown): IncusEvent | undefined {
	if (!isRecord(value) || !isRecord(value.metadata)) return;
	if (value.project !== undefined && typeof value.project !== "string") return;
	if (value.type === "operation" && isOperation(value.metadata))
		return value as IncusEvent;
	if (
		value.type === "lifecycle" &&
		typeof value.metadata.action === "string" &&
		typeof value.metadata.source === "string"
	)
		return value as IncusEvent;
}

export class IncusEvents {
	private socket?: EventSocket;
	private reconnect?: ReturnType<typeof setTimeout>;
	private enabled = false;
	private attempt = 0;
	private connected = false;
	private readonly projects = new Set<string>();
	private readonly options: EventOptions;

	constructor(options: EventOptions) {
		this.options = options;
	}

	start(): void {
		if (this.enabled) return;
		this.enabled = true;
		this.connect();
	}

	stop(): void {
		this.enabled = false;
		clearTimeout(this.reconnect);
		this.reconnect = undefined;
		const socket = this.socket;
		this.socket = undefined;
		if (socket) {
			socket.onclose = null;
			socket.close();
		}
		this.lostConnection();
	}

	covered(project: string): boolean {
		return this.connected && this.projects.has(project);
	}

	private lostConnection(): void {
		const wasConnected = this.connected;
		this.connected = false;
		this.projects.clear();
		if (wasConnected) this.options.onGap();
		this.options.onConnection?.(false);
	}

	private connect(): void {
		if (!this.enabled) return;
		const url = new URL("/1.0/events", this.options.baseURL);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		url.searchParams.set("all-projects", "true");
		url.searchParams.set("type", "lifecycle,operation");
		const makeSocket =
			this.options.socket ?? ((address: string) => new WebSocket(address));
		let socket: EventSocket;
		try {
			socket = makeSocket(url.toString());
		} catch {
			this.scheduleReconnect();
			return;
		}
		this.socket = socket;
		socket.onopen = () => {
			if (this.socket !== socket) return;
			this.connected = true;
			this.attempt = 0;
			this.options.onConnection?.(true);
		};
		socket.onmessage = (message) => {
			if (this.socket !== socket) return;
			try {
				const event = parseIncusEvent(JSON.parse(String(message.data)));
				if (!event) return;
				this.projects.add(event.project ?? "default");
				this.options.onEvent(event);
			} catch {
				socket.close();
			}
		};
		socket.onerror = () => socket.close();
		socket.onclose = () => {
			if (this.socket !== socket) return;
			this.socket = undefined;
			this.lostConnection();
			this.scheduleReconnect();
		};
	}

	private scheduleReconnect(): void {
		if (!this.enabled || this.reconnect) return;
		const delay = Math.min(30_000, 500 * 2 ** Math.min(this.attempt++, 6));
		this.reconnect = setTimeout(() => {
			this.reconnect = undefined;
			this.connect();
		}, delay);
	}
}
