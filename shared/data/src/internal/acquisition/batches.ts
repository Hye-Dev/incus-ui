// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ObservationBatch } from "@hyecompany/vem-data/runtime";

export function mergeObservations(
	...batches: readonly (ObservationBatch | undefined)[]
): ObservationBatch {
	return {
		facts: batches.flatMap((batch) => batch?.facts ?? []),
		memberships: batches.flatMap((batch) => batch?.memberships ?? []),
		relationships: batches.flatMap((batch) => batch?.relationships ?? []),
		grants: batches.flatMap((batch) => batch?.grants ?? []),
		invalidate: batches.flatMap((batch) => batch?.invalidate ?? []),
		invalidateMemberships: batches.flatMap(
			(batch) => batch?.invalidateMemberships ?? [],
		),
	};
}
