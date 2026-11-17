// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";

export default defineConfig({
	oxc: { jsx: { runtime: "automatic" } },
	test: {
		environment: "jsdom",
		include: [
			"tests/react/**/*.test.{ts,tsx}",
			"shared/{state,components}/tests/**/*.test.{ts,tsx}",
		],
		setupFiles: ["tests/react/support/setup.ts"],
		clearMocks: true,
		restoreMocks: true,
	},
});
