// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { createScenarioClient } from "@hyecompany/vem-data/devtools";
import { DataProvider } from "@hyecompany/vem-data/react";
import { SidebarProvider } from "@hyecompany/vem-ui";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { incusScenarios } from "../../shared/data/src/scenarios.ts";
import { ProjectScopeProvider } from "../../shared/state/src/index.ts";
import { View, ViewHeader } from "../../src/layout/view.tsx";
import { RouteBoundary, RouteContent } from "./support/view.tsx";

const scenarios: ReturnType<typeof createScenarioClient>[] = [];
const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
beforeEach(() => {
	// Only incidental desktop chrome needs these APIs; layout remains covered in browser tests.
	vi.stubGlobal(
		"matchMedia",
		(media: string): MediaQueryList => ({
			matches: false,
			media,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: () => true,
		}),
	);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: Object.assign(new EventTarget(), { ready: Promise.resolve() }),
	});
});
afterEach(() => {
	cleanup();
	for (const scenario of scenarios.splice(0)) scenario.close();
	if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
	else Reflect.deleteProperty(document, "fonts");
});

function renderView(outside = false) {
	const scenario = createScenarioClient({ resources: incusScenarios });
	scenarios.push(scenario);
	let resumeHeader!: () => void;
	const pendingHeader = new Promise<void>((resolve) => {
		resumeHeader = resolve;
	});
	const caught = vi.fn();
	render(
		<StrictMode>
			<DataProvider client={scenario.client}>
				<ProjectScopeProvider>
					<SidebarProvider className="flex-col">
						{outside ? (
							<RouteBoundary>
								<ViewHeader>Outside View</ViewHeader>
							</RouteBoundary>
						) : (
							<View>
								<RouteBoundary>
									<RouteContent pendingHeader={pendingHeader} />
								</RouteBoundary>
							</View>
						)}
					</SidebarProvider>
				</ProjectScopeProvider>
			</DataProvider>
		</StrictMode>,
		{ onCaughtError: caught },
	);
	return { scenario, caught, resumeHeader };
}

test("route headers retain context, state, and boundary ownership", async () => {
	const fetch = vi.spyOn(globalThis, "fetch");
	const { scenario, caught, resumeHeader } = renderView();
	const header = within(screen.getByRole("banner"));
	const counter = header.getByRole("button", { name: "Header state" });
	expect(counter.textContent).toBe("Instances: 0");
	fireEvent.click(counter);
	expect(counter.textContent).toBe("Instances: 1");
	fireEvent.click(screen.getByRole("button", { name: "Toggle child route" }));
	expect(header.getByText("Instance details")).toBeTruthy();
	expect(counter.textContent).toBe("Instances: 1");
	fireEvent.click(screen.getByRole("button", { name: "Toggle child route" }));
	expect(header.queryByText("Instance details")).toBeNull();
	expect(counter.textContent).toBe("Instances: 1");
	fireEvent.click(screen.getByRole("button", { name: "Change route context" }));
	expect(counter.textContent).toBe("Containers: 1");
	expect(header.getByRole("button", { name: "Header state" })).toBe(counter);
	expect(counter.isConnected).toBe(true);
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Wait for header" }));
	});
	expect(screen.getByText("Header is waiting")).toBeTruthy();
	expect(header.queryByText("Header is waiting")).toBeNull();
	expect(counter.textContent).toBe("Containers: 1");
	await act(async () => resumeHeader());
	expect(header.getByText("Loaded header")).toBeTruthy();
	expect(screen.queryByText("Header is waiting")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Fail route header" }));
	expect(screen.getByRole("alert").textContent).toBe("Route header failed");
	expect(header.queryByRole("button", { name: "Header state" })).toBeNull();
	expect(header.getByRole("combobox", { name: "Project" })).toBeTruthy();
	expect(scenario.getSnapshot().queries).toHaveLength(0);
	expect(fetch).not.toHaveBeenCalled();
	expect(caught).toHaveBeenCalledOnce();
	expect(caught.mock.calls[0]?.[0]).toEqual(Error("Route header failed"));
});

test("a header outside View explains the missing boundary", () => {
	const { caught } = renderView(true);
	expect(screen.getByRole("alert").textContent).toBe(
		"ViewHeader must be rendered within View",
	);
	expect(caught).toHaveBeenCalledOnce();
	expect(caught.mock.calls[0]?.[0]).toEqual(
		Error("ViewHeader must be rendered within View"),
	);
});
