// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { compatibility } from "virtual:incus-build";
import { connectSharedWorker } from "@hyecompany/vem-data/client";
import { incusReadDefinitions } from "../../shared/data/src/read-definitions.ts";

export const client = connectSharedWorker(
	new URL("vem-runtime.js", `${location.origin}/ui/`),
	compatibility,
	{ readDefinitions: incusReadDefinitions },
);

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) {
		client.close();
	}
});
