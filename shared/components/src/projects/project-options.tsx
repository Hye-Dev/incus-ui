// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@hyecompany/vem-data/react";
import {
	Button,
	ComboboxItem,
	ComboboxVirtualList,
	OverflowText,
} from "@hyecompany/vem-ui";
import {
	IconAlertCircle,
	IconAlertTriangle,
	IconRefresh,
	IconWorld,
} from "@tabler/icons-react";
import { projects } from "../../../data/src/index.ts";
import {
	type ProjectSelectorMessages,
	projectSelectionMessage,
} from "./project-messages.ts";
import type {
	ProjectOption,
	ProjectOptionsModel,
} from "./use-project-options.ts";

export function ProjectOptions({
	model,
	messages,
}: {
	model: ProjectOptionsModel;
	messages: ProjectSelectorMessages;
}) {
	const { scope, selectedProject } = model;
	const [messageBefore, ...messageAfter] = projectSelectionMessage(
		selectedProject,
		messages,
	).split("{project}");
	const warning =
		!model.denied && (model.incomplete || model.detailsUnavailable);
	return (
		<>
			{scope.project !== undefined && selectedProject.problem && (
				<div className="project-selector-message incus-project-selector-selection-message">
					<p className="incus-project-selector-muted">
						{messageBefore}
						{messageAfter.length > 0 && (
							<>
								<strong className="incus-project-selector-project-name">
									{scope.project}
								</strong>
								{messageAfter.join(scope.project)}
							</>
						)}
					</p>
				</div>
			)}
			{(model.failed || warning) && (
				<div
					key={model.failed ? "error" : "warning"}
					className={`project-selector-message incus-project-selector-status ${model.failed ? "incus-project-selector-danger" : "incus-project-selector-warning"}`}
				>
					{model.failed ? (
						<IconAlertCircle
							className="incus-project-selector-icon"
							aria-hidden="true"
						/>
					) : (
						<IconAlertTriangle
							className="incus-project-selector-icon"
							aria-hidden="true"
						/>
					)}
					<output className="incus-project-selector-status-text">
						{model.failed
							? messages.loadFailed
							: model.incomplete
								? messages.listIncomplete
								: messages.detailsUnavailable}
					</output>
					<Button
						variant="outline"
						size="xs"
						aria-label={messages.retryLabel}
						disabled={!model.reads.canRetry}
						className="incus-project-selector-retry"
						onClick={() => {
							void model.reads.retry();
						}}
					>
						<IconRefresh aria-hidden="true" /> {messages.retry}
					</Button>
				</div>
			)}
			<ComboboxVirtualList<ProjectOption>
				aria-label={messages.listLabel}
				getItemKey={(item) => item.key}
				estimateItemHeight={28}
				overscan={0}
				className="incus-project-selector-list"
			>
				{(item, { visible }) => (
					<ProjectOptionItem
						item={item}
						visible={visible}
						denied={model.denied}
						messages={messages}
					/>
				)}
			</ComboboxVirtualList>
			<output
				aria-live="polite"
				className={
					model.noMatches
						? "incus-project-selector-empty"
						: "incus-project-selector-accessible"
				}
			>
				{model.noMatches ? messages.noMatches : undefined}
			</output>
		</>
	);
}

function ProjectOptionItem({
	item,
	visible,
	denied,
	messages,
}: {
	item: ProjectOption;
	visible: boolean;
	denied: boolean;
	messages: ProjectSelectorMessages;
}) {
	return item.name === null ? (
		<ComboboxItem value={item} indicatorSide="end">
			<IconWorld className="incus-project-selector-icon" aria-hidden="true" />
			{messages.allProjects}
		</ComboboxItem>
	) : (
		<NamedProjectOption
			item={item}
			name={item.name}
			visible={visible}
			denied={denied}
			messages={messages}
		/>
	);
}

function NamedProjectOption({
	item,
	name,
	visible,
	denied,
	messages,
}: {
	item: ProjectOption;
	name: string;
	visible: boolean;
	denied: boolean;
	messages: ProjectSelectorMessages;
}) {
	const result = useQuery(projects.get({ name }, { select: ["description"] }), {
		acquire: visible && item.listed,
		enabled: !denied && !item.disabled,
	});
	const row = result.rows[0];
	const description = row?.data.description;
	const pending = result.fetching;
	const accessibleDescription = pending
		? [
				description,
				description === undefined
					? messages.loadingDescription
					: messages.updatingDescription,
			]
				.filter(Boolean)
				.join(" ")
		: description;
	return (
		<ComboboxItem
			value={item}
			disabled={item.disabled}
			aria-label={name}
			aria-description={accessibleDescription}
			aria-busy={pending || undefined}
			data-vem-overflow-trigger=""
		>
			{item.disabled && (
				<IconAlertCircle
					className="incus-project-selector-icon incus-project-selector-danger"
					aria-hidden="true"
				/>
			)}
			<span className="incus-project-selector-option-text">
				<OverflowText text={name} className="incus-project-selector-text" />
				{description && (
					<OverflowText
						text={description}
						className="incus-project-selector-description"
					/>
				)}
			</span>
		</ComboboxItem>
	);
}
