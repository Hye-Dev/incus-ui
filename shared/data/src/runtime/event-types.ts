// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { Operation } from "./operation.ts";
export type IncusLifecycleEvent = {
	type: "lifecycle";
	project?: string;
	location?: string;
	timestamp?: string;
	metadata: {
		action: string;
		source: string;
		context?: Record<string, unknown> | null;
		requestor?: { username?: string; protocol?: string; address?: string };
	};
};

export type IncusOperationEvent = {
	type: "operation";
	project?: string;
	location?: string;
	timestamp?: string;
	metadata: Operation;
};

export type IncusEvent = IncusLifecycleEvent | IncusOperationEvent;
