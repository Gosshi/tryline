# fix-mobile-ios-audit-findings-batch2: iOS自律監査で確認したUI不具合(束2)

対象リポジトリ: **tryline-mobile**。`fix-mobile-ios-audit-findings-batch1` の後続。

## 背景

2026-07-23、mobile-mcp(iOS Simulator を実際に操作する MCP サーバー)を使った自律型 UI 監査(Claude Fable)の指摘のうち、ソースコード・本番 DB で裏取りが取れた 4 件を修正する。監査自体には誤診断(大会一覧のマストヘッド欠如。実際は存在)も含まれていたため、本 spec は確認済みの項目のみを対象にする。

## スコープ

対象:

1. **週送り時に eyebrow・ストーリー見出しが固定文字列**: `app/(tabs)/index.tsx` の `Screen` `eyebrow="THIS WEEK"` と、`src/stories/MatchStoriesSection.tsx` の「今週のマッチストーリーズ」見出し(3箇所)が `weekOffset` に関わらず固定。`title` は `fix-mobile-ios-audit-findings-batch1` で既に週対応済みだが、同じ画面内のこの2箇所が取り残されている
2. **マッチカードの a11y ラベル欠如**: `src/components/MatchCard.tsx` のカード全体を覆う `SpringPressable testID="match-card-pressable"` に `accessibilityRole` / `accessibilityLabel` が設定されていない。このリポジトリの他の主要 Pressable(出典リンク・大会詳細の戻るボタン・イベント開示ボタン等)はいずれも明示しているが、ここだけ欠けている
3. **イベント種別の英語生値表示**: `src/matches/MatchDetailScreen.tsx` のイベントタイムラインが `event.type`(`"try"`、`"penalty_goal"` 等)をそのまま表示している
4. **順位表プール見出しの英語生値表示**: `app/(tabs)/competitions/[slug].tsx` が `pool.pool_name` をそのまま表示している。本番 DB 実測で確認済み: ネーションズチャンピオンシップ2026の `competition_pools.pool_name` には文字通り `"Northern Hemisphere"` / `"Southern Hemisphere"` が入っている

対象外:
- **大会一覧タブのマストヘッド欠如**: 監査の誤診断。`app/(tabs)/competitions/index.tsx` は `<Screen eyebrow="Competitions" title="大会">` を既に持っている
- **空状態 CTA「翌週を見る」の閑散期挙動**: バグではない。実際に試合がない期間の仕様通りの挙動。コピー・導線の改善は別途 Owner が判断する(本 spec では扱わない)
- **順位表の国名行タップ・空状態メッセージ不整合**: `fix-mobile-ios-audit-findings-batch1` で既に対象外として記録済み。引き続き未対応
- **マッチストーリーの文体揺れ・段落記法(`###`・`>`)未定義スタイル・遷移時の白フレーム・プレビュー本文の断ち切り・自動送りが出典リンク操作中も止まらない件**: コンテンツパイプライン側の対応が必要、または裏取りが未完了のため本 spec では扱わない。別途調査してから spec 化するかは Owner が判断する

## UI サーフェス(修正内容)

1. **週見出しの統一**: `app/(tabs)/index.tsx` で既に算出している週ラベル(先週/今週/来週)を `Screen` の `eyebrow` と `MatchStoriesSection` のセクション見出しにも適用する。`MatchStoriesSection` は `weekFrom` prop を既に受け取っているためそれを使うか、新たに週ラベル用の prop を追加するかは Codex の裁量。3状態(先週/今週/来週)で文言を出し分ける
2. **マッチカードの a11y**: `MatchCard.tsx` の `SpringPressable` に `accessibilityRole="button"` と、対戦内容を要約した `accessibilityLabel`(例: 「{home}対{away}、{日時}、{ステータス}」)を追加する。ネタバレガードでマスク中は結果を含めない要約にする(スポイラーガードとの整合性を保つ)
3. **イベント種別の日本語化**: `src/api/labels.ts` の `matchStatusLabel` と同じパターン(`Record<string, string>` + 未知の値はフォールバックでそのまま表示)で、イベント種別用のラベル関数を追加し `MatchDetailScreen.tsx` に適用する。マッピング対象は `match_events` テーブルの実データに存在する値を洗い出し、少なくとも試合結果に関わる主要な種別(トライ・ゴール・カード等)を網羅する
4. **プール見出しの日本語化**: 同じパターンでプール名用のラベル関数を追加し `[slug].tsx` に適用する。少なくとも `"Northern Hemisphere"` → 「北半球」、`"Southern Hemisphere"` → 「南半球」を含める。他の値は未知の値としてフォールバックでよい

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `weekOffset` が -1 / 0 / 1 のそれぞれで、`Screen` の eyebrow と `MatchStoriesSection` のセクション見出しが週に対応した文言になることを確認するテスト
2. `MatchCard` の Pressable に `accessibilityRole="button"` と試合内容を含む `accessibilityLabel` が設定されていることを確認するテスト。ネタバレガード有効時はラベルに結果が含まれないことも確認する
3. 既知のイベント種別(トライ等)が日本語ラベルで表示され、未知の値は元の文字列がそのまま表示される(フォールバック)ことを確認するテスト
4. `pool_name` が `"Northern Hemisphere"` / `"Southern Hemisphere"` のとき日本語で表示され、未知の値は元の文字列がそのまま表示されることを確認するテスト
5. TypeScript strict・lint・test green
6. **Owner 目視**: 実機または iOS Simulator で週送り・マッチカードの VoiceOver ラベル・イベントタイムライン・順位表グループ見出しを確認する

## 未解決の質問

- イベント種別マッピングの網羅率(既存データにどんな値が存在するか)は、Codex が `match_events` の実データを確認して洗い出す。本仕様書は代表例のみ提示している
- マッチカードの `accessibilityLabel` の具体的な文言は Codex の裁量とし、既存の `matchStatusLabel` 等の表現規約に合わせる
