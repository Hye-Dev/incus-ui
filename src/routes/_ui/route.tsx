// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Outlet } from '@tanstack/react-router'
import { View } from '@/components/layout/view'
import { UiSidebar } from '@/components/navigation/sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export const Route = createFileRoute('/_ui')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <SidebarProvider defaultOpen={false} style={{
        '--header-height': 'calc(var(--spacing) * 12)', // Maybe increase back to 12 (Hye Ararat)
    } as React.CSSProperties}>
        <UiSidebar />
            <SidebarInset>
                <View>
                    <Outlet />
                </View>
            </SidebarInset>
    </SidebarProvider>
  )
}
