// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { TanStackDevtools } from "@tanstack/react-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { scenarios } from "@/development/client";
import DataDevtools from "./data-devtools";

export default function Devtools() {
	return (
		<>
			{scenarios && (
				<output className="fixed bottom-3 left-3 z-50 rounded-lg border bg-background px-4 py-2 shadow-lg text-sm font-semibold sm:bottom-auto sm:left-1/2 sm:top-2 sm:-translate-x-1/2">
					Simulated data
				</output>
			)}
			<TanStackDevtools
				config={{ position: "bottom-right" }}
				plugins={[
					{ id: "vem-data", name: "Vem Data", render: <DataDevtools /> },
					{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> },
				]}
			/>
		</>
	);
}
