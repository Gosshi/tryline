`/specs/fix-interactive-press-feedback.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象8ファイルは仕様書のスコープ節に列挙済み（`components/ui/button.tsx`、`components/match-card.tsx:34`、`components/match-header.tsx:162`、`components/match-chat.tsx:304`、`app/page.tsx:458,513,551`、`app/c/[competition]/page.tsx:135`）
- 各ファイルの既存 `hover:` クラス（`hover:-translate-y-0.5` 等）はそのまま維持し、`active:scale-[0.98]` を追加するだけの変更

入出力の例:
- 変更前（`components/match-card.tsx:34`）: `className="... transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_10px_18px_rgb(15_23_42/0.10)]"`
- 変更後: 末尾に ` active:scale-[0.98]` を追加するのみ
- `components/ui/button.tsx` は `transition-colors` を `transition-all` に変更した上で `active:scale-[0.98]` を base クラスに追加

処理すべきエッジケース:
- 8ファイル以外への変更は行わない（本specは限定スコープの修正であり、サイト全体の網羅的なhover改修ではない）
- 既存の `hover:` の見た目（translate-y、shadow、border色）に変化がないこと（`active:scale-[0.98]` の追加のみ）
- `components/ui/button.tsx` の `transition-colors` → `transition-all` 変更により、他のtransition対象プロパティ（色以外）が意図せずアニメーションし始めないか確認する

完了の定義:
- specs の受け入れ条件5項目すべてを満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 8ファイルそれぞれの変更箇所を diff で提示する

要件:
- 受け入れ条件セクションのすべてを実装する
- 「対象外」にある項目は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
