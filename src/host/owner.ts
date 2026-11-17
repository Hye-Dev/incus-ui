// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { DexiePersistence } from "@hyecompany/vem-data/runtime";
import {
	createSharedHost,
	type SharedHostOptions,
} from "@hyecompany/vem-data/worker";
import { createIncusRuntime } from "../../shared/data/src/runtime.ts";

export async function startOwner(
	compatibility: SharedHostOptions["compatibility"],
) {
	return createSharedHost({
		compatibility,
		lockName: "vem-data:incus:owner",
		locks: navigator.locks,
		async create() {
			const persistence = new DexiePersistence(
				`incus-ui:vem-data:${location.origin}:v1`,
			);
			const owner = await createIncusRuntime({
				baseUrl: location.origin,
				persistence,
			});
			return {
				client: owner.runtime,
				dispose: () => {
					owner.dispose();
				},
			};
		},
		onClosed: () => globalThis.close(),
	});
}
