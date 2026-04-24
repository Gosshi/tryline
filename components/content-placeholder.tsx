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

export function ContentPlaceholder({ state, type }: ContentPlaceholderProps) {
  return <p className="text-sm text-slate-500">{COPY[type][state]}</p>;
}
