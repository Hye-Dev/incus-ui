// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineResource } from "@hyecompany/vem-data";
import { defineRoute } from "../../internal/identity/api-paths.ts";
export type StorageVolumesRef = {
	project: string;
	pool: string;
	type: string;
	name: string;
	target?: string;
};
export const route = defineRoute({
	resource: "storageVolumes",
	collection: "/1.0/storage-pools/{pool}/volumes/{type}",
	detail: "/1.0/storage-pools/{pool}/volumes/{type}/{name}",
	queryIdentity: ["target"],
	key: "name",
	identity: ["project", "pool", "type", "name"],
});
export const storageVolumes = defineResource<
	StorageVolumesRef,
	StorageVolumesRef,
	{ project: string }
>()({
	name: "storageVolumes",
	fields: ["target", "project", "pool", "type", "name"],
	defaultSelect: ["project", "pool", "type", "name"],
});
