// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@hyecompany/vem-ui";
import { createFileRoute } from "@tanstack/react-router";
import { ViewHeader } from "@/layout/view";

export const Route = createFileRoute("/_ui/instances")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<ViewHeader>
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbPage>Instances</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
		</ViewHeader>
	);
}
