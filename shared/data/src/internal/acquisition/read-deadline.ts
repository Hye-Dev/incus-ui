// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { IncusReadTimeoutError } from "../../transport/errors.ts";

export function resolveReadTimeout(timeoutMs = 30_000): number {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
		throw new RangeError("readTimeoutMs must be a positive safe integer.");
	return timeoutMs;
}

/** Bound an Incus source read, including its response body, while preserving caller cancellation. */
export async function withReadDeadline<T>(
	timeoutMs: number | undefined,
	lifetime: AbortSignal,
	read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
	const duration = resolveReadTimeout(timeoutMs);
	const deadline = AbortSignal.timeout(duration);
	const signal = AbortSignal.any([lifetime, deadline]);
	try {
		signal.throwIfAborted();
		const value = await read(signal);
		signal.throwIfAborted();
		return value;
	} catch (error) {
		if (deadline.aborted && signal.reason === deadline.reason)
			throw new IncusReadTimeoutError(duration, { cause: error });
		if (signal.aborted) throw signal.reason;
		throw error;
	}
}
