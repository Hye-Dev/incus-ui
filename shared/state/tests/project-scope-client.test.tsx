// SPDX-FileCopyrightText: 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { DataClient } from "@hyecompany/vem-data";
import { DataProvider } from "@hyecompany/vem-data/react";
import { createRuntime } from "@hyecompany/vem-data/runtime";
import { act, render } from "@testing-library/react";
import { StrictMode, useLayoutEffect } from "react";
import { expect, test, vi } from "vitest";
import { projects } from "../../data/src/index.ts";
import { ProjectScopeProvider, useProjectScope } from "../src/index.ts";

type ScopeState = ReturnType<typeof useProjectScope>;

function Capture({ onState }: { onState(state: ScopeState): void }) {
	const state = useProjectScope();
	useLayoutEffect(() => onState(state), [onState, state]);
	return null;
}

const project = (
	name: string,
	presence = "present" as "present" | "absent",
) => ({
	resource: "projects",
	identity: { name },
	values: presence === "present" ? { name } : undefined,
	presence,
	basis: ["public"],
});

test("a retained controlled setter requests its scope without changing another selection's identity", async () => {
	const client = createRuntime({ resources: [{ name: "projects" }] });
	await client.ready;
	client.observe({ facts: [project("team"), project("other")] });
	const firstChanged = vi.fn();
	const currentChanged = vi.fn();
	let state: ScopeState | undefined;
	const capture = (next: ScopeState) => {
		state = next;
	};
	const current = () => {
		if (!state) throw Error("Missing provider state");
		return state;
	};
	const application = (name: string, onScopeChange = currentChanged) => (
		<StrictMode>
			<DataProvider client={client}>
				<ProjectScopeProvider
					scope={{ project: name }}
					onScopeChange={onScopeChange}
				>
					<Capture onState={capture} />
				</ProjectScopeProvider>
			</DataProvider>
		</StrictMode>
	);
	const view = render(application("team", firstChanged));
	try {
		const retained = current().setScope;
		const original = current().projectIncarnation;
		view.rerender(application("other"));
		const otherIncarnation = current().projectIncarnation;
		act(() => {
			client.observe({ facts: [project("team", "absent")] });
			client.observe({ facts: [project("team")] });
			retained({ project: "team" }, original);
		});
		expect(current().scope).toEqual({ project: "other" });
		expect(current().projectIncarnation).toBe(otherIncarnation);
		expect(current().selectedProject.availability).toBe("available");
		expect(firstChanged).not.toHaveBeenCalled();
		expect(currentChanged.mock.calls).toEqual([
			[{ project: "team" }, original],
		]);
		view.rerender(application("team"));
		expect(current().projectIncarnation).toBe(original);
		expect(current().selectedProject.problem).toEqual({ kind: "identity" });
		expect(currentChanged).toHaveBeenCalledOnce();
	} finally {
		view.unmount();
		client.close();
	}
});

test.each([
	false,
	true,
])("client changes preserve scope and retire old identity callbacks (controlled: %s)", async (controlled) => {
	const clients = Array.from({ length: 3 }, () =>
		createRuntime({ resources: [{ name: "projects" }] }),
	);
	const [first, second, third] = clients;
	if (!first || !second || !third) throw Error("Missing test clients");
	await Promise.all(clients.map((client) => client.ready));
	first.observe({ facts: [project("team")] });
	second.observe({ facts: [project("team")] });
	third.observe({ facts: [project("other")] });
	const changed = vi.fn();
	let state: ScopeState | undefined;
	const capture = (next: ScopeState) => {
		state = next;
	};
	const current = () => {
		if (!state) throw Error("Missing provider state");
		return state;
	};
	const application = (client: DataClient) => (
		<DataProvider client={client}>
			<ProjectScopeProvider
				{...(controlled
					? { scope: { project: "team", target: "node-1" } }
					: { initialScope: { project: "team", target: "node-1" } })}
				onScopeChange={changed}
			>
				<Capture onState={capture} />
			</ProjectScopeProvider>
		</DataProvider>
	);
	const view = render(application(first));
	try {
		const firstIncarnation = current().projectIncarnation;
		const firstCallback = current().setScope;
		expect(firstIncarnation).toBeTruthy();
		view.rerender(application(second));
		expect(current().selectedProject.availability).toBe("available");
		expect(current().projectIncarnation).not.toBe(firstIncarnation);
		const secondIncarnation = current().projectIncarnation;
		const secondCallback = current().setScope;
		act(() => {
			firstCallback({ project: "obsolete" }, firstIncarnation);
			first.observe({
				identityTransitions: [
					{
						resource: "projects",
						from: { name: "team" },
						to: { name: "renamed-on-first-server" },
						basis: ["public"],
					},
				],
			});
		});
		expect(current().scope).toEqual({ project: "team", target: "node-1" });
		expect(current().selectedProject.availability).toBe("available");
		view.rerender(application(third));
		expect(current().projectIncarnation).toBeUndefined();
		expect(current().selectedProject).toEqual({
			availability: "unknown",
			problem: undefined,
		});
		act(() => third.observe({ facts: [project("team", "absent")] }));
		expect(current().selectedProject).toEqual({
			availability: "unavailable",
			problem: { kind: "unavailable" },
		});
		view.rerender(application(second));
		act(() => secondCallback({ project: "obsolete" }, secondIncarnation));
		expect(current().scope).toEqual({ project: "team", target: "node-1" });
		expect(current().projectIncarnation).toBe(secondIncarnation);
		expect(current().selectedProject.availability).toBe("available");
		expect(changed).not.toHaveBeenCalled();
	} finally {
		view.unmount();
		for (const client of clients) client.close();
	}
});

test.each([
	false,
	true,
])("explicitly reselecting the same scope accepts its new incarnation (controlled: %s)", async (controlled) => {
	const client = createRuntime({ resources: [{ name: "projects" }] });
	await client.ready;
	client.observe({ facts: [project("team")] });
	const changed = vi.fn();
	let state: ScopeState | undefined;
	const view = render(
		<DataProvider client={client}>
			<ProjectScopeProvider
				{...(controlled
					? { scope: { project: "team" } }
					: { initialScope: { project: "team" } })}
				onScopeChange={changed}
			>
				<Capture
					onState={(next) => {
						state = next;
					}}
				/>
			</ProjectScopeProvider>
		</DataProvider>,
	);
	const query = client.watch(projects.get({ name: "team" }), {
		acquire: false,
	});
	try {
		if (!state) throw Error("Missing provider state");
		const original = state.projectIncarnation;
		act(() => {
			client.observe({ facts: [project("team", "absent")] });
			client.observe({ facts: [project("team")] });
		});
		expect(state.selectedProject.problem).toEqual({ kind: "identity" });
		const incarnation = query.getSnapshot().incarnation;
		act(() => state?.setScope({ project: "team" }, incarnation));
		expect(state.projectIncarnation).toBe(incarnation);
		expect(state.projectIncarnation).not.toBe(original);
		expect(state.selectedProject.availability).toBe("available");
		expect(changed.mock.calls).toEqual([[{ project: "team" }, incarnation]]);
	} finally {
		query.dispose();
		view.unmount();
		client.close();
	}
});
