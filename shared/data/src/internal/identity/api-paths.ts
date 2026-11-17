// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import type {
	ObservationLiveness,
	ResourceReference,
	Values,
} from "@hyecompany/vem-data/runtime";
import { IncusProtocolError } from "../protocol-error.ts";
import { isRecord } from "../values.ts";

export interface ResourceRoute {
	readonly resource: string;
	readonly projectScoped: boolean;
	readonly identityField?: string;
	scope(identity?: unknown): unknown;
	path(identity?: unknown, mode?: "one" | "list"): string;
	identity(value: Values, scope?: unknown): Values;
	parse(source: string, project?: string): IncusReference | undefined;
}
export type IncusReference = ResourceReference & { identity: Values };
export type ReferenceParser = ((
	source: string,
	project?: string,
) => IncusReference | undefined) & {
	route(resource: string): ResourceRoute | undefined;
};

export function identityFieldLiveness(
	field: string | undefined,
	identity: Values,
	values: Values,
): Readonly<Record<string, ObservationLiveness>> {
	return field &&
		typeof identity[field] === "string" &&
		values[field] === identity[field]
		? { [field]: "immutable" }
		: {};
}

export function defineRoute(configuration: {
	resource: string;
	collection: string;
	detail: string;
	key?: string;
	identity: readonly string[];
	queryIdentity?: readonly string[];
}): ResourceRoute {
	const { resource, collection, detail, key } = configuration;
	const identityFields = [...configuration.identity];
	const queryIdentityFields = [...(configuration.queryIdentity ?? [])];
	const projectScoped = identityFields.includes("project");
	const names: string[] = [];
	const pattern = detail
		.split(/(\{[^}]+\})/)
		.map((part) => {
			if (part.startsWith("{") && part.endsWith("}")) {
				names.push(part.slice(1, -1));
				return "([^/]+)";
			}
			return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		})
		.join("");
	const expression = new RegExp(`^${pattern}$`);
	return Object.freeze({
		resource,
		projectScoped,
		identityField: key,
		scope: (identity?: unknown) => {
			if (!isRecord(identity)) return identity;
			const scope = Object.fromEntries(
				Object.entries(identity).filter(([field]) => field !== key),
			);
			return Object.keys(scope).length ? scope : undefined;
		},
		path: (
			identity?: unknown,
			mode: "one" | "list" = identity === undefined ? "list" : "one",
		) =>
			(mode === "one" ? detail : collection).replace(
				/\{([^}]+)\}/g,
				(_match, field: string) => {
					const value = isRecord(identity) ? identity[field] : undefined;
					if (
						typeof value !== "string" ||
						!value ||
						value === "." ||
						value === ".."
					)
						throw new TypeError(`A ${resource} request requires ${field}.`);
					return encodeURIComponent(value);
				},
			),
		identity: (value: Values, requested?: unknown) => {
			const scope =
				typeof requested === "string"
					? { project: requested }
					: isRecord(requested)
						? requested
						: {};
			return Object.fromEntries(
				identityFields.map((field) => {
					const resolved =
						field === key ? value[field] : (scope[field] ?? value[field]);
					if (typeof resolved !== "string" || !resolved)
						throw new IncusProtocolError(
							`Incus omitted ${field} from a ${resource} representation.`,
						);
					return [field, resolved];
				}),
			);
		},
		parse: (source: string, project = "default") => {
			if (!source.startsWith("/1.0") || source.startsWith("//")) return;
			try {
				const url = new URL(source, "http://incus.invalid");
				const match = expression.exec(url.pathname);
				if (!match || url.origin !== "http://incus.invalid") return;
				const identity: Values = Object.fromEntries(
					names.map((name, index) => [
						name,
						decodeURIComponent(match[index + 1]),
					]),
				);
				for (const field of queryIdentityFields) {
					const value = url.searchParams.get(field);
					if (value !== null) identity[field] = value;
				}
				if (projectScoped)
					identity.project = url.searchParams.get("project") ?? project;
				if (
					Object.values(identity).some(
						(value) =>
							typeof value !== "string" ||
							!value ||
							value === "." ||
							value === "..",
					)
				)
					return;
				return { resource, identity };
			} catch {
				return;
			}
		},
	});
}

export function createReferenceParser(
	routes: readonly ResourceRoute[],
): ReferenceParser {
	const catalog = Object.freeze([...routes]);
	const parse: ReferenceParser = (source, project) => {
		for (const route of catalog) {
			const result = route.parse(source, project);
			if (result) return result;
		}
	};
	parse.route = (resource) =>
		catalog.find((route) => route.resource === resource);
	return parse;
}
