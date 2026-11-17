// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineResource } from "@hyecompany/vem-data";
import { defineRoute } from "../../internal/identity/api-paths.ts";
export type ImagesRef = { project: string; fingerprint: string };
export const route = defineRoute({
	resource: "images",
	collection: "/1.0/images",
	detail: "/1.0/images/{fingerprint}",
	key: "fingerprint",
	identity: ["project", "fingerprint"],
});
export const images = defineResource<
	ImagesRef,
	ImagesRef,
	{ project: string }
>()({
	name: "images",
	fields: ["project", "fingerprint"],
	defaultSelect: ["project", "fingerprint"],
});
