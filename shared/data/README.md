<!-- SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com> -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Incus data definitions

Add resource contracts and URL rules under `src/resources/`, with tests in `tests/resources/`. Define only fields needed by the application or established by responses we already consume. For example, project `used_by` URLs establish related resource identities, not their details, read permissions, or complete collections.

Keep small models, field lists, and consumer read rules together in `contract.ts`; put owner acquisition in `definition.ts`. Split events or commands when they need their own implementation. `src/internal/` holds cross-resource Incus rules, grouped by identity, access, acquisition, and events.

When extending a resource, update its acquisition, lifecycle-event, and access rules together. Default selections should cover its ordinary display fields; select relationships explicitly. Test the facts established and request counts, including partial cluster responses and permission changes.

Consumers use `src/index.ts`; hosts use `runtime.ts` and `read-definitions.ts`. `definition-authoring.ts` exposes shared Incus identity and access helpers for additional resources, while `scenarios.ts` supplies development scenarios. These are local source entry points, not separately published packages.

`createIncusRuntime` waits for its initial `/1.0` discovery attempt. Failure is reported to `onError` and leaves access unknown; later demand or `refreshAccess()` can retry. Its `readTimeoutMs` applies to discovery and resource reads, including response bodies. Hosts composing definitions themselves need only a transport and `refreshAccess` callback; they own access transitions and event continuity.

Additional resources should share one `createReadDefinition` between their owner definition and the browser's `readDefinitions` array. Wrap source reads with `withReadDeadline(services.readTimeoutMs, context.signal, read)` and pass its signal to the transport; raw requests and streams have no automatic deadline. Use `projectLiveness` only for values the definition updates or invalidates from those projects' events. Independent hosts can publish continuity through `eventTransport` and `projectContinuity`. The [extension integration test](tests/runtime/extensions.test.ts) uses a simulated resource to exercise registration, local client reads, and revalidation after an event gap through public APIs.

The transport types cover the full upstream API independently of these resource definitions. Regenerate them from the repository root with `npm run generate:incus-types`; do not edit `src/transport/generated/` by hand.
