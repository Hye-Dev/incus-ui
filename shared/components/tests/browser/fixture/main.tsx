// SPDX-FileCopyrightText: 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { DataProvider } from "@hyecompany/vem-data/react";
import { createTestClient } from "@hyecompany/vem-data/testing";
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { projects, type ResourceScope } from "../../../../data/src/index.ts";
import {
	ProjectScopeProvider,
	type ProjectSelectionStatus,
	useProjectScope,
} from "../../../../state/src/index.ts";
import {
	ProjectSelector,
	type ProjectSelectorMessages,
	type ProjectSelectorProps,
} from "../../../src/index.ts";
import "@hyecompany/vem-ui/styles.css";
import "./page.css";

const params = new URLSearchParams(window.location.search);
const namedOnly = params.has("named-only");
const mode = params.get("mode");
const state = params.get("state");
const rows = [
	{
		identity: { name: "default" },
		data: { name: "default", description: "Default project" },
	},
	{
		identity: { name: "development" },
		data: { name: "development", description: "Development workloads" },
	},
];
if (params.has("locale"))
	rows.push(
		{ identity: { name: "zebra" }, data: { name: "zebra", description: "" } },
		{ identity: { name: "älg" }, data: { name: "älg", description: "" } },
	);
const scenario = createTestClient({
	resources: ["projects"],
	queries: [
		{
			query: projects.list({
				select: state === "details-failed" ? ["name"] : ["name", "description"],
			}),
			complete: state !== "partial",
			status:
				state === "loading" || state === "updating"
					? "loading"
					: state === "failed"
						? "failed"
						: "ready",
			rows:
				state === "loading" || state === "details-failed"
					? rows.map((row) => ({ ...row, data: { name: row.data.name } }))
					: rows,
		},
		...(state === "details-failed"
			? rows.map((row) => ({
					query: projects.get(row.identity, { select: ["description"] }),
					status: "failed" as const,
				}))
			: []),
	],
});

if (state === "updating")
	scenario.setQuery({
		query: projects.list({ select: ["name", "description"] }),
		status: "loading",
		rows,
	});

const translated: ProjectSelectorMessages = {
	label: "Proyecto de origen",
	popupLabel: "Elegir proyecto",
	listLabel: "Proyectos",
	showSuggestions: "Mostrar opciones",
	searchPlaceholder: "Buscar proyectos…",
	allProjects: "Todos los proyectos",
	loading: "Cargando proyectos",
	loadFailed: "No se pudieron cargar los proyectos",
	listIncomplete: "Lista de proyectos incompleta",
	detailsUnavailable: "Algunos detalles no están disponibles",
	retry: "Reintentar",
	retryLabel: "Reintentar la carga",
	noMatches: "Ningún proyecto coincide.",
	loadingDescription: "Cargando descripción.",
	updatingDescription: "Actualizando descripción.",
	selectionUnavailable: "Ya no está disponible: {project}.",
	selectionDenied: "Sin acceso a {project}.",
	selectionUnverified:
		"No se pudo verificar {project}. Vuelve a seleccionarlo.",
};

function Selection() {
	const { scope, projectIncarnation, selectedProject, setScope } =
		useProjectScope();
	return (
		<>
			<ProjectSelector
				scope={scope}
				projectIncarnation={projectIncarnation}
				selectedProject={selectedProject}
				onScopeChange={setScope}
				allowAllProjects={!namedOnly}
				className="fixture-selector"
				popupClassName="fixture-popup"
				messages={{ label: undefined, searchPlaceholder: undefined }}
			/>
			<output aria-label="Selection">{scope.project ?? "all"}</output>
		</>
	);
}

function ControlledSelection(
	props: Omit<Partial<ProjectSelectorProps>, "scope" | "onScopeChange">,
) {
	const [scope, setScope] = useState<ResourceScope>({ project: "default" });
	return (
		<>
			<ProjectSelector scope={scope} onScopeChange={setScope} {...props} />
			<output aria-label={`${props.messages?.label ?? "Project"} selection`}>
				{scope.project ?? "all"}
			</output>
		</>
	);
}

function Consumer() {
	const theme = useRef<HTMLElement>(null);
	const dialog = useRef<HTMLDialogElement>(null);
	const problem = ["identity", "access", "unavailable"].includes(state ?? "")
		? (state as NonNullable<ProjectSelectionStatus["problem"]>["kind"])
		: undefined;
	if (mode === "minimal") return <ControlledSelection />;
	if (mode === "obsolete")
		return <ControlledSelection projectIncarnation="known-obsolete" />;
	if (mode === "translated")
		return (
			<ControlledSelection
				messages={translated}
				locale={params.get("locale") ?? undefined}
				selectedProject={
					problem
						? { availability: "unavailable", problem: { kind: problem } }
						: undefined
				}
			/>
		);
	return (
		<>
			<section ref={theme} className="scoped-theme" aria-label="Scoped theme">
				<ControlledSelection
					messages={translated}
					popupContainer={theme}
					locale="es"
				/>
			</section>
			<button type="button" onClick={() => dialog.current?.showModal()}>
				Open destination
			</button>
			<dialog
				ref={dialog}
				aria-labelledby="destination-title"
				className="scoped-theme"
			>
				<h2 id="destination-title">Destination</h2>
				<ControlledSelection
					messages={{ label: "Destination project" }}
					popupContainer={dialog}
				/>
				<form method="dialog">
					<button type="submit">Close destination</button>
				</form>
			</dialog>
		</>
	);
}

const container = document.getElementById("root");
if (!container) throw Error("Missing fixture root");
createRoot(container).render(
	<DataProvider client={scenario.client}>
		{mode ? (
			<Consumer />
		) : (
			<ProjectScopeProvider
				initialScope={
					namedOnly ? { project: "default" } : { allProjects: true }
				}
			>
				<Selection />
			</ProjectScopeProvider>
		)}
	</DataProvider>,
);
