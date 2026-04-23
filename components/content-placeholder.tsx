import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ContentPlaceholderProps = {
  type: "preview" | "recap";
};

const COPY = {
  preview: {
    body: "プレビューは試合開始 48 時間前に公開予定",
    title: "プレビュー",
  },
  recap: {
    body: "レビューは試合終了 1 時間後に公開予定",
    title: "レビュー",
  },
} as const;

export function ContentPlaceholder({ type }: ContentPlaceholderProps) {
  const copy = COPY[type];

  return (
    <Card className="border-dashed border-slate-300 bg-slate-50/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{copy.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-slate-500">{copy.body}</p>
      </CardContent>
    </Card>
  );
}
