type ContentPlaceholderProps = {
  type: "preview" | "recap";
  state: "pre_window" | "preparing" | "unavailable";
};

const COPY: Record<
  ContentPlaceholderProps["type"],
  Record<ContentPlaceholderProps["state"], string>
> = {
  preview: {
    pre_window: "プレビューは試合開始 48 時間前に公開予定",
    preparing: "プレビューを準備中です",
    unavailable: "このプレビューは公開されませんでした",
  },
  recap: {
    pre_window: "レビューは試合終了 1 時間後に公開予定",
    preparing: "レビューを準備中です",
    unavailable: "このレビューは公開されませんでした",
  },
};

const ICON: Record<ContentPlaceholderProps["state"], string> = {
  pre_window: "🕐",
  preparing: "⏳",
  unavailable: "—",
};

export function ContentPlaceholder({ state, type }: ContentPlaceholderProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-4">
      <span
        aria-hidden
        className="mt-0.5 shrink-0 text-lg leading-none"
        role="img"
      >
        {ICON[state]}
      </span>
      <p className="text-sm text-slate-500">{COPY[type][state]}</p>
    </div>
  );
}
