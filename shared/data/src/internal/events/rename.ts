// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { Values } from "@hyecompany/vem-data/runtime";
import type { IncusLifecycleEvent } from "../../runtime/event-types.ts";
import type { ResourceRoute } from "../identity/api-paths.ts";

/** Interpret identity only; callers retain responsibility for disclosure and publication. */
export function renamedIdentity(
	route: ResourceRoute,
	event: IncusLifecycleEvent,
	identity: Values,
): Values | undefined {
	if (!event.metadata.action.endsWith("-renamed") || !route.identityField)
		return;
	const oldName = event.metadata.context?.old_name;
	if (typeof oldName !== "string") return;
	const value = oldName.split("/").at(-1);
	if (!value || value === "." || value === "..") return;
	return { ...identity, [route.identityField]: value };
}
