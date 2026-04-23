import { getStatusPresentation, type MatchStatus } from "@/lib/format/status";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: MatchStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const presentation = getStatusPresentation(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        presentation.className,
      )}
    >
      {presentation.label}
    </span>
  );
}
