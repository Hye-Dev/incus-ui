// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { matchesWhere } from "@hyecompany/vem-data";
import { useReadStatus } from "@hyecompany/vem-data/react";
import { useSearch } from "@hyecompany/vem-ui/data";
import { projects, type ResourceScope } from "../../../data/src/index.ts";
import type { ProjectSelectionStatus } from "../../../state/src/index.ts";

export type ProjectOption = {
	key: string;
	name: string | null;
	incarnation?: string;
	disabled?: boolean;
	/** A retained selection label does not establish collection membership. */
	listed: boolean;
};

export const projectChoice = (
	name?: string | null,
	incarnation?: string,
): ProjectOption => ({
	key: JSON.stringify([name ?? null, incarnation ?? null]),
	name: name ?? null,
	incarnation,
	listed: false,
});

const comparison = { case: "insensitive", accents: "sensitive" } as const;

const searchProjects = (text: string) =>
	projects.list({
		select: ["name"],
		where: text
			? {
					$or: [
						{ name: { contains: text, ...comparison } },
						{ description: { contains: text, ...comparison } },
					],
				}
			: undefined,
	});

export function useProjectOptions(
	open: boolean,
	selection: {
		scope: ResourceScope;
		projectIncarnation?: string;
		selectedProject: ProjectSelectionStatus;
		allowAllProjects: boolean;
		locale?: string | string[];
	},
) {
	const search = useSearch(searchProjects, { enabled: open });
	const { result } = search;
	const nameFilter = { name: { contains: search.value, ...comparison } };
	const nameMatches = (item: ProjectOption) =>
		matchesWhere({ name: item.name }, nameFilter) === true;
	const { scope, projectIncarnation, selectedProject } = selection;
	const reads = useReadStatus(
		projects.list({ select: ["name", "description"] }),
		{ enabled: open },
	);
	const denied = result.issues.some((issue) => issue.kind === "access");
	const options: ProjectOption[] = (denied ? [] : result.rows).flatMap((row) =>
		row.identity.kind === "resource" && row.data.name
			? [
					{
						...projectChoice(row.data.name, row.identity.incarnation),
						listed: true,
					},
				]
			: [],
	);
	const matchingNames = new Set(
		search.value ? options.filter(nameMatches) : options,
	);
	options.sort(
		(a, b) =>
			Number(matchingNames.has(b)) - Number(matchingNames.has(a)) ||
			(a.name ?? "").localeCompare(b.name ?? "", selection.locale),
	);
	const selected = scope.project;
	if (
		selected !== undefined &&
		!options.some((item) => item.name === selected)
	) {
		options.unshift({
			...projectChoice(selected, projectIncarnation),
			disabled: selectedProject.availability === "unavailable",
		});
	}
	if (selection.allowAllProjects && (!denied || selected === undefined))
		options.unshift(projectChoice());
	const filtered = options.filter(
		(item) =>
			item.name === null ||
			denied ||
			item.listed ||
			!search.value ||
			nameMatches(item),
	);
	const issue = result.issues.find((issue) => issue.kind !== "access");
	const pending = open && !denied && (result.fetching || !result.settled);
	const failed = !denied && !!issue && issue.kind !== "incomplete";
	const incomplete =
		!denied && !pending && !failed && !result.confirmed.complete;
	return {
		search: search.value,
		setSearch: search.setValue,
		scope,
		selectedProject,
		reads,
		options,
		filtered,
		denied,
		pending,
		failed,
		incomplete,
		detailsUnavailable: reads.issues.some((issue) => issue.kind !== "access"),
		noMatches:
			!denied &&
			!pending &&
			!failed &&
			!incomplete &&
			!!search.value &&
			filtered.every((item) => item.name === null),
	};
}

export type ProjectOptionsModel = ReturnType<typeof useProjectOptions>;
