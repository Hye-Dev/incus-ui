// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { route as imagesRoute } from "./images/index.ts";
import { route as instancesRoute } from "./instances/index.ts";
import { route as networkAclsRoute } from "./networkAcls/index.ts";
import { route as networksRoute } from "./networks/index.ts";
import { route as networkZonesRoute } from "./networkZones/index.ts";
import { route as profilesRoute } from "./profiles/index.ts";
import { route as storageBucketsRoute } from "./storageBuckets/index.ts";
import { route as storageVolumesRoute } from "./storageVolumes/index.ts";
export const referenceRoutes = [
	instancesRoute,
	profilesRoute,
	imagesRoute,
	networksRoute,
	networkAclsRoute,
	networkZonesRoute,
	storageBucketsRoute,
	storageVolumesRoute,
];
