// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import "../styles.css";

const Devtools = import.meta.env.DEV
	? lazy(() => import("@/development/devtools"))
	: () => null;

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				title: "Incus UI",
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument() {
	return (
		<>
			<HeadContent />
			<Outlet />
			{import.meta.env.DEV && (
				<Suspense>
					<Devtools />
				</Suspense>
			)}
			<Scripts />
		</>
	);
}
