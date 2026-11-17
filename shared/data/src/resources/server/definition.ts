// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { IncusAcquisition } from "../../internal/acquisition/execute.ts";
import { createResourceDefinition } from "../../internal/acquisition/resource-definition.ts";
import type { DomainOptions } from "../../runtime/services.ts";
import { createServerSources } from "./acquisition.ts";
import { createServerCommands } from "./commands.ts";

import { readDefinition } from "./contract.ts";
import { representation } from "./representation.ts";

export function createServerDefinition(
	options: DomainOptions,
	acquisition: IncusAcquisition,
) {
	return createResourceDefinition({
		read: readDefinition,
		representation,
		acquisition,
		sources: createServerSources(options, acquisition),

		commands: createServerCommands(options),
	});
}
