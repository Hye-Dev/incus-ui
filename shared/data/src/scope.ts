// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

export type ProjectScope = {
	project: string;
	allProjects?: never;
	target?: string;
};
export type AllProjectsScope = {
	/** Aggregate permitted resources across projects; this scope grants no additional access. */
	allProjects: true;
	project?: never;
	target?: string;
};
export type ResourceScope = ProjectScope | AllProjectsScope;
export function projectOf(
	scope: ResourceScope | undefined,
): string | undefined {
	return scope && "project" in scope ? scope.project : undefined;
}
