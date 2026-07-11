# 注目大会をPNC 2026からNations Championship 2026へ一時切替

## 背景

2026-07-11、`lib/featured-competition.ts`の`FEATURED_COMPETITION`定数は`family: "pnc"`固定になっている。この選定は`specs/feat-home-matchday-board.md`作成時点（2026-07-08）のGSC実績（PNCが唯一クリックの出ていた大会）に基づく合理的な判断だったが、同specの「未解決の質問」で「PNC 2026終了後に手動で定数を書き換える想定でよいか」という運用課題が残されたまま、開幕前（次戦2026-09-12、レビュー0本）の状態で長期間表示され続けていた。

Codexの調査で、ホームの目的（「今週の海外ラグビーを追う」）との整合を優先し、**現在開催中のNations Championship 2026へ一時的に切り替え、PNC開幕（2026-09-12）の約4週間前に戻す**運用が推奨された。PNCのSEO実績（大会アーカイブ・ヘッダーメニュー・フッター等から既にリンクされている）は注目大会から外れても損なわれない。

本specは恒久的な自動選択の仕組み（別spec `feat-featured-competition-auto-selection.md`で対応予定）ではなく、**まず今すぐの手動切替のみ**を対象とする。

## スコープ

対象:
- `lib/featured-competition.ts`の`FEATURED_COMPETITION`定数を、`family: "nations-championship"`・`season: "2026"`に変更する
- `headline`・`description`をNations Championship 2026向けの文言に更新する（例: `headline: "ネーションズチャンピオンシップ 2026 を追う"`）
- 大会画像アセットについて、Nations Championship専用のものが無ければ既定画像にフォールバックする（既存の画像解決ロジックがどう動くか確認し、専用画像が無い場合の見た目が破綻しないことを確認する）

対象外:
- 期間指定の自動切替・複数選定ルールの実装（別spec `feat-featured-competition-auto-selection.md`の対象）
- Nations Championship専用の新規画像アセットの作成（既定画像で代替する）

## UI サーフェス

`lib/featured-competition.ts`の定数変更のみ。呼び出し元（`app/page.tsx`・`components/featured-competition-card.tsx`）のロジック自体は変更しない。

## 受け入れ条件

1. ホームページの「注目大会」セクションが、Nations Championship 2026を表示する（次戦・レビュー本数・今週の試合数がNCの実データで表示される）
2. `headline`・`description`がNations Championship向けの内容に更新されている
3. 大会画像が破綻しない（専用画像が無い場合、既定画像で正しく表示される）
4. 「大会ページを見る」リンクが正しくNations Championship 2026のシーズンページに遷移する
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本番デプロイ前に実際のブラウザでスクリーンショットを確認する。本番デプロイ自体はOwner承認後に別途行う

## 未解決の質問

- なし（シンプルな定数差し替えのため）
