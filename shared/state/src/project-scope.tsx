// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { DataClient } from "@hyecompany/vem-data";
import { useDataClient, useQuery } from "@hyecompany/vem-data/react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { projects, type ResourceScope } from "../../data/src/index.ts";

/** Reports explicit selections and proven renames, never mounting or controlled prop updates. */
type ScopeChanged = (scope: ResourceScope, incarnation?: string) => void;

export type ProjectScopeProviderProps = { children: ReactNode } & (
	| { scope: ResourceScope; initialScope?: never; onScopeChange: ScopeChanged }
	| {
			scope?: undefined;
			initialScope?: ResourceScope;
			onScopeChange?: ScopeChanged;
	  }
);

export type ProjectSelectionStatus = {
	availability: "available" | "unavailable" | "unknown";
	problem?: {
		kind: "unavailable" | "access" | "identity";
		detail?: string;
	};
};

type Selection = {
	binding: { client: DataClient };
	scope: ResourceScope;
	incarnation?: string;
	generation: number;
};

function sameScope(left: ResourceScope, right: ResourceScope) {
	return (
		left.project === right.project &&
		left.allProjects === right.allProjects &&
		left.target === right.target
	);
}

const available: ProjectSelectionStatus = {
	availability: "available",
};
const unknown: ProjectSelectionStatus = { availability: "unknown" };

const Context = createContext<{
	scope: ResourceScope;
	projectIncarnation?: string;
	selectedProject: ProjectSelectionStatus;
	setScope(scope: ResourceScope, incarnation?: string): void;
} | null>(null);

export function ProjectScopeProvider({
	children,
	scope: controlledScope,
	initialScope = { allProjects: true },
	onScopeChange,
}: ProjectScopeProviderProps) {
	const client = useDataClient();
	const [selection, setSelection] = useState<Selection>(() => ({
		binding: { client },
		scope: controlledScope ?? initialScope,
		generation: 0,
	}));
	const { binding } = selection;
	const requested = useRef<Selection | undefined>(undefined);
	const requestedRename = useRef<string | undefined>(undefined);
	const activeBinding = useRef<typeof binding | null>(binding);
	useLayoutEffect(() => {
		activeBinding.current = binding;
		requested.current = undefined;
		requestedRename.current = undefined;
		return () => {
			activeBinding.current = null;
		};
	}, [binding]);
	const controlled = controlledScope !== undefined;
	const current = useRef({ selection, controlled, onScopeChange });
	useLayoutEffect(() => {
		current.current = { selection, controlled, onScopeChange };
	}, [selection, controlled, onScopeChange]);
	if (
		binding.client !== client ||
		(controlledScope && !sameScope(controlledScope, selection.scope))
	) {
		const scope = controlledScope ?? selection.scope;
		const next = requested.current;
		const nextBinding = binding.client === client ? binding : { client };
		setSelection({
			binding: nextBinding,
			scope,
			incarnation:
				next &&
				next.binding === nextBinding &&
				next.generation === selection.generation &&
				sameScope(next.scope, scope)
					? next.incarnation
					: undefined,
			generation: selection.generation + 1,
		});
	}
	const name = selection.scope.project;
	const result = useQuery(
		name === undefined
			? projects.list({ select: ["name"] })
			: projects.get({ name }, { select: ["name"] }),
		{ acquire: false, enabled: name !== undefined },
	);
	const transition = selection.incarnation
		? result.identityTransitions?.find(
				(entry) => entry.from.incarnation === selection.incarnation,
			)
		: undefined;
	const setScope = useCallback(
		(scope: ResourceScope, incarnation?: string) => {
			if (activeBinding.current !== binding) return;
			const latest = current.current;
			requested.current = {
				binding,
				scope,
				incarnation,
				generation: latest.selection.generation,
			};
			if (latest.controlled) {
				setSelection((previous) =>
					previous.binding === binding && sameScope(scope, previous.scope)
						? {
								...previous,
								incarnation,
								generation: previous.generation + 1,
							}
						: previous,
				);
			} else
				setSelection((previous) =>
					previous.binding === binding
						? {
								binding,
								scope,
								incarnation,
								generation: previous.generation + 1,
							}
						: previous,
				);
			latest.onScopeChange?.(scope, incarnation);
		},
		[binding],
	);
	useEffect(() => {
		if (name === undefined || activeBinding.current !== binding) return;
		// Only a proven transition from this selection can move it; project names can be reused.
		if (transition) {
			const key = `${selection.generation}:${transition.to.incarnation}`;
			if (requestedRename.current !== key) {
				requestedRename.current = key;
				setScope(
					{
						project: transition.to.identity.name,
						target: selection.scope.target,
					},
					transition.to.incarnation,
				);
			}
			return;
		}
		if (
			!selection.incarnation &&
			result.incarnation &&
			result.rows.some((row) => row.identity.kind === "resource")
		)
			setSelection((current) =>
				current.binding === binding &&
				current.generation === selection.generation &&
				!current.incarnation
					? { ...current, incarnation: result.incarnation }
					: current,
			);
	}, [binding, result, selection, name, transition, setScope]);
	const selectedProject = useMemo<ProjectSelectionStatus>(() => {
		if (selection.scope.allProjects) return available;
		if (name === undefined || transition) return unknown;
		const identityUnverified =
			selection.incarnation !== undefined &&
			result.incarnation !== undefined &&
			selection.incarnation !== result.incarnation;
		const unavailable = result.exists === false;
		const accessIssue = result.issues.find((issue) => issue.kind === "access");
		return {
			availability: unavailable
				? "unavailable"
				: result.exists && !identityUnverified
					? "available"
					: "unknown",
			problem: unavailable
				? { kind: "unavailable" }
				: accessIssue
					? { kind: "access", detail: accessIssue.message }
					: identityUnverified
						? { kind: "identity" }
						: undefined,
		};
	}, [
		selection.scope.allProjects,
		selection.incarnation,
		name,
		result,
		transition,
	]);
	const value = useMemo(
		() => ({
			scope: selection.scope,
			projectIncarnation: selection.incarnation,
			setScope,
			selectedProject,
		}),
		[selection.scope, selection.incarnation, setScope, selectedProject],
	);
	return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProjectScope() {
	const context = useContext(Context);
	if (!context) throw new Error("ProjectScopeProvider is required");
	return context;
}
