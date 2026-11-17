// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	Combobox,
	ComboboxContent,
	ComboboxInput,
	ComboboxTrigger,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	OverflowText,
	Spinner,
	useComboboxAnchor,
} from "@hyecompany/vem-ui";
import { IconAlertCircle, IconSearch, IconWorld } from "@tabler/icons-react";
import { type RefObject, useId, useRef, useState } from "react";
import type { ResourceScope } from "../../../data/src/index.ts";
import type { ProjectSelectionStatus } from "../../../state/src/index.ts";
import {
	type ProjectSelectorMessages,
	projectSelectionMessage,
	resolveProjectMessages,
} from "./project-messages.ts";
import { ProjectOptions } from "./project-options.tsx";
import { projectChoice, useProjectOptions } from "./use-project-options.ts";
import "./project-selector.css";

export interface ProjectSelectorProps {
	scope: ResourceScope;
	/** When known, preserve the selected identity across name reuse. */
	projectIncarnation?: string;
	selectedProject?: ProjectSelectionStatus;
	onScopeChange(scope: ResourceScope, incarnation?: string): void;
	className?: string;
	/** Styles the popup rendered outside the control's DOM ancestry. */
	popupClassName?: string;
	/** Keep the popup inside a modal dialog or scoped theme container. */
	popupContainer?:
		| HTMLElement
		| ShadowRoot
		| RefObject<HTMLElement | ShadowRoot | null>
		| null;
	/** Override component text; Base UI’s screen-reader dismissal controls remain in English. */
	messages?: Partial<ProjectSelectorMessages>;
	/** Controls name ordering; Incus search matching is unchanged. */
	locale?: string | string[];
	/** Offer aggregate scope alongside named projects. Does not grant access. */
	allowAllProjects?: boolean;
}

export function ProjectSelector({
	scope,
	projectIncarnation,
	selectedProject = { availability: "unknown" },
	onScopeChange,
	className,
	popupClassName,
	popupContainer,
	messages: suppliedMessages,
	locale,
	allowAllProjects = true,
}: ProjectSelectorProps) {
	const messages = resolveProjectMessages(suppliedMessages);
	const descriptionId = useId();
	const input = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const options = useProjectOptions(open, {
		scope,
		projectIncarnation,
		selectedProject,
		allowAllProjects,
		locale,
	});
	const { search, setSearch } = options;
	const anchor = useComboboxAnchor();
	const selected = scope.project;
	const value =
		options.options.find(
			(item) =>
				item.name === (selected ?? null) &&
				(projectIncarnation === undefined ||
					item.incarnation === projectIncarnation),
		) ?? projectChoice(selected, projectIncarnation);
	const warning =
		selectedProject.availability === "unavailable" || !!selectedProject.problem;
	return (
		<div
			className={`incus-project-selector ${className ?? ""}`}
			data-open={open || undefined}
			data-warning={warning || undefined}
		>
			<Combobox
				virtualized
				items={options.options}
				filteredItems={options.filtered}
				isItemEqualToValue={(item, value) => item.key === value.key}
				itemToStringLabel={(item) => item.name ?? messages.allProjects}
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setSearch("");
				}}
				inputValue={open ? search : (selected ?? messages.allProjects)}
				onInputValueChange={(value, details) => {
					if (
						details.reason === "input-change" ||
						details.reason === "input-clear"
					)
						setSearch(value);
				}}
				filter={null}
				autoHighlight={false}
				value={value}
				onValueChange={(item) => {
					if (item === null) return;
					onScopeChange(
						item.name === null
							? { allProjects: true, target: scope.target }
							: { project: item.name, target: scope.target },
						item.incarnation,
					);
				}}
			>
				<div data-vem-overflow-trigger="" className="project-selector-anchor">
					{/* Position against the stable edge while the search field expands. */}
					<div
						ref={anchor}
						aria-hidden="true"
						className="incus-project-selector-position"
					/>
					<ComboboxInput
						ref={input}
						aria-label={messages.label}
						aria-describedby={descriptionId}
						placeholder={messages.searchPlaceholder}
						showTrigger={false}
						render={
							<InputGroupInput className="incus-project-selector-input" />
						}
						onKeyDown={(event) => {
							if (
								open ||
								event.nativeEvent.isComposing ||
								event.ctrlKey ||
								event.metaKey ||
								event.altKey
							)
								return;
							if (
								event.key.length === 1 ||
								["Enter", "Backspace", "Delete"].includes(event.key)
							) {
								event.preventDefault();
								setSearch(event.key.length === 1 ? event.key.trimStart() : "");
								setOpen(true);
							}
						}}
						className="incus-project-selector-control"
					>
						<InputGroupAddon
							align="inline-start"
							onClick={() => {
								input.current?.focus();
								setOpen(true);
							}}
						>
							{open && (options.pending || options.reads.pending) ? (
								<Spinner size="sm" aria-label={messages.loading} />
							) : warning ? (
								<IconAlertCircle
									className="incus-project-selector-icon incus-project-selector-danger"
									aria-hidden="true"
								/>
							) : open ? (
								<IconSearch
									className="incus-project-selector-icon"
									aria-hidden="true"
								/>
							) : selected === undefined ? (
								<IconWorld
									className="incus-project-selector-icon"
									aria-hidden="true"
								/>
							) : null}
						</InputGroupAddon>
						<InputGroupAddon align="inline-end">
							<InputGroupButton
								size="icon-xs"
								variant="ghost"
								className="incus-project-selector-trigger"
								render={
									<ComboboxTrigger aria-label={messages.showSuggestions} />
								}
							/>
						</InputGroupAddon>
					</ComboboxInput>
					{!open && (
						<span
							aria-hidden="true"
							className="incus-project-selector-label"
							data-leading-icon={warning || selected === undefined || undefined}
						>
							<OverflowText
								text={selected ?? messages.allProjects}
								className="incus-project-selector-text"
							/>
						</span>
					)}
				</div>
				<span id={descriptionId} className="incus-project-selector-accessible">
					{selectedProject.problem && selected !== undefined
						? projectSelectionMessage(selectedProject, messages).replaceAll(
								"{project}",
								() => selected,
							)
						: (selected ?? messages.allProjects)}
				</span>
				<ComboboxContent
					anchor={anchor}
					align="end"
					aria-label={messages.popupLabel}
					container={popupContainer}
					className={`incus-project-selector-popup ${popupClassName ?? ""}`}
				>
					{open && <ProjectOptions model={options} messages={messages} />}
				</ComboboxContent>
			</Combobox>
		</div>
	);
}
