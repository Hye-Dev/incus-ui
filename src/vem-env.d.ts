// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

declare module "virtual:incus-build" {
	export const build: string;
	export const compatibility: import("@hyecompany/vem-data/client").Compatibility;
}

declare module "virtual:incus-client" {
	export const client: import("./host/application-client").ApplicationClient;
}
