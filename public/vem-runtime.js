// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

const waiting = [];
let attach;
let failure;
self.onconnect = ({ ports }) => {
	for (const port of ports) {
		if (failure) port.postMessage({ type: "fatal", error: failure });
		else if (attach) attach(port);
		else waiting.push(port);
	}
};

try {
	const response = await fetch(new URL("./vem-runtime-manifest.json", import.meta.url), { cache: "no-store" });
	if (!response.ok) throw new Error(`Runtime manifest: HTTP ${response.status}`);
	const manifest = await response.json();
	const moduleUrl = new URL(manifest.module, self.location.origin);
	if (moduleUrl.origin !== self.location.origin) throw new Error("Runtime module must share the application origin");
	const runtime = await import(moduleUrl.href);
	attach = await runtime.startOwner(manifest);
	for (const port of waiting.splice(0)) attach(port);
} catch (error) {
	failure = error instanceof Error ? error.message : "Runtime could not start";
	for (const port of waiting.splice(0)) port.postMessage({ type: "fatal", error: failure });
}
