// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type { UploadInput } from "./upload.ts";

export interface FileUploadRequest {
	url: string;
	method: "POST";
	headers: Readonly<Record<string, string>>;
	body: Blob;
	credentials: "include";
}

export function fileUploadRequest(
	url: URL,
	input: UploadInput,
): FileUploadRequest {
	if (input.mode !== undefined && !/^[0-7]{3,4}$/.test(input.mode))
		throw new TypeError("File mode must be an octal permission string.");
	const headers = new Headers({
		"Content-Type": "application/octet-stream",
		"X-Incus-type": "file",
		"X-Incus-write": input.write ?? "overwrite",
	});
	if (input.mode !== undefined) headers.set("X-Incus-mode", input.mode);
	if (input.uid !== undefined) headers.set("X-Incus-uid", String(input.uid));
	if (input.gid !== undefined) headers.set("X-Incus-gid", String(input.gid));
	return {
		url: url.toString(),
		method: "POST",
		headers: Object.fromEntries(headers),
		body: input.file,
		credentials: "include",
	};
}
