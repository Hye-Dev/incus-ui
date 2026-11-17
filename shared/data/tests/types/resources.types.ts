// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { instances, projects, storageVolumes } from "../../src/index.ts";

projects.list({ select: ["name", "description"] });
instances.get(
	{ project: "default", name: "web" },
	{ select: ["name", "project"] },
);
storageVolumes.get(
	{
		project: "default",
		pool: "local",
		type: "custom",
		name: "data",
		target: "node-a",
	},
	{ select: ["pool", "name", "target"] },
);
// @ts-expect-error Instance status is not part of the currently used contract.
instances.get({ project: "default", name: "web" }, { select: ["status"] });
// @ts-expect-error No screen currently consumes instance state commands.
instances.start({ project: "default", name: "web" });
// @ts-expect-error Project configuration is not currently consumed.
projects.list({ select: ["config"] });
