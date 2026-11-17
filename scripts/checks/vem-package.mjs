// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const lock = JSON.parse(
	await readFile(join(root, "package-lock.json"), "utf8"),
);
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const packages = ["@hyecompany/vem-data", "@hyecompany/vem-ui"];
const candidates = [process.env.VEM_DATA_PACKAGE, process.env.VEM_UI_PACKAGE];
if (candidates.some(Boolean) && !candidates.every(Boolean))
	throw new Error(
		"Supply both VEM_DATA_PACKAGE and VEM_UI_PACKAGE candidate tarballs.",
	);
const dependencies = Object.fromEntries(
	packages.map((name, index) => {
		const candidate = candidates[index];
		if (candidate) {
			if (!candidate.endsWith(".tgz") || !existsSync(candidate))
				throw new Error(`Missing packed candidate for ${name}`);
			return [name, `file:${resolve(candidate).replaceAll("\\", "/")}`];
		}
		const dependency = lock.packages[`node_modules/${name}`];
		if (
			dependency?.version !== manifest.dependencies[name] ||
			!dependency?.resolved?.startsWith("https://registry.npmjs.org/")
		)
			throw new Error(
				`Pin the published ${name} version in the manifest and lockfile, or supply both packed candidates for release validation.`,
			);
		return [name, dependency.version];
	}),
);
const npm = [
	process.env.npm_execpath,
	join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
	resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
].find((candidate) => candidate && existsSync(candidate));
if (!npm)
	throw new Error("Run this check through npm so its CLI can be located");
const tempRoot = await realpath(tmpdir());
const directory = await mkdtemp(join(tempRoot, "incus-vem-consumer-"));
const versions = Object.fromEntries(
	["react", "react-dom", "@types/react", "@types/react-dom", "typescript"].map(
		(name) => {
			const version = lock.packages[`node_modules/${name}`]?.version;
			if (typeof version !== "string")
				throw new Error(`Missing locked consumer dependency ${name}`);
			return [name, version];
		},
	),
);

async function run(file, args) {
	await new Promise((done, fail) => {
		const child = spawn(file, args, {
			cwd: directory,
			stdio: "inherit",
			windowsHide: true,
			env: { ...process.env, NODE_PATH: "" },
		});
		child.once("error", fail);
		child.once("exit", (code) =>
			code === 0
				? done()
				: fail(new Error(`${basename(file)} exited with ${code}`)),
		);
	});
}

try {
	await writeFile(
		join(directory, "package.json"),
		JSON.stringify({
			name: "incus-vem-package-consumer",
			private: true,
			type: "module",
			dependencies: {
				...dependencies,
				react: versions.react,
				"react-dom": versions["react-dom"],
			},
			devDependencies: {
				"@types/react": versions["@types/react"],
				"@types/react-dom": versions["@types/react-dom"],
				typescript: versions.typescript,
			},
		}),
	);
	await run(process.execPath, [
		npm,
		"install",
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
	]);
	const installed = JSON.parse(
		await readFile(
			join(directory, "node_modules/@hyecompany/vem-data/package.json"),
			"utf8",
		),
	);
	const entries = Object.keys(installed.exports).map((key) =>
		key === "." ? installed.name : installed.name + key.slice(1),
	);
	for (const name of packages) {
		const artifact = JSON.parse(
			await readFile(
				join(directory, "node_modules", name, "package.json"),
				"utf8",
			),
		);
		if (artifact.version !== manifest.dependencies[name])
			throw new Error(
				`Unexpected ${name} candidate version ${artifact.version}`,
			);
	}
	entries.push(
		"@hyecompany/vem-ui",
		"@hyecompany/vem-ui/data",
		"@hyecompany/vem-ui/devtools",
	);
	await writeFile(
		join(directory, "imports.mjs"),
		`${entries.map((entry) => `await import(${JSON.stringify(entry)});`).join("\n")}\n`,
	);
	await run(process.execPath, ["imports.mjs"]);
	await writeFile(
		join(directory, "consumer.tsx"),
		`import { defineCommand, defineEdit, defineResource, matchesWhere, type DataClient, type ResourceFilter, type ResourceValues } from "@hyecompany/vem-data";
import { DataProvider, useCommand, useEdit, useQuery, useReadStatus } from "@hyecompany/vem-data/react";
import { createRuntime, persistenceSchemaVersion, type ResourceDefinition } from "@hyecompany/vem-data/runtime";
import { BrowserClient, protocolVersion, type Compatibility } from "@hyecompany/vem-data/client";
import { createSharedHost } from "@hyecompany/vem-data/worker";
import { createTestClient } from "@hyecompany/vem-data/testing";
import { Input } from "@hyecompany/vem-ui";
import { CommandButton, bindText, QueryStatus, ActivityFeedback } from "@hyecompany/vem-ui/data";

interface Item { name: string; description: string; state: "open" | "closed" }
const items = defineResource<Item, { name: string }, { workspace: string }>()({
 name: "items", fields: ["name", "description", "state"], defaultSelect: ["name"], defaultScope: { workspace: "main" },
 commands: { rename: defineCommand<{ name: string }, { kind: "succeeded"; value: { renamed: true } }>() },
 edits: { details: defineEdit<{ name: string }>() },
});
const selected = items.list();
const where: ResourceFilter<typeof items> = {
 state: "open",
 $or: [{ name: { contains: "task", case: "insensitive" } }, { description: { contains: "task" } }],
};
const searched = items.list({ select: ["name"], where });
export const itemQueries = { list: items.list, get: items.get };
const rename = items.commands.rename({ name: "one" }, { name: "new" });
const editor = items.edits.details({ name: "one" });
const example: ResourceValues<typeof items> = { name: "One", description: "A task", state: "open" };
const match: boolean | "unknown" = matchesWhere(example, where);
void [searched, match];
const fixture = createTestClient({ queries: [{ query: selected, rows: [{ identity: { name: "one" }, data: { name: "One" } }] }], commands: [{ command: rename, outcome: { kind: "succeeded", value: { renamed: true } } }], edits: [{ edit: editor, values: { name: "One" }, etag: "one" }] });
fixture.setQuery({ query: selected, status: "denied" });
fixture.setEditAccess(editor, { fields: { name: "unknown" }, write: "denied" });
function Screen() {
 const result = useQuery(selected);
 const cached = useQuery(selected, { acquire: false });
 const reads = useReadStatus(items.list({ select: ["description"] }));
 const pending: boolean = reads.pending;
 const retry: () => Promise<void> = reads.retry;
 void [cached, pending, retry];
 const action = useCommand(rename);
 const draft = useEdit(editor);
 const changeName = () => draft.set("name", "Edited");
 // @ts-expect-error Editable field values retain their model type.
 const invalidName = () => draft.set("name", 42);
 void [changeName, invalidName];
 const name: string | undefined = result.rows[0]?.data.name;
 const row = result.rows[0];
 if (row?.complete) {
  const completeName: string = row.data.name;
  // @ts-expect-error A complete selected row does not contain an unselected model field.
  row.data.description;
  void completeName;
 }
 // @ts-expect-error Query filters retain field value types.
 items.list({ where: { state: "invalid" } });
 // @ts-expect-error Text filters preserve their operator input type.
 items.list({ where: { description: { contains: 42 } } });
 // @ts-expect-error Named commands preserve their input shape.
 items.commands.rename({ name: "one" }, { name: 42 });
 // @ts-expect-error Undeclared fields cannot be read from the selected model.
 result.rows[0]?.data.secret;
 return <><QueryStatus result={result}/><Input aria-label="Name" {...bindText(draft.field("name"))}/><CommandButton command={rename}>Rename</CommandButton><ActivityFeedback query={selected}/></>;
}
async function inspectOutcome(client: DataClient) {
 const outcome = await client.run(rename).result;
 if (outcome.kind === "succeeded") { const renamed: true = outcome.value.renamed; void renamed; }
 if (outcome.kind === "failed") outcome.error.message;
 if (outcome.kind === "unknown") outcome.message;
}
export function Application({ client }: { client: DataClient }) { return <DataProvider client={client}><Screen /></DataProvider>; }
const definition: ResourceDefinition = { name: "items", access: "public" };
const runtime: DataClient = createRuntime({ resources: [definition] });
const compatibility: Compatibility = { protocol: protocolVersion, schema: persistenceSchemaVersion, definitions: 1, build: "smoke" };
void [BrowserClient, createSharedHost, compatibility, fixture, runtime, inspectOutcome];
`,
	);
	await writeFile(
		join(directory, "tsconfig.json"),
		JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "NodeNext",
				moduleResolution: "NodeNext",
				lib: ["ES2022", "DOM", "DOM.Iterable"],
				jsx: "react-jsx",
				strict: true,
				declaration: true,
				emitDeclarationOnly: true,
				outDir: "types",
				skipLibCheck: false,
				types: ["react"],
			},
			include: ["consumer.tsx"],
		}),
	);
	await run(process.execPath, [
		join(directory, "node_modules/typescript/bin/tsc"),
		"--project",
		"tsconfig.json",
	]);
	console.log(
		`Verified isolated imports and typed React consumption for ${packages.map((name) => `${name}@${manifest.dependencies[name]}`).join(" and ")} (${entries.length} entries)`,
	);
} finally {
	const target = await realpath(directory);
	if (
		dirname(target) !== tempRoot ||
		!basename(target).startsWith("incus-vem-consumer-")
	) {
		console.error(
			`Refusing to remove unexpected temporary directory ${target}`,
		);
		process.exitCode = 1;
	} else {
		await rm(target, { recursive: true, force: true, maxRetries: 3 });
	}
}
