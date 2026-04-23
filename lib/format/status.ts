export type MatchStatus =
  | "scheduled"
  | "in_progress"
  | "finished"
  | "postponed"
  | "cancelled";

type StatusPresentation = {
  className: string;
  label: string;
};

const STATUS_PRESENTATION: Record<MatchStatus, StatusPresentation> = {
  cancelled: {
    className: "bg-red-100 text-red-800",
    label: "中止",
  },
  finished: {
    className: "bg-green-100 text-green-800",
    label: "終了",
  },
  in_progress: {
    className: "bg-yellow-100 text-yellow-800",
    label: "試合中",
  },
  postponed: {
    className: "bg-orange-100 text-orange-800",
    label: "延期",
  },
  scheduled: {
    className: "bg-slate-100 text-slate-700",
    label: "キックオフ予定",
  },
};

export function getStatusPresentation(status: MatchStatus): StatusPresentation {
  return STATUS_PRESENTATION[status];
}
