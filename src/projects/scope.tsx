// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react";
import { ProjectScopeProvider } from "../../shared/state/src/index.ts";
import { rememberProjectScope, restoreProjectScope } from "./selection.ts";

export function ProjectScope({ children }: { children: ReactNode }) {
	const [initialScope] = useState(restoreProjectScope);
	return (
		<ProjectScopeProvider
			initialScope={initialScope}
			onScopeChange={rememberProjectScope}
		>
			{children}
		</ProjectScopeProvider>
	);
}
