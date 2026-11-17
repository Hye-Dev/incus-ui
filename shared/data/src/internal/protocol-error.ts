// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

export class IncusProtocolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IncusProtocolError";
	}
}
