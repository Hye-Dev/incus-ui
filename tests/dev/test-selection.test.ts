// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { changedPaths, selectSuites } from "../../scripts/checks/affected.ts";

test("affected selection stays broad for shared sources and unknown inputs", () => {
	assert.deepEqual(
		selectSuites([
			"docs/contributing/code/development-environment.md",
			"shared/data/README.md",
			"tests/README.md",
		]),
		[],
	);
	assert.deepEqual(
		selectSuites(["tests/dev/config.test.ts"]).map(({ suite }) => suite),
		["checks", "unit"],
	);
	for (const path of [
		"src/layout/view.tsx",
		"shared/data/src/resources/projects/definition.ts",
		"shared/state/src/project-scope.tsx",
		"shared/components/src/projects/project-options.tsx",
	])
		assert.deepEqual(
			selectSuites([path]).map(({ suite }) => suite),
			["checks", "unit", "react", "architecture", "artifacts", "browser"],
		);
	for (const paths of [
		undefined,
		["package-lock.json"],
		["unknown-new-input"],
		[".github/workflows/tests.yml"],
	])
		assert.equal(selectSuites(paths).length, 9);
	for (const path of [
		"tests/react/view.test.tsx",
		"shared/state/tests/project-scope.test.tsx",
		"shared/components/tests/control.test.tsx",
	])
		assert.deepEqual(
			selectSuites([path]).map(({ suite }) => suite),
			["checks", "react"],
		);
	assert.deepEqual(
		selectSuites(["shared/components/tests/browser/projects.test.mjs"]).map(
			({ suite }) => suite,
		),
		["checks", "component-browser"],
	);
	assert.deepEqual(
		selectSuites(["tests/browser/projects/selection.test.mjs"]).map(
			({ suite }) => suite,
		),
		["checks", "artifacts", "browser"],
	);
	assert.deepEqual(
		selectSuites(["tests/architecture/imports.test.mjs"]).map(
			({ suite }) => suite,
		),
		["checks", "architecture"],
	);
	assert.deepEqual(
		selectSuites(["tests/artifacts/production.test.mjs"]).map(
			({ suite }) => suite,
		),
		["checks", "artifacts"],
	);
	assert.deepEqual(
		selectSuites([
			"shared/components/tests/browser/projects.test.mjs",
			"tests/browser/projects/selection.test.mjs",
		]).map(({ suite }) => suite),
		["checks", "artifacts", "browser"],
	);
	assert.deepEqual(selectSuites([]), []);
});

test("Git selection includes committed, staged, unstaged, deleted, and untracked paths", async () => {
	const root = await mkdtemp(join(tmpdir(), "incus-affected-"));
	const git = (...args: string[]) =>
		execFileSync("git", args, { cwd: root, stdio: "pipe", windowsHide: true });
	try {
		git("init", "-q");
		git("config", "user.name", "Test Fixture");
		git("config", "user.email", "fixture@example.invalid");
		git("config", "commit.gpgsign", "false");
		for (const name of ["staged", "unstaged", "deleted", "index-only"])
			await writeFile(join(root, name), "before");
		git("add", ".");
		git("commit", "-qm", "fixture");
		git("branch", "baseline");
		await writeFile(join(root, "committed"), "new");
		git("add", ".");
		git("commit", "-qm", "fixture change");
		await writeFile(join(root, "staged"), "after");
		git("add", "staged");
		await writeFile(join(root, "unstaged"), "after");
		await writeFile(join(root, "index-only"), "staged change");
		git("add", "index-only");
		await writeFile(join(root, "index-only"), "before");
		await writeFile(join(root, "untracked"), "new");
		await rm(join(root, "deleted"));
		assert.deepEqual(changedPaths("baseline", root).sort(), [
			"committed",
			"deleted",
			"index-only",
			"staged",
			"unstaged",
			"untracked",
		]);
		assert.throws(() => changedPaths("missing-ref", root));
	} finally {
		assert.equal(dirname(root), resolve(tmpdir()));
		assert.ok(basename(root).startsWith("incus-affected-"));
		await rm(root, { recursive: true, force: true });
	}
});
