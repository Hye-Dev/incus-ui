// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineScenarios } from "@hyecompany/vem-data/devtools";
import { projectResource } from "./contract.ts";

export const projectScenarios = defineScenarios(projectResource, {
	example: {
		identity: {
			name: "default",
		},
		data: {
			name: "default",
			description: "Default project",
			used_by: ["/1.0/instances/web-1"],
		},
	},
});
