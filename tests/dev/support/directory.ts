// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

export function directory(t: TestContext): string {
	const path = mkdtempSync(join(tmpdir(), "incus-proxy-contract-"));
	t.after(() => rmSync(path, { recursive: true, force: true }));
	return path;
}
