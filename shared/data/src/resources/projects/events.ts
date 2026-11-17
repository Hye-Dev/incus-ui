// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceDefinition } from "@hyecompany/vem-data/runtime";
import {
	basicLifecycle,
	readLifecycle,
} from "../../internal/events/lifecycle.ts";
import { changedFields } from "../../internal/identity/resource-identity.ts";
import { projectRoute } from "./representation.ts";
export const projectEvent: NonNullable<ResourceDefinition["event"]> = (
	input,
	context,
) => {
	const change = readLifecycle(projectRoute, input, context);
	if (!change) return;
	const common = basicLifecycle(change);
	if (common) return common;
	if (change.action === "project-updated")
		return {
			invalidate: changedFields("projects", change.parsed.identity, [
				"description",
				"used_by",
			]),
		};
};
