// SPDX-FileCopyrightText: © 2026 Joseph Maldjian <joseph.maldjian@hyecompany.com>
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_ui/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
        <p>Root Dashboard Placeholder</p>
  )
}
