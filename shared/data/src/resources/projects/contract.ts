// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineResource } from "@hyecompany/vem-data";
import { createReadDefinition } from "../../internal/access/read-definition.ts";

export type Project = { name: string; description: string; used_by: string[] };

export type ProjectRef = { name: string };
export const fields = ["name", "description", "used_by"] as const;

export const readDefinition = createReadDefinition("projects");

export const projectResource = defineResource<Project, ProjectRef, undefined>()(
	{
		name: "projects",
		fields: fields,
		defaultSelect: ["name", "description"],
	},
);
export const projects = {
	list: projectResource.list,
	get: projectResource.get,
};
