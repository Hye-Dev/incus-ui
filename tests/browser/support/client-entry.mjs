// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { connectSharedWorker } from "@hyecompany/vem-data/client";
import * as resources from "../../../shared/data/src/index.ts";
import { incusReadDefinitions } from "../../../shared/data/src/read-definitions.ts";

export function connect(compatibility) {
	const client = connectSharedWorker(
		new URL("/ui/vem-runtime.js", location.origin),
		compatibility,
		{ readDefinitions: incusReadDefinitions },
	);
	window.addEventListener("pagehide", (event) => {
		if (!event.persisted) client.close();
	});
	return client;
}

export { resources };
