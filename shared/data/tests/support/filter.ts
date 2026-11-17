// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

/** The project-search wire subset of Incus's case-insensitive, left-to-right regex filters. */
export function matchesIncusFilter(
	values: Record<string, unknown>,
	expression: string | null,
): boolean {
	if (!expression) return true;
	const tokens = expression.split(/ (and|or) /);
	const evaluate = (clause: string) => {
		const match = /^(name|description) eq (.+)$/.exec(clause);
		if (!match) throw new Error(`Unsupported fixture filter: ${clause}`);
		const pattern = match[2]
			.replaceAll("(?s)", "")
			.replace(/\\x\{([a-f0-9]+)\}/g, "\\u{$1}");
		return new RegExp(`^(?:${pattern})$`, "isu").test(
			String(values[match[1]] ?? ""),
		);
	};
	let result = evaluate(tokens[0]);
	for (let index = 1; index < tokens.length; index += 2) {
		const next = evaluate(tokens[index + 1]);
		result = tokens[index] === "or" ? result || next : result && next;
	}
	return result;
}
