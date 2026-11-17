// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { SidebarInset, SidebarProvider, Toaster } from "@hyecompany/vem-ui";
import {
	ActivityToasts,
	type ActivityToastsProps,
} from "@hyecompany/vem-ui/data";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ConnectionStatus } from "@/layout/connection-status";
import { UiSidebar } from "@/layout/sidebar";
import { View } from "@/layout/view";
import { ProjectScope } from "@/projects/scope";

export const Route = createFileRoute("/_ui")({ component: RouteComponent });
const activityLabel: ActivityToastsProps["label"] = (action) =>
	`${action.resource}: ${action.name}`;
function RouteComponent() {
	return (
		<ProjectScope>
			<Toaster>
				<ActivityToasts label={activityLabel} />
				<SidebarProvider
					className="min-h-svh"
					defaultOpen={false}
					style={
						{
							"--header-height": "calc(var(--spacing) * 12)",
						} as React.CSSProperties
					}
				>
					<a
						href="#main-content"
						tabIndex={0}
						className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-lg focus:bg-background focus:px-4 focus:py-3 focus:text-foreground focus:outline-2 focus:outline-ring"
					>
						Skip to main content
					</a>
					<UiSidebar />
					<SidebarInset id="main-content" tabIndex={-1}>
						<View>
							<ConnectionStatus />
							<Outlet />
						</View>
					</SidebarInset>
				</SidebarProvider>
			</Toaster>
		</ProjectScope>
	);
}
