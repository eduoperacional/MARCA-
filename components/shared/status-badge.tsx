import { Badge } from "@/components/ui/badge"
import { APPOINTMENT_STATUS } from "@/lib/appointment-status"
import type { AppointmentStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export function StatusBadge({ status, className }: { status: AppointmentStatus; className?: string }) {
  const meta = APPOINTMENT_STATUS[status]
  return (
    <Badge variant="outline" className={cn("border-transparent", meta.badgeClass, className)}>
      {meta.label}
    </Badge>
  )
}
