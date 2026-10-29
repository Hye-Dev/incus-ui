// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: Copyright (c) 2023 shadcn

import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
