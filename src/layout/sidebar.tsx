// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarNavigation,
} from "@hyecompany/vem-ui";
import {
	IconArrowsHorizontal,
	IconBucket,
	IconCube3dSphere,
	IconDatabase,
	IconDisc,
	IconRectangularPrism,
	IconSelectAll,
	IconServer,
	IconSquaresSelected,
} from "@tabler/icons-react";
import { Link, useMatchRoute } from "@tanstack/react-router";
import logo from "@/assets/logo.svg";

const navItems = {
	primary: [
		{
			title: "Instances",
			route: "/instances",
			icon: IconSelectAll,
		},
		{
			title: "Networks",
			route: "/networks",
			icon: IconArrowsHorizontal,
		},
		{
			title: "Storage Pools",
			route: "/storage-pools",
			icon: IconDatabase,
			subItems: [
				{
					title: "Volumes",
					route: "/storage/volumes",
					icon: IconRectangularPrism,
				},
				{ title: "Buckets", route: "/storage/buckets", icon: IconBucket },
				{ title: "ISOs", route: "/storage/isos", icon: IconDisc },
			],
		},
		{
			title: "Images",
			route: "/images",
			icon: IconCube3dSphere,
		},
		{
			title: "Profiles",
			route: "/profiles",
			icon: IconSquaresSelected,
		},
		// TODO: Display when clustered (#5)
		/*
		{
			title: "Servers",
			route: "/servers",
			icon: IconServer,
		},
        */
	],
	// TODO: Change to "Cluster" with IconHexagons when clustered (#5)
	secondary: [{ title: "Server", route: "/settings", icon: IconServer }],
};

function SidebarLinks({
	items,
	label,
}: {
	items: typeof navItems.primary;
	label: string;
}) {
	const matchRoute = useMatchRoute();
	return (
		<SidebarNavigation
			aria-label={label}
			items={items.map((item) => ({
				key: item.route,
				label: item.title,
				icon: <item.icon aria-hidden="true" />,
				render: <Link to={item.route} />,
				isActive: !!matchRoute({ to: item.route, fuzzy: false }),
				children: item.subItems?.map((child) => ({
					key: child.route,
					label: child.title,
					icon: <child.icon aria-hidden="true" />,
					render: <Link to={child.route} />,
					isActive: !!matchRoute({ to: child.route, fuzzy: false }),
				})),
			}))}
		/>
	);
}

export function UiSidebar() {
	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader>
				<div className="flex w-full">
					<img
						src={logo}
						alt="Linux Containers logo"
						className="group-data-[collapsible=icon]:w-8 w-10 shrink-0 transition-all duration-220 ease-[cubic-bezier(0.22,1,0.36,1)]"
					/>
					<p className="group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:ml-0 max-w-40 overflow-hidden opacity-100 transition-all duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] my-auto ml-3 text-xl font-semibold whitespace-nowrap">
						Incus UI
					</p>
				</div>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarLinks label="Main navigation" items={navItems.primary} />
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter className="p-0">
				<SidebarGroup>
					<SidebarLinks
						label="Settings navigation"
						items={navItems.secondary}
					/>
				</SidebarGroup>
			</SidebarFooter>
		</Sidebar>
	);
}
