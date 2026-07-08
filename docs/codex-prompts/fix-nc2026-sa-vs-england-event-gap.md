`/specs/fix-nc2026-sa-vs-england-event-gap.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象試合: 南アフリカ vs イングランド（match_id: `b5b2af27-4b42-4d58-8ea9-f13d1e2b1466`、Nations Championship 2026、実スコア45-21）
- 既存のガード付き再取り込みスクリプトは `scripts/backfill-nations-championship-match-events.ts`。他5試合（Round1の残り）は既にこのスクリプトで正しく再取り込み済み。この試合だけ再パース結果が45-19（2点不足）でガードにスキップされ続けている
- 現状、この試合の `match_events` は New Zealand vs France 戦（match_id: `e13e388d-f870-4a27-bea5-e4ba3ef08d28`）のイベントと完全一致（byte-for-byte）している。汚染データのまま

入出力の例:
- 修正後、`match_events WHERE match_id = 'b5b2af27-...'` から `pointsForMatchEvent`（`lib/format/match-event-points.ts`）で集計したホーム/アウェイ合計が 45/21 と一致する
- 選手名が Du Toit・Kolbe 等の実際の南アフリカ・イングランド代表になり、Penaud・Lucu・Jordan 等の NZ/フランス選手が残っていない

処理すべきエッジケース:
- 2点分の欠損がWikipediaソース側の記述漏れなのか、パーサーの走査漏れなのかをまず切り分ける。ソース自体に記載が無い場合は、他の信頼できる情報源での補完が必要になる可能性がある（`p1-scraping-infra.md` の robots.txt 遵守方針の範囲内で。判断に迷う場合は実装を止めて質問リストに書く）
- 再取り込み後、この試合の recap が `published` 状態か確認し、あれば `content-regen` スキルの手順（この1試合のみの単発再生成、一括実行はしない）で再生成する
- 既存の恒久ガード（イベント合計とスコアの整合チェック）のロジック自体は変更しない

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean（スクリプト変更を伴う場合）
- 再取り込み前後の `match_events` の差分と、recap再生成の有無・結果を完了報告に明記する

要件:
- 「スコープ対象外」（ガードロジックの変更、他5試合、パーサーの全面再設計）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
