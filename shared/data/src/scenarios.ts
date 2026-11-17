// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { projectScenarios } from "./resources/projects/scenarios.ts";
import { serverScenarios } from "./resources/server/scenarios.ts";
export const incusScenarios = [projectScenarios, serverScenarios] as const;
