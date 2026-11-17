// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { CommandDefinition } from "@hyecompany/vem-data/runtime";
import type { DomainOptions } from "../../runtime/services.ts";
export function createServerCommands(
	options: DomainOptions,
): Record<string, CommandDefinition> {
	return {
		refreshAccess: {
			execution: "control",
			access: "public",
			disclosure: "public",
			run: async () => {
				await options.refreshAccess();
				return { kind: "succeeded" };
			},
		},
		retireAccess: {
			execution: "control",
			access: "public",
			disclosure: "public",
			run: async () => {
				if (!options.retireAccess)
					return {
						kind: "failed",
						submitted: false,
						error: {
							code: "unsupported",
							message: "This runtime does not own access transitions.",
						},
					};
				options.retireAccess();
				return { kind: "succeeded" };
			},
		},
	};
}
