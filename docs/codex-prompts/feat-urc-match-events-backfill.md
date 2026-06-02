# Codex プロンプト: URC イベント取り込み backfill（＋ SRP/LO/rwc URL 修正・fill-event-gaps 堅牢化）

`specs/feat-urc-srp-match-events.md` を実装してください。目的は **URC（United Rugby Championship）の終了試合にイベント（得点経過）を取り込み**、捏造対策で draft 降格された URC recap を再生成でクリーン復活させること。

## 背景（why）
- 本番実測（2026-06-02）: URC は終了試合155件中 **events 有が5件のみ（3%）**。汎用 `scripts/fill-event-gaps.ts`（vevent パーサ）を本実行しても URC は全件 `no events parsed`（premiership/SRP は回収成功、URC だけ取れない）。
- イベント源は Wikipedia の季節ページ（`2025–26 United Rugby Championship` 等）。**レギュラー戦の得点詳細はラウンド別の折りたたみテーブル**に存在する（汎用 vevent とは構造が異なる）。
- 既存の URC 専用パーサ `lib/scrapers/wikipedia-urc-match-details.ts` (`parseWikipediaUrcMatchDetailsHtml`) はあるが、**event_id の想定形式がDBの実データと食い違っており機能していない**（下記が核心バグ）。

## 核心バグ: event_id 形式の不一致
- `parseWikipediaUrcMatchDetailsHtml`（`lib/scrapers/wikipedia-urc-match-details.ts:57`）は `source.eventId` を **`^(Round_\d+)_(\d+)$`**（＝`Round_17_3` のようなラウンド＋数値インデックス）と想定し、ラウンドテーブル内の **N番目の試合**を index で特定している。
- だが本番 `matches.external_ids.wikipedia_event_id` の実値は **`Round_17_Glasgow_Warriors_v_Cardiff`（`Round_N_<home>_v_<away>`）**。正規表現に合わず即 `return { events: [], lineup: null }`。
- つまり**保存されている event_id（チーム名形式）から、ラウンドテーブル内の該当試合を「チーム名で」特定するように直す必要がある**（index 依存をやめる）。

## タスク
1. **実データ確認**: 代表 URC 試合の Wikipedia 季節ページ（例 `https://en.wikipedia.org/wiki/2025–26_United_Rugby_Championship`）の HTML 構造（`h3#Round_N` 見出し → `table.mw-collapsible` → 試合行/詳細行）と、`wikipedia_event_id` の実際の値（`Round_N_<home>_v_<away>`）を突き合わせて確認する。
2. **抽出の修正**: `Round_N` でラウンドテーブルを見つけるのは既存ロジックを流用しつつ、**該当試合をチーム名（event_id の `<home>_v_<away>` 部分、またはDBの home/away team 名）で特定**するよう `parseWikipediaUrcMatchDetailsHtml`（または抽出層）を改修。`parseMatchEventsFromUrcDetailRowHtml` の詳細行パース自体は流用可。
3. **backfill スクリプト**: `scripts/backfill-urc-match-events.ts` を新設（`scripts/backfill-premiership-match-events.ts` を雛形に）。URC の「events 無し終了試合」を対象に、季節ページを取得→該当試合の events を抽出→ `upsertMatchEvents` で冪等 upsert。同一季節ページは**キャッシュ/再利用**して取得回数を抑える。
4. **ゲート**: `--dry-run`（対象件数表示・書き込みなし）と `--confirm-owner-approved` を実装。
5. **過去シーズン対応**: URC は季節ごとに別 URL（`2024–25 United Rugby Championship` 等）。`external_ids.wikipedia_url` が各試合の正しい季節ページを指しているか確認し、ズレていれば対象から除外 or URL 補正方針を質問として残す。

## 併せて直す小項目（spec の他スコープ・任意だが同梱推奨）
- **SRP 残60件の URL 修正**: `wikipedia_url` が `2025_Super_Rugby_Pacific_season`（決勝のみ）や欠落の試合を **`List_of_<year>_Super_Rugby_Pacific_matches`** に修正（events は List ページにあり汎用パーサで取れることは実証済み）。修正後は既存 `fill-event-gaps.ts` で回収可能。
- **league-one 6件の URL 修正**: `external_ids.wikipedia_url` が **es.wikipedia（スペイン語版）** を指す → 英語版 Wikipedia に修正。
- **rwc 1件の URL 修正**: 404（`2023_Rugby_World_Cup_third-place_play-off`）→ 正しいページに。
- **`fill-event-gaps.ts` の堅牢化**: 1試合の fetch 失敗（404 等）で**全体が例外停止**する（今回 rwc 404 で停止）。当該試合を warn して skip し、処理を継続するよう try/catch を入れる。

## スクレイピング / コンプライアンス
- 取得は Wikipedia のみ。`lib/scrapers/fetcher.ts` の `fetchWithPolicy`（robots 準拠・レート制限）を必ず経由。User-Agent 偽装・rate limit 回避はしない。LLM は使わない（コスト無し）。

## 必ず処理すべきエッジケース
1. event_id がチーム名形式（`Round_N_A_v_B`）で正しく該当試合を特定できること（index 依存を残さない）。
2. 同じラウンドに同カードが複数（再戦）は無い前提でよいが、チーム名一致が複数ヒットしたら warn。
3. 季節ページに該当試合の詳細行が無い（未記載）→ events 0 で skip、エラーにしない。
4. 既に events のある試合は再取得しない（対象は events 無しのみ）。upsert は冪等。
5. fetch 失敗（404/タイムアウト）は当該試合 skip で継続。

## テスト
- `parseWikipediaUrcMatchDetailsHtml`（改修後）の**固定 HTML フィクスチャ**ユニットテスト: `Round_N_A_v_B` event_id で正しい試合の events（try/pen/con/dropgoal＋分＋選手＋チーム）を返す。複数試合を含むラウンドテーブルで正しい1試合を選ぶこと。
- 既存テストを壊さない。

## 完了の定義
- `scripts/backfill-urc-match-events.ts` が `--dry-run` / `--confirm-owner-approved` で動作。
- ローカル/ステージング（or Owner 承認の本番）で実行後、**URC 終了試合の events 取り込み率が 3% → 80%+** に上がる見込み。
- SRP/LO/rwc の URL 修正と fill-event-gaps の 404 堅牢化を実施。
- `pnpm typecheck` / `pnpm build` / `pnpm test`（全件）グリーン。
- 変更ファイル・確定した event_id 形式の扱い・残課題・未解決質問を末尾に要約。

## 完了時に報告してほしいこと
- 改修した URC 抽出ロジックの要点（チーム名一致の方法）。
- backfill 実行で URC が何件埋まったか（dry-run 件数）。
- SRP/LO/rwc の URL 修正件数。

## Owner 側の後続（このプロンプトの対象外）
backfill 後、Owner が `scripts/regenerate-overseas-content.ts --content-type recap --match-ids-file ./fabricated-ids.txt --confirm-owner-approved` を再実行 → events を得た URC 試合の draft 捏造 recap がクリーン published に復活。検証は published の捏造マーカー=0 維持。
