// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ApiOptions, ApiResult, IncusApi } from "../../src/transport.ts";

// Type assertions never dispatch these invalid requests.
function typeContract(api: IncusApi) {
	// @ts-expect-error This endpoint has no POST method.
	api.request("POST", "/1.0");
	// @ts-expect-error Instance names are required path parameters.
	api.request("GET", "/1.0/instances/{name}");
	api.request("GET", "/1.0/instances/{name}", {
		// @ts-expect-error Path parameters are typed.
		params: { path: { project: "default" } },
	});
	// @ts-expect-error GET has no writable body.
	api.request("GET", "/1.0", { body: {} });
	// @ts-expect-error The profile update body is required by the schema.
	api.request("PUT", "/1.0/profiles/{name}", {
		params: { path: { name: "default" } },
	});
	api.request("PUT", "/1.0/instances/{name}/state", {
		params: { path: { name: "web-1" } },
		// @ts-expect-error The generated state body rejects unrelated fields.
		body: { imaginary: true },
	});
	api.websocket("/1.0/events");
	api.websocket("/1.0/events", {
		params: { query: { "all-projects": true, type: "lifecycle,operation" } },
		protocols: ["example"] as const,
	});
	api.websocket("/1.0/operations/{id}/websocket", {
		params: { path: { id: "operation-1" }, query: { secret: "token" } },
	});
	// @ts-expect-error The operation ID is required.
	api.websocket("/1.0/operations/{id}/websocket");
	// @ts-expect-error This endpoint does not support a WebSocket upgrade.
	api.websocket("/1.0/projects");
	// @ts-expect-error Browser WebSockets do not accept HTTP headers.
	api.websocket("/1.0/events", { headers: { "X-Trace": "example" } });
	// @ts-expect-error Cancellation is owned by the returned socket's close method.
	api.websocket("/1.0/events", { signal: new AbortController().signal });
	// @ts-expect-error HTTP response parsing is not a WebSocket option.
	api.websocket("/1.0/events", { parseAs: "json" });
	// @ts-expect-error HTTP request bodies are not a WebSocket option.
	api.websocket("/1.0/events", { body: "payload" });
	api.websocket("/1.0/events", {
		// @ts-expect-error Only URL parameters can be supplied.
		params: { header: { Authorization: "token" } },
	});
}
void typeContract;

function parsingContract(
	api: IncusApi,
	mode: "text" | undefined,
	options: ApiOptions<"/1.0", "GET", "text">,
) {
	const text: Promise<string> = api.request("GET", "/1.0", { parseAs: "text" });
	const json: Promise<ApiResult<"/1.0", "GET", "json">> = api.request(
		"GET",
		"/1.0",
		{ parseAs: undefined },
	);
	const maybeText = api.request("GET", "/1.0", { parseAs: mode });
	const optionalText = api.request("GET", "/1.0", options);
	const fallback: Promise<string | ApiResult<"/1.0", "GET", "json">>[] = [
		maybeText,
		optionalText,
	];
	// @ts-expect-error An omitted parse mode returns the default JSON result.
	const incorrectlyText: Promise<string> = maybeText;
	// @ts-expect-error An optional property can be absent even when its value type is text.
	const incorrectlyOptionalText: Promise<string> = optionalText;
	const head = api.request("HEAD", "/1.0/instances/{name}/files", {
		params: { path: { name: "web-1" }, query: { path: "/tmp/file" } },
		parseAs: mode,
	});
	const headFallback: Promise<string | Response> = head;
	// @ts-expect-error HEAD defaults to the raw Response when no parse mode is supplied.
	const incorrectlyHeadText: Promise<string> = head;
	void [text, json, fallback, incorrectlyText, incorrectlyOptionalText];
	void [headFallback, incorrectlyHeadText];
}
void parsingContract;
