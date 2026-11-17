// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { after } from "node:test";
import { chromium, firefox, webkit } from "@playwright/test";

let instance;
after(async () => {
	await (await instance)?.close();
});

export function browserOptions() {
	const engine = process.env.PLAYWRIGHT_BROWSER || "chromium";
	const browserType = { chromium, firefox, webkit }[engine];
	if (!browserType) throw new Error(`Unknown browser engine: ${engine}`);
	return {
		browserType,
		options: {
			channel:
				engine === "chromium"
					? process.env.PLAYWRIGHT_CHANNEL || "chromium"
					: undefined,
			headless: true,
		},
	};
}

export function browser() {
	const { browserType, options } = browserOptions();
	instance ??= browserType.launch(options);
	return instance;
}
