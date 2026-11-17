// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { isRecord } from "../internal/values.ts";
import { isOperation } from "../runtime/operation.ts";
import type { IncusResult } from "./client.ts";
import { IncusError, IncusProtocolError } from "./errors.ts";

function httpError(
	value: unknown,
	status: number,
	method: string,
	url: string,
) {
	return new IncusError(
		isRecord(value) && typeof value.error === "string"
			? value.error
			: `Incus request failed (${status}).`,
		{
			status,
			code:
				isRecord(value) && typeof value.error_code === "number"
					? value.error_code
					: status,
			method,
			url,
		},
	);
}

export function decodeIncusText<T>(
	text: string,
	status: number,
	method: string,
	url: string,
	etag?: string,
): IncusResult<T> {
	if (status >= 200 && status < 300 && (status === 204 || method === "HEAD"))
		return { type: "sync", metadata: undefined as T, etag };
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		if (status < 200 || status >= 300)
			throw httpError(undefined, status, method, url);
		throw new IncusProtocolError("Incus returned a response that is not JSON.");
	}
	return decodeIncusResponse(value, status, method, url, etag);
}

export async function readIncusResponse<T>(
	response: Response,
	method: string,
	url: string,
	signal?: AbortSignal | null,
): Promise<IncusResult<T>> {
	signal?.throwIfAborted();
	const etag = response.headers.get("ETag") ?? undefined;
	if (response.ok && (response.status === 204 || method === "HEAD"))
		return decodeIncusText("", response.status, method, url, etag);
	let text: string;
	try {
		text = await response.text();
	} catch (error) {
		signal?.throwIfAborted();
		if (!response.ok) throw httpError(undefined, response.status, method, url);
		throw error;
	}
	signal?.throwIfAborted();
	return decodeIncusText(text, response.status, method, url, etag);
}

export function decodeIncusResponse<T>(
	value: unknown,
	status: number,
	method: string,
	url: string,
	etag?: string,
): IncusResult<T> {
	if (
		(isRecord(value) && value.type === "error") ||
		status < 200 ||
		status >= 300
	)
		throw httpError(value, status, method, url);
	if (!isRecord(value))
		throw new IncusProtocolError(
			"Incus returned an invalid response envelope.",
		);
	if (value.type === "sync")
		return { type: "sync", metadata: value.metadata as T, etag };
	if (
		value.type === "async" &&
		typeof value.operation === "string" &&
		isOperation(value.metadata)
	) {
		return {
			type: "async",
			operation: value.operation,
			metadata: value.metadata,
			etag,
		};
	}
	throw new IncusProtocolError(
		"Incus returned an unsupported response envelope.",
	);
}
