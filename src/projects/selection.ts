// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ResourceScope } from "../../shared/data/src/index.ts";

const storageKey = "incus-ui:project-scope:v1";

export function restoreProjectScope(): ResourceScope {
	try {
		const saved = sessionStorage.getItem(storageKey);
		const scope: unknown = saved ? JSON.parse(saved) : undefined;
		if (!scope || typeof scope !== "object") return { allProjects: true };
		const target = "target" in scope ? scope.target : undefined;
		if (
			target !== undefined &&
			(typeof target !== "string" || target.length === 0)
		)
			return { allProjects: true };
		if (
			"project" in scope &&
			typeof scope.project === "string" &&
			scope.project.length > 0 &&
			!("allProjects" in scope)
		)
			return { project: scope.project, target };
		if (
			"allProjects" in scope &&
			scope.allProjects === true &&
			!("project" in scope)
		)
			return { allProjects: true, target };
	} catch {
		// A blocked storage API or invalid preference must not prevent project selection.
	}
	return { allProjects: true };
}

export function rememberProjectScope(scope: ResourceScope): void {
	try {
		if (scope.allProjects && scope.target === undefined) {
			sessionStorage.removeItem(storageKey);
			return;
		}
		// Remember user intent only; access evidence and identity incarnations belong to the owner.
		sessionStorage.setItem(
			storageKey,
			JSON.stringify(
				scope.allProjects
					? { allProjects: true, target: scope.target }
					: { project: scope.project, target: scope.target },
			),
		);
	} catch {
		// Selection still works in memory when storage is unavailable.
	}
}
