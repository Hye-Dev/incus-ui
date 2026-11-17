// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { client } from "virtual:incus-client";
import { DataProvider } from "@hyecompany/vem-data/react";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import { getRouter } from "./router";

// Create a new router instance
const router = getRouter();

// Render the app
const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error('Root element "#root" was not found');
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<StrictMode>
			<DataProvider client={client}>
				<RouterProvider router={router} />
			</DataProvider>
		</StrictMode>,
	);
}
