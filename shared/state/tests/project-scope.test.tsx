// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { DataProvider } from "@hyecompany/vem-data/react";
import { createRuntime } from "@hyecompany/vem-data/runtime";
import { createTestClient } from "@hyecompany/vem-data/testing";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { projects, type ResourceScope } from "../../data/src/index.ts";
import { ProjectScopeProvider, useProjectScope } from "../src/index.ts";

function Selection({ label }: { label: string }) {
	const { scope, setScope } = useProjectScope();
	return (
		<section aria-label={label}>
			<output aria-label="Selected scope">{JSON.stringify(scope)}</output>
			<button
				type="button"
				onClick={() => setScope({ project: "changed", target: "node-1" })}
			>
				Choose project
			</button>
		</section>
	);
}

test("initial scope is mount-only and each provider owns its selection and callback", () => {
	const scenario = createTestClient({ resources: ["projects"] });
	const changed = vi.fn();
	function Application({ initialScope }: { initialScope: ResourceScope }) {
		return (
			<DataProvider client={scenario.client}>
				<ProjectScopeProvider
					initialScope={initialScope}
					onScopeChange={changed}
				>
					<Selection label="First" />
				</ProjectScopeProvider>
				<ProjectScopeProvider>
					<Selection label="Second" />
				</ProjectScopeProvider>
			</DataProvider>
		);
	}
	const scope = (label: string) =>
		JSON.parse(
			within(screen.getByRole("region", { name: label })).getByRole("status", {
				name: "Selected scope",
			}).textContent ?? "null",
		);
	const view = render(<Application initialScope={{ project: "initial" }} />);
	try {
		expect(scope("First")).toEqual({ project: "initial" });
		expect(scope("Second")).toEqual({ allProjects: true });
		expect(changed).not.toHaveBeenCalled();
		view.rerender(<Application initialScope={{ project: "ignored" }} />);
		expect(scope("First")).toEqual({ project: "initial" });
		expect(changed).not.toHaveBeenCalled();
		fireEvent.click(
			within(screen.getByRole("region", { name: "First" })).getByRole(
				"button",
				{ name: "Choose project" },
			),
		);
		expect(scope("First")).toEqual({ project: "changed", target: "node-1" });
		expect(scope("Second")).toEqual({ allProjects: true });
		expect(changed.mock.calls).toEqual([
			[{ project: "changed", target: "node-1" }, undefined],
		]);
	} finally {
		view.unmount();
		scenario.close();
	}
});

test("inline callbacks may update parent state without becoming selection changes", () => {
	const scenario = createTestClient({ resources: ["projects"] });
	const changed = vi.fn();
	function Application({ version }: { version: number }) {
		const [notifications, setNotifications] = useState(0);
		return (
			<DataProvider client={scenario.client}>
				<ProjectScopeProvider
					onScopeChange={(scope, incarnation) => {
						changed(version, scope, incarnation);
						if (notifications < 3) setNotifications((count) => count + 1);
					}}
				>
					<Selection label="Inline callback" />
				</ProjectScopeProvider>
			</DataProvider>
		);
	}
	const view = render(<Application version={1} />);
	try {
		expect(changed).not.toHaveBeenCalled();
		view.rerender(<Application version={2} />);
		expect(changed).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Choose project" }));
		expect(changed.mock.calls).toEqual([
			[2, { project: "changed", target: "node-1" }, undefined],
		]);
		view.rerender(<Application version={3} />);
		expect(changed).toHaveBeenCalledOnce();
		fireEvent.click(screen.getByRole("button", { name: "Choose project" }));
		expect(changed).toHaveBeenLastCalledWith(
			3,
			{ project: "changed", target: "node-1" },
			undefined,
		);
		expect(changed).toHaveBeenCalledTimes(2);
	} finally {
		view.unmount();
		scenario.close();
	}
});

test.each([
	false,
	true,
])("rename chains retain selection identity without following reused names (controlled: %s)", async (controlled) => {
	const runtime = createRuntime({ resources: [{ name: "projects" }] });
	await runtime.ready;
	const present = (name: string) => ({
		resource: "projects",
		identity: { name },
		values: { name },
		presence: "present" as const,
		basis: ["public"],
	});
	runtime.observe({ facts: [present("team")] });
	const changed = vi.fn();
	function Current() {
		const { scope, projectIncarnation, selectedProject, setScope } =
			useProjectScope();
		return (
			<>
				<output aria-label="Selection identity">
					{JSON.stringify({ scope, projectIncarnation, selectedProject })}
				</output>
				<button type="button" onClick={() => setScope({ project: "team" })}>
					Select reused name
				</button>
			</>
		);
	}
	const application = (scope: ResourceScope) => (
		<DataProvider client={runtime}>
			<ProjectScopeProvider
				{...(controlled ? { scope } : { initialScope: scope })}
				onScopeChange={(scope, incarnation) => changed(scope, incarnation)}
			>
				<Current />
			</ProjectScopeProvider>
		</DataProvider>
	);
	const selection = () =>
		JSON.parse(
			screen.getByRole("status", { name: "Selection identity" }).textContent ??
				"null",
		);
	const view = render(application({ project: "team", target: "node-1" }));
	try {
		const original = selection().projectIncarnation;
		expect(original).toBeTruthy();
		expect(changed).not.toHaveBeenCalled();
		act(() => {
			runtime.observe({
				identityTransitions: [
					{
						resource: "projects",
						from: { name: "team" },
						to: { name: "group" },
						basis: ["public"],
					},
					{
						resource: "projects",
						from: { name: "group" },
						to: { name: "company" },
						basis: ["public"],
					},
				],
			});
			runtime.observe({ facts: [present("company"), present("team")] });
		});
		const destination = { project: "company", target: "node-1" };
		expect(changed).toHaveBeenCalledOnce();
		expect(changed.mock.calls[0]?.[0]).toEqual(destination);
		if (controlled) {
			expect(selection().scope.project).toBe("team");
			view.rerender(application({ project: "team", target: "node-1" }));
			expect(changed).toHaveBeenCalledOnce();
			view.rerender(application(destination));
		}
		expect(selection().scope).toEqual(destination);
		expect(selection().projectIncarnation).not.toBe(original);
		expect(selection().selectedProject.availability).toBe("available");
		fireEvent.click(screen.getByRole("button", { name: "Select reused name" }));
		if (controlled) view.rerender(application({ project: "team" }));
		expect(selection().scope).toEqual({ project: "team" });
		const detail = runtime.watch(projects.get({ name: "team" }), {
			acquire: false,
		});
		expect(selection().projectIncarnation).toBe(
			detail.getSnapshot().incarnation,
		);
		expect(selection().projectIncarnation).not.toBe(original);
		detail.dispose();
	} finally {
		view.unmount();
		runtime.close();
	}
});

test("controlled scope follows external navigation and only requests user changes", () => {
	const scenario = createTestClient({ resources: ["projects"] });
	const changed = vi.fn();
	const application = (scope: ResourceScope) => (
		<DataProvider client={scenario.client}>
			<ProjectScopeProvider scope={scope} onScopeChange={changed}>
				<Selection label="Controlled" />
			</ProjectScopeProvider>
		</DataProvider>
	);
	const view = render(application({ project: "initial" }));
	try {
		expect(changed).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "Choose project" }));
		expect(changed).toHaveBeenCalledWith(
			{ project: "changed", target: "node-1" },
			undefined,
		);
		expect(
			screen.getByRole("status", { name: "Selected scope" }).textContent,
		).toBe('{"project":"initial"}');
		view.rerender(application({ project: "changed", target: "node-1" }));
		expect(
			screen.getByRole("status", { name: "Selected scope" }).textContent,
		).toBe('{"project":"changed","target":"node-1"}');
		view.rerender(application({ project: "route-navigation" }));
		expect(
			screen.getByRole("status", { name: "Selected scope" }).textContent,
		).toBe('{"project":"route-navigation"}');
		expect(changed).toHaveBeenCalledOnce();
	} finally {
		view.unmount();
		scenario.close();
	}
});
