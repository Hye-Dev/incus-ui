// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineCommand, defineResource } from "@hyecompany/vem-data";
import type { ResourceReadDefinition } from "@hyecompany/vem-data/client";
import { createReadDefinition } from "../../internal/access/read-definition.ts";
import type { ActionOutcome } from "../../runtime/operation.ts";

export type Server = {
	api_extensions?: readonly string[];
	auth?: "trusted" | "untrusted";
	auth_user_name?: string;
	auth_user_method?: string;
};

export type ServerRef = { target?: string };
export const fields = [
	"auth",
	"auth_user_name",
	"auth_user_method",
	"api_extensions",
] as const;

export const readDefinition = {
	...createReadDefinition("server", { publicFields: "all" }),
	fieldAccess: {
		auth_user_name: "authenticated",
		auth_user_method: "authenticated",
	},
} satisfies ResourceReadDefinition;

export const serverResource = defineResource<Server, ServerRef, undefined>()({
	name: "server",
	fields,
	defaultSelect: ["auth"],
	commands: {
		refreshAccess: defineCommand<void, ActionOutcome>(),
		retireAccess: defineCommand<void, ActionOutcome>(),
	},
});

export const server = {
	current: <
		const K extends readonly (keyof Server &
			string)[] = typeof serverResource.defaultSelect,
	>(
		options: ServerRef & { select?: K } = {},
	) =>
		serverResource.get(options.target ? { target: options.target } : {}, {
			select: options.select,
		}),
	refreshAccess: () => serverResource.commands.refreshAccess({}),
	retireAccess: () => serverResource.commands.retireAccess({}),
};
