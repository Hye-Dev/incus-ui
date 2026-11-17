// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const suites = [
	"checks",
	"schema",
	"unit",
	"react",
	"architecture",
	"artifacts",
	"browser",
	"component-browser",
	"package",
	"workflows",
] as const;
type Suite = (typeof suites)[number];
const application: Suite[] = [
	"checks",
	"unit",
	"react",
	"architecture",
	"artifacts",
	"browser",
];

export function selectSuites(paths: string[] | undefined) {
	const selected = new Map<Suite, Set<string>>();
	const add = (groups: readonly Suite[], reason: string) => {
		for (const group of groups) {
			if (!selected.has(group)) selected.set(group, new Set());
			selected.get(group)?.add(reason);
		}
	};
	if (!paths) add(suites, "Git comparison unavailable; checking all suites");
	for (const path of paths ?? []) {
		if (
			/^(docs\/|CONTRIBUTING\.md$)/.test(path) ||
			/(^|\/)README\.md$/.test(path)
		)
			continue;
		if (path.startsWith("shared/components/tests/browser/"))
			add(
				["checks", "component-browser"],
				"Shared component browser tests changed",
			);
		else if (/^(tests\/react\/|shared\/(state|components)\/tests\/)/.test(path))
			add(["checks", "react"], "React tests or fixtures changed");
		else if (/^(src\/|shared\/(data\/src|state|components)\/)/.test(path))
			add(application, "Application or shared source changed");
		else if (/^(shared\/data\/tests\/|tests\/dev\/)/.test(path))
			add(["checks", "unit"], "Domain or development tests changed");
		else if (path.startsWith("tests/browser/"))
			add(
				["checks", "artifacts", "browser"],
				"Browser tests or fixtures changed",
			);
		else if (path.startsWith("tests/architecture/"))
			add(["checks", "architecture"], "Architecture checks changed");
		else if (path.startsWith("tests/artifacts/"))
			add(["checks", "artifacts"], "Production artifact checks changed");
		else if (path.startsWith("scripts/api/"))
			add([...application, "schema"], "Schema or generator changed");
		else if (path.startsWith("scripts/dev/"))
			add(application, "Development proxy changed");
		else if (path === "scripts/checks/vem-package.mjs")
			add(["checks", "package"], "Independent consumer validation changed");
		else if (/^(LICENSE|REUSE\.toml$)/.test(path))
			add(["artifacts", "workflows"], "Licensing metadata or notices changed");
		else if (path.startsWith("tests/github/"))
			add(["workflows"], "Workflow tests changed");
		else add(suites, `Unmapped or shared configuration changed: ${path}`);
	}
	if (selected.has("browser")) selected.delete("component-browser");
	return suites
		.filter((suite) => selected.has(suite))
		.map((suite) => ({ suite, reasons: [...(selected.get(suite) ?? [])] }));
}

export function changedPaths(base: string, root: string) {
	if (!base || base.startsWith("-"))
		throw new Error("Supply a Git ref as --base");
	const git = (args: string[]) =>
		execFileSync("git", args, {
			cwd: root,
			encoding: "utf8",
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
	const ancestor = git(["merge-base", "HEAD", base]).trim();
	return [
		...new Set(
			[
				...git([
					"diff",
					"--name-only",
					"--no-renames",
					"-z",
					ancestor,
					"--",
				]).split("\0"),
				...git([
					"diff",
					"--cached",
					"--name-only",
					"--no-renames",
					"-z",
					"--",
				]).split("\0"),
				...git(["ls-files", "--others", "--exclude-standard", "-z"]).split(
					"\0",
				),
			].filter(Boolean),
		),
	];
}

async function main() {
	let base = "origin/main";
	let dryRun = false;
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--dry-run") dryRun = true;
		else if (args[i] === "--base" && args[i + 1]) base = args[++i];
		else throw new Error(`Unknown option: ${args[i]}`);
	}
	const root = resolve(import.meta.dirname, "../..");
	let paths: string[] | undefined;
	try {
		paths = changedPaths(base, root);
	} catch {
		console.log(`Cannot compare with ${base}; selecting every suite.`);
	}
	const selection = selectSuites(paths);
	if (!selection.length) {
		console.log("No runtime tests implicated by these changes.");
		return;
	}
	for (const { suite, reasons } of selection)
		console.log(`${suite}: ${reasons.join("; ")}`);
	if (dryRun) return;
	const npm = [
		process.env.npm_execpath,
		join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
		resolve(
			dirname(process.execPath),
			"../lib/node_modules/npm/bin/npm-cli.js",
		),
	].find((path) => path && existsSync(path));
	if (!npm) throw new Error("Run through npm so its CLI can be located.");
	const run = (file: string, args: string[]) => {
		const result = spawnSync(file, args, {
			cwd: root,
			stdio: "inherit",
			windowsHide: true,
		});
		if (result.error) throw result.error;
		if (result.status !== 0) process.exit(result.status ?? 1);
	};
	const script = (name: string) => run(process.execPath, [npm, "run", name]);
	for (const { suite } of selection) {
		switch (suite) {
			case "checks":
				script("check");
				script("typecheck");
				break;
			case "schema":
				run(process.execPath, ["scripts/api/generate.mjs", "--check"]);
				break;
			case "unit":
				script("test:incus");
				script("test:dev");
				break;
			case "react":
				script("test:react");
				break;
			case "architecture":
				script("test:architecture");
				break;
			case "artifacts":
				script("build");
				script("test:artifacts");
				break;
			case "browser":
				script("test:browser");
				break;
			case "component-browser":
				script("test:components:browser");
				break;
			case "package":
				script("test:vem-package");
				break;
			case "workflows":
				run(process.execPath, ["--test", "tests/github/*.test.cjs"]);
				run(process.platform === "win32" ? "python" : "python3", [
					"-B",
					"-m",
					"unittest",
					"discover",
					"-s",
					"tests/github",
				]);
				break;
		}
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
	await main();
