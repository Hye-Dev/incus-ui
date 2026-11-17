// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { DataClient, FeedbackClient } from "@hyecompany/vem-data";
import type { BrowserClient } from "@hyecompany/vem-data/client";

export type ApplicationClient = DataClient &
	FeedbackClient &
	Pick<BrowserClient, "connectionSnapshot" | "upgrade">;
