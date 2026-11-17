// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineScenarios } from "@hyecompany/vem-data/devtools";
import { serverResource } from "./contract.ts";

export const serverScenarios = defineScenarios(serverResource, {
	example: {
		identity: {},
		data: {
			auth: "trusted",
			auth_user_name: "example-user",
			auth_user_method: "tls",
		},
	},
	fields: {
		auth: { choices: ["trusted", "untrusted"] },
	},
	commands: {
		refreshAccess: {
			availability: {
				state: "unsupported",
				reason:
					"Isolated scenarios do not establish server permissions; use the query and field access controls",
			},
		},
		retireAccess: {
			availability: {
				state: "unsupported",
				reason:
					"Isolated scenarios do not retire real authorities; use the query and field access controls",
			},
		},
	},
});
