// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	IncusProtocolError,
	type IncusResult,
	IncusTransport,
	type TransportOptions,
} from "./client.ts";
import type { paths } from "./generated/schema.ts";
import { readIncusResponse } from "./response.ts";

type Verb = "get" | "post" | "put" | "patch" | "delete" | "head" | "options";
export type ApiPath = keyof paths;
export type ApiMethod<P extends ApiPath> = Uppercase<
	{
		[M in Verb]: M extends keyof paths[P]
			? NonNullable<paths[P][M]> extends never
				? never
				: M
			: never;
	}[Verb]
>;
type Operation<P extends ApiPath, M extends ApiMethod<P>> = NonNullable<
	paths[P][Lowercase<M> & keyof paths[P]]
>;
type ParametersOf<O> = O extends { parameters: infer P } ? P : never;
type Parameter<O, K extends string> = K extends keyof ParametersOf<O>
	? NonNullable<ParametersOf<O>[K]>
	: never;
type Property<K extends string, T> = [T] extends [never]
	? { [P in K]?: never }
	: Partial<T> extends T
		? { [P in K]?: T }
		: { [P in K]: T };
type URLParametersInput<O> = Property<"path", Parameter<O, "path">> &
	Property<"query", Parameter<O, "query">>;
type ParametersInput<O> = URLParametersInput<O> &
	Property<"header", Parameter<O, "header">>;
type Content<B> = B extends { content: infer C }
	? C extends { "application/json": infer J }
		? J
		: BodyInit
	: never;
type Body<O> = O extends { requestBody?: infer B }
	? Content<NonNullable<B>>
	: never;
type BodyInput<O> = [Body<O>] extends [never]
	? { body?: never }
	: O extends { requestBody: unknown }
		? { body: Body<O> }
		: { body?: Body<O> };
type Responses<O> = O extends { responses: infer R } ? R : never;
export type WebSocketPath = {
	[P in ApiPath]: "GET" extends ApiMethod<P>
		? 101 extends keyof Responses<Operation<P, Extract<"GET", ApiMethod<P>>>>
			? P
			: never
		: never;
}[ApiPath];
/** Browser WebSockets support URL parameters and protocols, not HTTP request options. */
export type WebSocketOptions<P extends WebSocketPath> = Property<
	"params",
	URLParametersInput<Operation<P, Extract<"GET", ApiMethod<P>>>>
> & { protocols?: string | readonly string[] };
type Success<O> = Responses<O>[Extract<
	keyof Responses<O>,
	200 | 201 | 203 | 204 | "200" | "201" | "203" | "204"
>];
type Metadata<B> = B extends { content: { "application/json": infer J } }
	? J extends { metadata?: infer V }
		? V
		: J
	: undefined;
export type ParseMode =
	| "json"
	| "response"
	| "text"
	| "blob"
	| "arrayBuffer"
	| "stream";
type DefaultMode<M> = M extends "HEAD" ? "response" : "json";
export type ApiOptions<
	P extends ApiPath,
	M extends ApiMethod<P>,
	A extends ParseMode = DefaultMode<M>,
> = Omit<RequestInit, "body" | "method"> &
	BodyInput<Operation<P, M>> &
	Property<"params", ParametersInput<Operation<P, M>>> & {
		parseAs?: A;
		etag?: string;
		duplex?: "half";
	};
export type ApiResult<
	P extends ApiPath,
	M extends ApiMethod<P>,
	A extends ParseMode,
> = A extends "response"
	? Response
	: A extends "text"
		? string
		: A extends "blob"
			? Blob
			: A extends "arrayBuffer"
				? ArrayBuffer
				: A extends "stream"
					? ReadableStream<Uint8Array> | null
					: IncusResult<Metadata<Success<Operation<P, M>>>> & {
							response: Response;
						};
type RuntimeOptions = Omit<RequestInit, "body" | "method"> & {
	body?: unknown;
	params?: {
		path?: Record<string, string | number>;
		query?: Record<string, unknown>;
		header?: Record<string, unknown>;
	};
	parseAs?: ParseMode;
	etag?: string;
	duplex?: "half";
};

function apiURL(
	transport: IncusTransport,
	template: string,
	params: RuntimeOptions["params"],
): URL {
	const path = template.replace(/\{([^}]+)\}/g, (_, key: string) => {
		const value = params?.path?.[key];
		if (value === undefined)
			throw new TypeError(`Missing path parameter ${key}`);
		if (String(value) === "." || String(value) === "..")
			throw new TypeError("A path parameter cannot be a traversal segment");
		return encodeURIComponent(String(value));
	});
	const url = transport.url(path);
	for (const [key, value] of Object.entries(params?.query ?? {})) {
		if (value === undefined) continue;
		const existing = url.searchParams.get(key);
		if (existing !== null && existing !== String(value))
			throw new TypeError(
				`The query parameter ${key} conflicts with the selected API representation`,
			);
		url.searchParams.set(
			key,
			Array.isArray(value) ? value.join(",") : String(value),
		);
	}
	return url;
}

function body(value: unknown): { body?: BodyInit; json: boolean } {
	if (value === undefined) return { json: false };
	if (
		typeof value === "string" ||
		value instanceof Blob ||
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		value instanceof FormData ||
		value instanceof URLSearchParams ||
		value instanceof ReadableStream
	)
		return { body: value as BodyInit, json: false };
	return { body: JSON.stringify(value), json: true };
}

export class IncusApi {
	readonly transport: IncusTransport;
	constructor(options: TransportOptions = {}) {
		this.transport = new IncusTransport(options);
	}

	request<
		const P extends ApiPath,
		M extends ApiMethod<P>,
		A extends ParseMode | undefined,
	>(
		method: M,
		path: P,
		options: Omit<ApiOptions<P, M>, "parseAs"> & { parseAs: A },
	): Promise<ApiResult<P, M, A extends ParseMode ? A : DefaultMode<M>>>;
	request<
		const P extends ApiPath,
		M extends ApiMethod<P>,
		A extends ParseMode = DefaultMode<M>,
	>(
		method: M,
		path: P,
		...args: Partial<ApiOptions<P, M, A>> extends ApiOptions<P, M, A>
			? [options?: ApiOptions<P, M, A>]
			: [options: ApiOptions<P, M, A>]
	): Promise<ApiResult<P, M, A | DefaultMode<M>>>;
	request(
		method: string,
		path: ApiPath,
		options: RuntimeOptions = {},
	): Promise<unknown> {
		return this.#request(method, path, options);
	}

	async #request(
		method: string,
		path: string,
		options: RuntimeOptions,
	): Promise<unknown> {
		const { params, body: value, parseAs, etag, ...fetchOptions } = options;
		const url = apiURL(this.transport, path, params);
		const headers = new Headers(fetchOptions.headers);
		for (const [name, value] of Object.entries(params?.header ?? {}))
			if (value !== undefined) headers.set(name, String(value));
		const payload = body(value);
		if (payload.json && !headers.has("Content-Type"))
			headers.set("Content-Type", "application/json");
		if (etag !== undefined) headers.set("If-Match", etag);
		const mode = parseAs ?? (method === "HEAD" ? "response" : "json");
		if (mode === "json" && !headers.has("Accept"))
			headers.set("Accept", "application/json");
		const response = await this.transport.rawFetch(method, url.href, {
			...fetchOptions,
			headers,
			body: payload.body,
		});
		if (!response.ok)
			await readIncusResponse(response, method, url.href, fetchOptions.signal);
		switch (mode) {
			case "response":
				return response;
			case "text":
				return response.text();
			case "blob":
				return response.blob();
			case "arrayBuffer":
				return response.arrayBuffer();
			case "stream":
				return response.body;
		}
		return {
			...(await readIncusResponse(
				response,
				method,
				url.href,
				fetchOptions.signal,
			)),
			response,
		};
	}

	async raw(
		method: string,
		path: string,
		options: RequestInit = {},
	): Promise<Response> {
		return this.transport.rawFetch(method, path, options);
	}

	websocket<const P extends WebSocketPath>(
		path: P,
		...args: Partial<WebSocketOptions<P>> extends WebSocketOptions<P>
			? [options?: WebSocketOptions<P>]
			: [options: WebSocketOptions<P>]
	): WebSocket {
		const options = (args[0] ?? {}) as {
			params?: RuntimeOptions["params"];
			protocols?: string | readonly string[];
		};
		if (
			Object.keys(options).some(
				(key) => key !== "params" && key !== "protocols",
			) ||
			Object.keys(options.params ?? {}).some(
				(key) => key !== "path" && key !== "query",
			)
		)
			throw new TypeError(
				"WebSocket requests accept only URL parameters and protocols.",
			);
		const url = apiURL(
			this.transport,
			path,
			options.params as RuntimeOptions["params"],
		);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		try {
			return new WebSocket(
				url,
				typeof options.protocols === "string"
					? options.protocols
					: options.protocols
						? [...options.protocols]
						: undefined,
			);
		} catch {
			throw new IncusProtocolError("The Incus WebSocket could not be opened");
		}
	}
}
