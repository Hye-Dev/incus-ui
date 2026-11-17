// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	Component,
	createContext,
	type ReactNode,
	Suspense,
	use,
	useContext,
	useState,
} from "react";
import { ViewHeader } from "../../../src/layout/view.tsx";

const RouteName = createContext("Missing route provider");

export class RouteBoundary extends Component<
	{ children: ReactNode },
	{ error: Error | null }
> {
	state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	render() {
		return this.state.error ? (
			<p role="alert">{this.state.error.message}</p>
		) : (
			this.props.children
		);
	}
}

function HeaderCounter() {
	const name = useContext(RouteName);
	const [count, setCount] = useState(0);
	if (name === "broken") throw new Error("Route header failed");
	return (
		<button
			type="button"
			aria-label="Header state"
			onClick={() => setCount((value) => value + 1)}
		>
			{name}: {count}
		</button>
	);
}

function DelayedHeader({ pending }: { pending: Promise<void> }) {
	use(pending);
	return <span>Loaded header</span>;
}

export function RouteContent({
	pendingHeader,
}: {
	pendingHeader: Promise<void>;
}) {
	const [name, setName] = useState("Instances");
	const [details, setDetails] = useState(false);
	const [waiting, setWaiting] = useState(false);
	return (
		<RouteName.Provider value={name}>
			<ViewHeader>
				<HeaderCounter />
			</ViewHeader>
			{details && (
				<ViewHeader>
					<span>Instance details</span>
				</ViewHeader>
			)}
			{waiting && (
				<Suspense fallback={<p>Header is waiting</p>}>
					<ViewHeader>
						<DelayedHeader pending={pendingHeader} />
					</ViewHeader>
				</Suspense>
			)}
			<button type="button" onClick={() => setName("Containers")}>
				Change route context
			</button>
			<button type="button" onClick={() => setDetails((value) => !value)}>
				Toggle child route
			</button>
			<button type="button" onClick={() => setName("broken")}>
				Fail route header
			</button>
			<button type="button" onClick={() => setWaiting(true)}>
				Wait for header
			</button>
		</RouteName.Provider>
	);
}
