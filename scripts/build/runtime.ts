// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { protocolVersion } from "@hyecompany/vem-data/client";
import { persistenceSchemaVersion } from "@hyecompany/vem-data/runtime";
import type { Plugin, ViteDevServer } from "vite";

const moduleId = "virtual:incus-build";
const resolvedId = `\0${moduleId}`;

function sourceIdentity(root: string): { build: string; definitions: number } {
	const build = createHash("sha256");
	const definitions = createHash("sha256");
	const include = (file: string, shared = false) => {
		const source = readFileSync(resolve(root, file));
		for (const digest of shared ? [build, definitions] : [build])
			digest.update(file).update("\0").update(source).update("\0");
	};
	for (const directory of [
		"src",
		"shared/data/src",
		"shared/state/src",
		"shared/components/src",
		"node_modules/@hyecompany/vem-data/dist",
	])
		for (const file of readdirSync(resolve(root, directory), {
			recursive: true,
		})
			.map((file) => String(file).replaceAll("\\", "/"))
			.sort()) {
			if (/\.(?:js|ts|tsx)$/.test(file))
				include(
					`${directory}/${file}`,
					directory === "shared/data/src" ||
						directory.startsWith("node_modules/"),
				);
		}
	for (const file of ["package-lock.json", "public/vem-runtime.js"])
		include(file);
	return {
		build: build.digest("hex").slice(0, 16),
		definitions: Number.parseInt(definitions.digest("hex").slice(0, 13), 16),
	};
}

export function runtimeManifest(): Plugin {
	let root = process.cwd();
	let entry: string;
	let production = false;
	let builtIdentity: ReturnType<typeof sourceIdentity>;
	const compatibility = () => {
		const identity = production ? builtIdentity : sourceIdentity(root);
		return {
			build: production ? identity.build : `dev-${identity.build}`,
			protocol: protocolVersion,
			schema: persistenceSchemaVersion,
			definitions: identity.definitions,
		};
	};
	const manifest = (module: string) => ({ module, ...compatibility() });
	const invalidate = (server: ViteDevServer) => {
		const module = server.moduleGraph.getModuleById(resolvedId);
		if (module) server.moduleGraph.invalidateModule(module);
	};
	return {
		name: "incus-runtime-manifest",
		configResolved(config) {
			root = config.root;
			production = config.command === "build";
			builtIdentity = sourceIdentity(root);
		},
		resolveId(id) {
			if (id === moduleId) return resolvedId;
		},
		load(id) {
			if (id === resolvedId)
				return `export const compatibility = ${JSON.stringify(compatibility())}; export const build = compatibility.build;`;
		},
		configureServer(server) {
			server.watcher.on("all", (_event, file) => {
				const path = relative(root, file).replaceAll("\\", "/");
				if (
					path.startsWith("src/") ||
					path.startsWith("shared/") ||
					path === "package-lock.json" ||
					path === "public/vem-runtime.js"
				)
					invalidate(server);
			});
			server.middlewares.use((request, response, next) => {
				// A document reload also detects installed-package changes excluded by Vite's watcher.
				if (request.headers.accept?.includes("text/html")) invalidate(server);
				if (request.url?.split("?")[0] !== "/ui/vem-runtime-manifest.json")
					return next();
				response.setHeader("Content-Type", "application/json");
				response.setHeader("Cache-Control", "no-store");
				response.end(JSON.stringify(manifest("/ui/src/host/owner.ts")));
			});
		},
		buildStart() {
			if (!production) return;
			entry = this.emitFile({
				type: "chunk",
				id: resolve(root, "src/host/owner.ts"),
				name: "incus-runtime",
				preserveSignature: "strict",
			});
		},
		generateBundle() {
			this.emitFile({
				type: "asset",
				fileName: "vem-runtime-manifest.json",
				source: JSON.stringify(manifest(`/ui/${this.getFileName(entry)}`)),
			});
		},
	};
}
