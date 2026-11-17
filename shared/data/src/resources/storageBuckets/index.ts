// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { defineResource } from "@hyecompany/vem-data";
import { defineRoute } from "../../internal/identity/api-paths.ts";
export type StorageBucketsRef = {
	project: string;
	pool: string;
	name: string;
	target?: string;
};
export const route = defineRoute({
	resource: "storageBuckets",
	collection: "/1.0/storage-pools/{pool}/buckets",
	detail: "/1.0/storage-pools/{pool}/buckets/{name}",
	queryIdentity: ["target"],
	key: "name",
	identity: ["project", "pool", "name"],
});
export const storageBuckets = defineResource<
	StorageBucketsRef,
	StorageBucketsRef,
	{ project: string }
>()({
	name: "storageBuckets",
	fields: ["target", "project", "pool", "name"],
	defaultSelect: ["project", "pool", "name"],
});
