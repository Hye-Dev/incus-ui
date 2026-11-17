// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { DataClient } from "@hyecompany/vem-data";
import type { ConnectionSnapshot } from "@hyecompany/vem-data/client";
import {
	createScenarioClient,
	inspectClient,
} from "@hyecompany/vem-data/devtools";
import type { ApplicationClient } from "@/host/application-client";
import { incusScenarios } from "../../shared/data/src/scenarios.ts";

function applicationClient(
	source: DataClient,
	shell: Omit<ApplicationClient, keyof DataClient>,
): ApplicationClient {
	return {
		watch: source.watch.bind(source),
		watchReadStatus: source.watchReadStatus.bind(source),
		read: source.read.bind(source),
		run: source.run.bind(source),
		action: source.action.bind(source),
		listActivities: source.listActivities.bind(source),
		subscribeActivities: source.subscribeActivities.bind(source),
		availability: source.availability.bind(source),
		watchAvailability: source.watchAvailability.bind(source),
		subscribe: source.subscribe.bind(source),
		prepareEdit: source.prepareEdit.bind(source),
		saveEdit: source.saveEdit.bind(source),
		access: source.access.bind(source),
		accessSnapshot: source.accessSnapshot.bind(source),
		revoke: source.revoke.bind(source),
		flush: source.flush?.bind(source),
		close: source.close.bind(source),
		...shell,
	};
}

const ready: ConnectionSnapshot = { phase: "ready", updateAvailable: false };
const modeKey = "incus-ui:development-data-mode";
async function initialize() {
	if (new URL(location.href).searchParams.has("vem-scenario"))
		sessionStorage.setItem(modeKey, "scenario");
	if (sessionStorage.getItem(modeKey) === "scenario") {
		const scenario = createScenarioClient({ resources: incusScenarios });
		const client = applicationClient(scenario.client, {
			subscribeFeedback: scenario.feedback.subscribeFeedback,
			feedback: scenario.feedback.feedback,
			claimFeedback: scenario.feedback.claimFeedback,
			claimQueryFeedback: scenario.feedback.claimQueryFeedback,
			acknowledgeFeedback: scenario.feedback.acknowledgeFeedback,
			connectionSnapshot: () => ready,
			upgrade: async () => ({ ready: true }),
		});
		return { client, inspection: scenario, scenarios: scenario };
	}
	const live = (await import("@/host/client")).client;
	const inspection = inspectClient(live);
	return {
		client: applicationClient(inspection.client, {
			subscribeFeedback: live.subscribeFeedback,
			feedback: live.feedback,
			claimFeedback: live.claimFeedback.bind(live),
			claimQueryFeedback: live.claimQueryFeedback.bind(live),
			acknowledgeFeedback: live.acknowledgeFeedback.bind(live),
			connectionSnapshot: live.connectionSnapshot,
			upgrade: live.upgrade.bind(live),
		}),
		inspection,
		scenarios: undefined,
	};
}

export const { client, inspection, scenarios } = await initialize();

export function switchMode(simulated: boolean) {
	const url = new URL(location.href);
	if (simulated) {
		sessionStorage.setItem(modeKey, "scenario");
		url.searchParams.set("vem-scenario", "1");
	} else {
		sessionStorage.removeItem(modeKey);
		url.searchParams.delete("vem-scenario");
	}
	location.assign(url);
}

window.addEventListener("pagehide", (event) => {
	if (!event.persisted) inspection.close();
});
