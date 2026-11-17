// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { Operation } from "../runtime/operation.ts";
import { IncusProtocolError } from "./errors.ts";
import { fileUploadRequest } from "./files.ts";
import { decodeIncusText, readIncusResponse } from "./response.ts";
import type { UploadInput } from "./upload.ts";

export {
	IncusError,
	IncusProtocolError,
	IncusReadTimeoutError,
} from "./errors.ts";

export type IncusResult<T> =
	| { type: "sync"; metadata: T; etag?: string }
	| { type: "async"; metadata: Operation; operation: string; etag?: string };

export type RequestOptions = {
	query?: Readonly<Record<string, string | number | boolean | undefined>>;
	body?: unknown;
	etag?: string;
	signal?: AbortSignal;
	priority?: RequestInit["priority"];
	headers?: HeadersInit;
};

export type RawFetchOptions = Omit<RequestInit, "method"> & {
	query?: RequestOptions["query"];
};

export type UploadProgress = { transferred: number; total?: number };
export type TransportOptions = {
	baseURL?: string;
	fetch?: typeof fetch;
	xhr?: () => XMLHttpRequest;
};

export class IncusTransport {
	readonly baseURL: string;
	private readonly fetcher: typeof fetch;
	private readonly xhr?: () => XMLHttpRequest;

	constructor(options: TransportOptions = {}) {
		this.baseURL =
			options.baseURL ??
			(typeof location === "undefined" ? "http://localhost" : location.origin);
		this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.xhr =
			options.xhr ??
			(typeof XMLHttpRequest === "undefined"
				? undefined
				: () => new XMLHttpRequest());
	}

	url(path: string, query?: RequestOptions["query"]): URL {
		const url = new URL(path, this.baseURL);
		if (
			url.origin !== new URL(this.baseURL).origin ||
			!(
				url.pathname === "/" ||
				url.pathname === "/1.0" ||
				url.pathname.startsWith("/1.0/")
			)
		) {
			throw new IncusProtocolError(
				"An Incus request must use this server's API origin.",
			);
		}
		for (const [key, value] of Object.entries(query ?? {})) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}
		return url;
	}

	rawFetch(
		method: string,
		path: string,
		options: RawFetchOptions = {},
	): Promise<Response> {
		const { query, ...init } = options;
		return this.fetcher(this.url(path, query).toString(), {
			credentials: "include",
			cache: "no-store",
			...init,
			method,
		});
	}

	async rawRequest<T>(
		method: string,
		path: string,
		options: RequestOptions = {},
	): Promise<IncusResult<T>> {
		const url = this.url(path, options.query).toString();
		const headers = new Headers(options.headers);
		headers.set("Accept", "application/json");
		if (options.etag !== undefined) headers.set("If-Match", options.etag);
		if (options.body !== undefined)
			headers.set("Content-Type", "application/json");
		const response = await this.rawFetch(method, path, {
			query: options.query,
			headers,
			body:
				options.body === undefined ? undefined : JSON.stringify(options.body),
			signal: options.signal,
			priority: options.priority,
		});
		return readIncusResponse<T>(response, method, url, options.signal);
	}

	async rawGet<T>(
		path: string,
		options: Omit<RequestOptions, "body"> = {},
	): Promise<{ metadata: T; etag?: string }> {
		const response = await this.rawRequest<T>("GET", path, options);
		if (response.type !== "sync")
			throw new IncusProtocolError(
				"An Incus resource read unexpectedly returned an operation.",
			);
		return response;
	}

	uploadRequest(path: string, input: UploadInput) {
		return fileUploadRequest(this.url(path, { path: input.path }), input);
	}

	upload(
		path: string,
		input: UploadInput,
		options: {
			signal?: AbortSignal;
			onProgress?: (progress: UploadProgress) => void;
		} = {},
	): Promise<IncusResult<unknown>> {
		if (!this.xhr) return this.uploadFetch(path, input, options.signal);
		const createXHR = this.xhr;
		return new Promise((resolve, reject) => {
			const request = this.uploadRequest(path, input);
			const url = request.url;
			const xhr = createXHR();
			const abort = () => xhr.abort();
			const cleanup = () => options.signal?.removeEventListener("abort", abort);
			if (options.signal?.aborted) {
				reject(options.signal.reason);
				return;
			}
			xhr.open("POST", url);
			xhr.withCredentials = true;
			for (const [name, value] of Object.entries(request.headers))
				xhr.setRequestHeader(name, value);
			xhr.upload.onprogress = (event) =>
				options.onProgress?.({
					transferred: event.loaded,
					total: event.lengthComputable ? event.total : undefined,
				});
			xhr.onerror = () => {
				cleanup();
				reject(
					new TypeError(
						"The upload connection failed; its remote effect is unknown.",
					),
				);
			};
			xhr.onabort = () => {
				cleanup();
				reject(
					options.signal?.aborted
						? options.signal.reason
						: new DOMException(
								"The upload was aborted; its remote effect is unknown.",
								"AbortError",
							),
				);
			};
			xhr.onload = () => {
				cleanup();
				try {
					options.signal?.throwIfAborted();
					resolve(
						decodeIncusText(
							xhr.responseText,
							xhr.status,
							"POST",
							url,
							xhr.getResponseHeader("ETag") ?? undefined,
						),
					);
				} catch (error) {
					reject(error);
				}
			};
			options.signal?.addEventListener("abort", abort, { once: true });
			xhr.send(input.file);
		});
	}

	private async uploadFetch(
		path: string,
		input: UploadInput,
		signal?: AbortSignal,
	): Promise<IncusResult<unknown>> {
		const { url, ...request } = this.uploadRequest(path, input);
		const response = await this.fetcher(url, {
			...request,
			signal,
		});
		return readIncusResponse(response, "POST", url, signal);
	}
}
