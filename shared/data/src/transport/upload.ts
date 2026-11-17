// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

export type UploadInput = {
	/** Stable descriptor identity for a selected file; each run still has its own action and submission. */
	transferId?: string;
	file: Blob;
	path: string;
	write?: "overwrite" | "append";
	mode?: string;
	uid?: number;
	gid?: number;
};
