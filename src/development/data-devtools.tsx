// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { Button } from "@hyecompany/vem-ui";
import { DataInspector } from "@hyecompany/vem-ui/devtools";
import { useSyncExternalStore } from "react";
import "@hyecompany/vem-ui/devtools/styles.css";
import {
	client,
	inspection,
	scenarios,
	switchMode,
} from "@/development/client";

export default function DataDevtools() {
	const connection = useSyncExternalStore(
		client.subscribe,
		client.connectionSnapshot,
	);
	return (
		<DataInspector
			inspection={inspection}
			scenarios={scenarios}
			header={
				<>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="text-base font-semibold">
							Vem Data · {scenarios ? "Scenarios" : "Live Incus"}
						</h2>
						<div className="flex flex-wrap gap-2">
							{scenarios && (
								<Button
									size="sm"
									variant="outline"
									onClick={() => switchMode(false)}
								>
									Return to live data
								</Button>
							)}
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									scenarios ? location.reload() : switchMode(true)
								}
							>
								{scenarios ? "Reset scenarios" : "Use simulated data"}
							</Button>
						</div>
					</div>
					<p className="text-xs text-muted-foreground">
						{scenarios
							? "This tab uses an isolated in-memory runtime. No Incus requests or events socket are created."
							: `SharedWorker connection: ${connection.phase}. Ordinary reads and the events socket belong to the worker. Inspection adds no data requests.`}
					</p>
					{!scenarios && (
						<details className="text-xs text-muted-foreground">
							<summary className="cursor-pointer">
								Where to inspect requests and reload behavior
							</summary>
							<div className="mt-2 space-y-2">
								<p>
									Chrome: open <code>chrome://inspect/#workers</code>, inspect
									the <code>vem-data</code> worker at{" "}
									<code>/ui/vem-runtime.js</code>, then open its Network panel.
									Firefox: open <code>about:debugging</code>, choose This
									Firefox, then inspect that worker under Shared Workers.
								</p>
								<p>
									Open the worker inspector before reproducing the request. A
									surviving owner can serve a reload from covered knowledge and
									keep its existing socket. A new live owner requests{" "}
									<code>/1.0</code> and opens an events socket for an
									authenticated caller. A worker connection does not itself
									prove that its events socket is connected. That initial access
									check is owner initialization, so it does not appear as a
									consumer query below.
								</p>
							</div>
						</details>
					)}
				</>
			}
		/>
	);
}
