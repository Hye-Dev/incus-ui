// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

export class IncusError extends Error {
	readonly status: number;
	readonly code: number;
	readonly method: string;
	readonly url: string;

	constructor(
		message: string,
		details: { status: number; code?: number; method: string; url: string },
	) {
		super(message);
		this.name = "IncusError";
		this.status = details.status;
		this.code = details.code ?? details.status;
		this.method = details.method;
		const url = new URL(details.url, "http://incus.invalid");
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		this.url = url.toString();
	}
}

export { IncusProtocolError } from "../internal/protocol-error.ts";

export class IncusReadTimeoutError extends Error {
	readonly timeoutMs: number;

	constructor(timeoutMs: number, options?: ErrorOptions) {
		super(
			`The read exceeded its ${timeoutMs} ms deadline, including waiting for a connection and receiving the response.`,
			options,
		);
		this.name = "IncusReadTimeoutError";
		this.timeoutMs = timeoutMs;
	}
}
