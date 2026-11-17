// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { client } from "virtual:incus-client";
import { Button } from "@hyecompany/vem-ui";
import { useState, useSyncExternalStore } from "react";

export function ConnectionStatus() {
	const [upgrading, setUpgrading] = useState(false);
	const [upgradeError, setUpgradeError] = useState<string>();
	const connection = useSyncExternalStore(
		client.subscribe,
		client.connectionSnapshot,
		client.connectionSnapshot,
	);
	const updateAvailable =
		connection.phase === "ready" && connection.updateAvailable;
	if (
		!upgrading &&
		!updateAvailable &&
		(connection.phase === "ready" || connection.phase === "connecting")
	)
		return null;
	const upgrade = async () => {
		setUpgrading(true);
		setUpgradeError(undefined);
		try {
			const result = await client.upgrade();
			if (result.ready) {
				location.reload();
				return;
			}
			setUpgradeError(result.reason ?? "The application could not update yet.");
		} catch (error) {
			setUpgradeError(error instanceof Error ? error.message : String(error));
		}
		setUpgrading(false);
	};
	return (
		<div
			role="alert"
			className="flex items-center justify-between gap-4 border-b bg-muted p-4 text-sm"
		>
			<div>
				<p>
					{upgrading
						? "Preparing the update and waiting for the shared session to close."
						: updateAvailable
							? "A newer application version is available. The shared session is still using the previous version."
							: connection.phase === "incompatible"
								? "This page and the active application session use incompatible versions. Close the other Incus UI tabs, then reconnect."
								: "The connection was interrupted. Accepted server work may still be running."}
				</p>
				{connection.error && (
					<details className="mt-1 text-muted-foreground">
						<summary className="cursor-pointer">Connection details</summary>
						<p className="mt-1 break-words">{connection.error}</p>
					</details>
				)}
				{upgradeError && (
					<p className="mt-1 text-destructive">{upgradeError}</p>
				)}
			</div>
			<Button
				variant="outline"
				disabled={upgrading}
				onClick={updateAvailable ? upgrade : () => location.reload()}
			>
				{upgrading
					? "Updating…"
					: updateAvailable
						? "Update and reload"
						: "Reconnect"}
			</Button>
		</div>
	);
}
