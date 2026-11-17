// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceReadDefinition } from "@hyecompany/vem-data/client";
import type { ResourceDefinition } from "@hyecompany/vem-data/runtime";
import { server } from "../../resources/server/contract.ts";
import { readAccess, requiresAccess } from "./read-definition.ts";

export function callerPrerequisites(
	read: ResourceReadDefinition,
	prerequisites: ResourceDefinition["readPrerequisites"],
): ResourceDefinition["readPrerequisites"] {
	return (query, context) =>
		context.access("authenticated") === "unknown" &&
		requiresAccess(readAccess(read, query), "authenticated")
			? [server.current({ select: ["auth"] })]
			: (prerequisites?.(query, context) ?? []);
}
