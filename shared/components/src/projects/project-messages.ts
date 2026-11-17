// SPDX-FileCopyrightText: 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { ProjectSelectionStatus } from "../../../state/src/index.ts";

/** Override individual labels; selection messages use {project} for the project name. */
export interface ProjectSelectorMessages {
	label: string;
	popupLabel: string;
	listLabel: string;
	showSuggestions: string;
	searchPlaceholder: string;
	allProjects: string;
	loading: string;
	loadFailed: string;
	listIncomplete: string;
	detailsUnavailable: string;
	retry: string;
	retryLabel: string;
	noMatches: string;
	loadingDescription: string;
	updatingDescription: string;
	selectionUnavailable: string;
	selectionDenied: string;
	selectionUnverified: string;
}

export const defaultMessages: ProjectSelectorMessages = {
	label: "Project",
	popupLabel: "Choose project",
	listLabel: "Projects",
	showSuggestions: "Show suggestions",
	searchPlaceholder: "Search projects…",
	allProjects: "All projects",
	loading: "Loading projects",
	loadFailed: "Could not load projects",
	listIncomplete: "Project list incomplete",
	detailsUnavailable: "Some details unavailable",
	retry: "Retry",
	retryLabel: "Retry loading projects",
	noMatches: "No projects match your search.",
	loadingDescription: "Loading description.",
	updatingDescription: "Updating description.",
	selectionUnavailable: "{project} is no longer available.",
	selectionDenied: "{project} is not accessible with your current permissions.",
	selectionUnverified:
		"{project} could not be verified. Select it again to continue.",
};

export function resolveProjectMessages(
	overrides: Partial<ProjectSelectorMessages> = {},
): ProjectSelectorMessages {
	const messages = { ...defaultMessages };
	for (const key of Object.keys(messages) as (keyof ProjectSelectorMessages)[])
		messages[key] = overrides[key] ?? messages[key];
	return messages;
}

export function projectSelectionMessage(
	status: ProjectSelectionStatus,
	messages: ProjectSelectorMessages,
) {
	switch (status.problem?.kind) {
		case "unavailable":
			return messages.selectionUnavailable;
		case "access":
			return messages.selectionDenied;
		case "identity":
			return messages.selectionUnverified;
		default:
			return "";
	}
}
