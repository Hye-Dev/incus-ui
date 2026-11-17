// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

test("application and shared layers use public entries and respect dependency direction", async () => {
	const hostFiles = new Set([
		"src/main.tsx",
		"src/host/client.ts",
		"src/host/owner.ts",
		"src/host/application-client.ts",
		"src/layout/connection-status.tsx",
	]);
	const allowedLayers = {
		data: new Set(["data"]),
		state: new Set(["data", "state"]),
		components: new Set(["data", "state", "components"]),
	};
	const hostDataEntries = new Set([
		"index",
		"read-definitions",
		"runtime",
		"definition-authoring",
		"transport",
	]);
	const files = (
		await Promise.all(
			["src", "shared"].map(async (root) =>
				(
					await readdir(root, { recursive: true })
				).map((file) => `${root}/${file.replaceAll("\\", "/")}`),
			),
		)
	).flat();
	for (const path of files) {
		if (!/\.tsx?$/.test(path) || path.endsWith(".d.ts")) continue;
		const layer = /^shared\/(data|state|components)\/src\//.exec(path)?.[1];
		if (!path.startsWith("src/") && !layer) continue;
		const host = hostFiles.has(path) || path.startsWith("src/development/");
		const source = ts.createSourceFile(
			path,
			await readFile(path, "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		const inspect = (specifier) => {
			const message = `${path}: ${specifier}`;
			const local = specifier.startsWith("@/")
				? `src/${specifier.slice(2)}`
				: specifier.startsWith(".")
					? relative(process.cwd(), resolve(path, "..", specifier)).replaceAll(
							"\\",
							"/",
						)
					: specifier;
			const importedLayer = /^shared\/(data|state|components)\//.exec(
				local,
			)?.[1];
			if (layer) {
				assert.doesNotMatch(local, /^src\//, message);
				if (importedLayer)
					assert.ok(allowedLayers[layer].has(importedLayer), message);
				if (layer === "state")
					assert.doesNotMatch(
						specifier,
						/^(?:react-dom(?:\/|$)|@hyecompany\/vem-ui(?:\/|$)|@tabler\/icons-react(?:\/|$)|@tanstack\/react-router(?:\/|$))/,
						message,
					);
				if (layer === "data")
					assert.doesNotMatch(
						specifier,
						/^(?:react(?:-dom)?(?:\/|$)|@hyecompany\/vem-ui(?:\/|$)|@hyecompany\/vem-data\/react(?:\/|$))/,
						message,
					);
			}
			if (importedLayer && importedLayer !== layer) {
				const root = `shared/${importedLayer}/src`;
				const target = local.replace(/\.(?:tsx?|jsx?)$/, "");
				const entry = target === root ? "index" : target.slice(root.length + 1);
				assert.ok(
					(target === root || target.startsWith(`${root}/`)) &&
						(host && importedLayer === "data"
							? hostDataEntries.has(entry) ||
								(entry === "scenarios" && path.startsWith("src/development/"))
							: entry === "index"),
					`${message} must use a public shared entry`,
				);
			}
			if (host || layer === "data") return;
			assert.doesNotMatch(
				specifier,
				/^@hyecompany\/vem-data\/(runtime|worker|testing|devtools|client)(\/|$)/,
				message,
			);
			assert.doesNotMatch(
				specifier,
				/^@hyecompany\/vem-ui\/devtools(?:\/|$)/,
				message,
			);
			assert.notEqual(specifier, "virtual:incus-client", message);
			const shellDevtools =
				path === "src/routes/__root.tsx" &&
				local.replace(/\.(?:tsx?|jsx?)$/, "") === "src/development/devtools";
			if (!shellDevtools)
				assert.doesNotMatch(local, /^src\/(host|development)\//, message);
		};
		const visit = (node) => {
			if (
				(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			)
				inspect(node.moduleSpecifier.text);
			if (
				ts.isCallExpression(node) &&
				(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
					(ts.isIdentifier(node.expression) &&
						node.expression.text === "require")) &&
				node.arguments[0] &&
				ts.isStringLiteral(node.arguments[0])
			)
				inspect(node.arguments[0].text);
			if (
				ts.isImportTypeNode(node) &&
				ts.isLiteralTypeNode(node.argument) &&
				ts.isStringLiteral(node.argument.literal)
			)
				inspect(node.argument.literal.text);
			ts.forEachChild(node, visit);
		};
		visit(source);
	}
});

test("Incus descriptions and page read definitions do not import owner, transport or scenario implementation", async () => {
	const seen = new Set();
	const visit = async (path) => {
		if (seen.has(path)) return;
		seen.add(path);
		const source = ts.createSourceFile(
			path,
			await readFile(path, "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		for (const statement of source.statements) {
			if (
				(!ts.isImportDeclaration(statement) &&
					!ts.isExportDeclaration(statement)) ||
				!statement.moduleSpecifier ||
				!ts.isStringLiteral(statement.moduleSpecifier)
			)
				continue;
			if (ts.isImportDeclaration(statement)) {
				if (statement.importClause?.isTypeOnly) continue;
				const bindings = statement.importClause?.namedBindings;
				if (
					!statement.importClause?.name &&
					bindings &&
					ts.isNamedImports(bindings) &&
					bindings.elements.every((element) => element.isTypeOnly)
				)
					continue;
			} else {
				if (statement.isTypeOnly) continue;
				if (
					statement.exportClause &&
					ts.isNamedExports(statement.exportClause) &&
					statement.exportClause.elements.every((element) => element.isTypeOnly)
				)
					continue;
			}
			const specifier = statement.moduleSpecifier.text;
			assert.doesNotMatch(
				specifier,
				/^@hyecompany\/vem-data\//,
				`${path}: ${specifier}`,
			);
			if (!specifier.startsWith(".")) continue;
			const target = resolve(path, "..", specifier);
			const local = relative(process.cwd(), target).replaceAll("\\", "/");
			assert.doesNotMatch(
				local,
				/\/(runtime|transport)\//,
				`${path}: ${specifier}`,
			);
			assert.doesNotMatch(
				local,
				/\/(scenarios|testing)\.ts$/,
				`${path}: ${specifier}`,
			);
			assert.doesNotMatch(
				local,
				/\/internal\/(acquisition|events)\//,
				`${path}: ${specifier}`,
			);
			await visit(target);
		}
	};
	await visit(resolve("shared/data/src/index.ts"));
	await visit(resolve("shared/data/src/read-definitions.ts"));
});
