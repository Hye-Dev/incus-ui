// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import "./view.css";
import { Separator, SidebarTrigger } from "@hyecompany/vem-ui";
import { createContext, type ReactNode, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { ProjectSelector } from "../../shared/components/src/index.ts";
import { useProjectScope } from "../../shared/state/src/index.ts";

const HeaderContext = createContext<HTMLDivElement | null | undefined>(
	undefined,
);

export function View({ children }: { children: ReactNode }) {
	const [headerTarget, setHeaderTarget] = useState<HTMLDivElement | null>(null);
	const { scope, projectIncarnation, selectedProject, setScope } =
		useProjectScope();
	return (
		<HeaderContext.Provider value={headerTarget}>
			<header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b">
				<div className="flex min-w-0 w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
					<SidebarTrigger
						aria-label="Toggle navigation"
						className="-ml-1 shrink-0 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
					/>
					<Separator orientation="vertical" className="mx-2" />
					<div
						ref={setHeaderTarget}
						className="flex min-w-0 flex-1 items-center gap-2"
					/>
					<ProjectSelector
						scope={scope}
						projectIncarnation={projectIncarnation}
						selectedProject={selectedProject}
						onScopeChange={setScope}
						className="incus-app-project-selector"
						popupClassName="incus-app-project-selector-popup"
					/>
				</div>
			</header>
			<div className="min-w-0">{children}</div>
		</HeaderContext.Provider>
	);
}

/** Adds route-owned content to the nearest View; mounted headers compose. */
export function ViewHeader({ children }: { children: ReactNode }) {
	const target = useContext(HeaderContext);
	if (target === undefined)
		throw new Error("ViewHeader must be rendered within View");
	return target
		? createPortal(<div className="min-w-0">{children}</div>, target)
		: null;
}
