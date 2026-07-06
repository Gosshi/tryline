# fix-nations-championship-event-contamination

## 背景

2026-07-06、Owner から「アルゼンチン戦の記事」の勝敗記述矛盾（`fix-recap-winner-attribution-consistency` / #478）を再生成した際、実行ログに `[score-integrity] event total mismatch`（`lib/llm/pipeline.ts:122`）が出力された。調査の結果、**単なるイベント欠落ではなく、Nations Championship 2026 の Round 1・finished 6試合すべてが完全に同一の18イベントを共有している**ことが判明した。

### 確認済み事実（本番 Supabase 実測）

| 試合 | 実スコア | イベント集計スコア |
|---|---|---|
| Argentina v Scotland | 38–47 | 34–32（不一致） |
| Australia v Ireland | 31–33 | 34–32（不一致） |
| Fiji v Wales | 24–39 | 34–32（不一致） |
| South Africa v England | 45–21 | 34–32（不一致） |
| **New Zealand v France** | **34–32** | **34–32（一致）** |
| Japan v Italy | 27–10 | 34–32（不一致） |

- 6試合とも `match_events` が18件・home合計34点/away合計32点で完全一致。34–32は実在の「New Zealand v France」戦の実スコアそのもの。
- 得点者名（`metadata.player_name`）も6試合で共通: home側=Jordan, Roigard, Love, Lakai（現ニュージーランド代表選手）、away側=Penaud, Lucu, Jalibert, Hastoy, Attissogbe（現フランス代表選手）。`team_id` だけがそれぞれの試合の実チームに差し替えられている。
- 6試合分の `match_events` 挿入は `2026-07-05 07:07:28〜07:07:43 UTC` の15秒間に連続して行われており（`created_at` 実測）、単一スクリプト実行に由来する。
- 疑わしい実行元: `scripts/backfill-nations-championship-match-events.ts`。`buildEventMatchLookup`（同ファイル L86-101）が Wikipedia パース結果を `home-slug:away-slug` でキー化し、`runBackfillNationsChampionshipMatchEvents`（L157-193）が本番 `matches` テーブルの6試合それぞれに対してこの Map から `eventMatch` を引き当て、`parseMatchEventsFromVeventHtml(eventMatch.rawHtml)` を呼んでいる。6試合すべてが同一の `rawHtml`（New Zealand v France のブロック）を参照した可能性が高い。
- パース経路: `lib/ingestion/sources/wikipedia-nations-championship-events.ts` → `parseWikipediaSixNationsHtml`（`lib/ingestion/sources/wikipedia-six-nations.ts`）→ `parseMatchEventsFromVeventHtml`（`lib/scrapers/wikipedia-match-events.ts`）。この解析チェーンは元々「クラシックな Six Nations」ページ構造向けに作られたもので、2026年新設の Nations Championship（Southern/Northern Hemisphere Series の2ページ構成）で同じ DOM 構造が成立するかは未検証。
- 影響を受けた5試合（New Zealand v France を除く全て）の recap は現在も `status='published'` で公開中。本文が他国選手の得点シーンを実際の対戦国の選手として誤って描写している（実インシデント: Argentina v Scotland の recap 本文が「ジャック・ジャリベールの78分決勝トライ」とスコットランドの得点として記述。Jalibert は現フランス代表選手）。
- `components/match-events-section.tsx` の「得点推移」セクションも `match_events` を直接描画するため、同じ誤情報がページ上に表示されている。
- 試合ページ上部の最終スコア表示（`matches.home_score` / `away_score`）はこの汚染の影響を受けておらず正確。
- 類似の過去インシデント: `specs/fix-contaminated-match-events.md`（2026-06-11、Autumn Nations/SRP で別原因によるイベント汚染）。今回は原因スクリプト・データソースが異なる新規事象。
- 既存のガード: `lib/llm/pipeline.ts:108-140`（`fix-score-event-integrity-check.md` で導入済み）は生成時にスコア不一致を `console.warn` するのみで**生成・公開をブロックしない**。今回の再生成でもこのガードは発火したが recap は published のまま出力された。

## スコープ

対象:
- `scripts/backfill-nations-championship-match-events.ts` の team-pair 引き当てロジックの原因究明と修正
- 上記チェーン（`wikipedia-nations-championship-events.ts` / `wikipedia-six-nations.ts` / `wikipedia-match-events.ts`）のうち、Nations Championship 固有ページ構造に起因する箇所の修正
- 汚染済み5試合の `match_events` のクリーンアップと正しいデータでの再取り込み
- 挿入経路（バックフィル/バッチ取り込み）に対する恒久的な汚染防止ガードの追加

対象外:
- `fix-recap-winner-attribution-consistency`（#478）で対応済みの勝敗記述ガード自体の変更
- `lib/llm/pipeline.ts` の生成時 `score-integrity` チェックを「常にブロッキングにする」全面変更（既存の全大会・全試合への影響が大きいため、今回は Nations Championship の取り込みスクリプト側のガード追加に限定。生成パイプライン全体をブロッキングにするかは別途 Owner 判断・別 spec 候補として「未解決の質問」に記載）
- 汚染済み5試合の recap 本文の手修正（イベント修正後の再生成で対応）
- New Zealand v France の recap・イベント（汚染の影響を受けていないため対象外）

## データモデル変更

なし（既存 `match_events` テーブルの行を削除・再挿入するのみ。スキーマ変更不要）。

## 調査手順（Codex 実施）

1. `scripts/backfill-nations-championship-match-events.ts` を `--dry-run` で実行し、`buildEventMatchLookup` が返す Map の中身をデバッグ出力（各エントリの `homeTeamSlug`/`awayTeamSlug` と `rawHtml` の長さ・先頭200文字 or ハッシュ）で確認する。6試合分のキーがそれぞれ異なる `rawHtml` を指しているか、それとも全キーが同一の `rawHtml`（New Zealand v France 由来）を指しているかを特定する。
2. 上記で「全キーが同一 rawHtml を指す」場合、`fetchNationsChampionship2026EventMatches()`（`wikipedia-nations-championship-events.ts`）が返す `ParsedLiveMatch[]` 自体を確認する。`parseWikipediaSixNationsHtml` が Southern/Northern Hemisphere Series の各ページから何件・どのチームペアの `ParsedLiveMatch` を生成しているかを出力し、以下を切り分ける:
   - (a) 各試合が正しいチームペアで個別に検出されているが `rawHtml`（`$.html(block)`）の中身が誤って同一ブロックを指している（`parseVeventBlock` 内の `block` 参照や `tables.eq(0)/eq(1)` の対象選択ミス）
   - (b) `#Fixtures` セクション探索やラウンド見出し (`h3`) の走査 (`processFixtureElement` / `cursor.next()`) が、2026年新設ページの DOM 構造（クラシックな Six Nations ページと異なる可能性）に対応できておらず、実質1ブロックしか正しく分離できていない
   - (c) `buildTeamPairKey` に渡る `homeTeamSlug`/`awayTeamSlug` が `mapWithTeamSlugs`（`TEAM_SLUG_BY_WIKIPEDIA_NAME`）の変換で複数試合が同じ値に丸められている
3. 実際の Wikipedia ページ（`NATIONS_CHAMPIONSHIP_SOUTHERN_HEMISPHERE_URL` / `NORTHERN_HEMISPHERE_URL`）の DOM 構造を目視確認し、想定している `div.vevent.summary` ブロック構造・`tr[style*="font-size:85%"]` 行が実際に試合ごとに存在するか確認する。

## 恒久対策（実装必須）

`scripts/backfill-nations-championship-match-events.ts`（および将来同種のバックフィル/バッチ取り込みスクリプト全般に適用できる形が望ましいが、今回は最低限このスクリプトに実装）に、**挿入前の決定的ガード**を追加する:

```typescript
// upsertMatchEvents 呼び出し前に追加
const totals = computeEventPointTotals(events); // try=5, conversion=2, penalty_goal=3, drop_goal=3
if (totals.home !== match.home_score || totals.away !== match.away_score) {
  skipped += 1;
  console.warn(
    `[skip] ${label}: event totals (${totals.home}-${totals.away}) do not match final score (${match.home_score}-${match.away_score})`,
  );
  continue;
}
```

このガードは「イベント合計と最終スコアが一致しない限り DB に書き込まない」という決定的な水際防止であり、`lib/llm/pipeline.ts` の生成時警告（事後検知のみ）とは別レイヤーで機能する。`computeEventPointTotals` は新規のテスト可能な純関数として実装し、`lib/llm/stages/assemble.ts` の得点定義（try/conversion/penalty_goal/drop_goal の配点）と重複しないよう、可能であれば既存の得点計算ロジックを再利用する（`computeScoreTimeline` や `pointsForEvent` の共有を検討。参照: `lib/llm/stages/assemble.ts`）。

## 汚染データのクリーンアップ

`upsertMatchEvents`（`lib/ingestion/events.ts` L60-）は `match_id` 単位で既存イベントを削除してから挿入する replace 方式のため、根本原因を修正した上で対象5試合に対して `--reparse-existing` 付きで再実行すれば自動的に汚染データは置き換わる。ただし以下を実行手順として明記する:

```bash
# 1. 修正後、対象6試合(NZ v Franceも含めて再検証のため)を dry-run で確認
node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-match-events.ts --reparse-existing --dry-run

# 2. 各試合のイベント合計が実スコアと一致することを出力で確認してから本実行
node --env-file=.env.production.local tools/run-ts.cjs scripts/backfill-nations-championship-match-events.ts --reparse-existing --confirm-owner-approved
```

万一 dry-run で一部試合が「引き当てられない（no unique event block found）」場合は、無理に部分一致で解決せず `null`（スキップ）を維持すること（`feat-anchorless-event-block-selection` と同じ方針: 推測で選ばない）。

## recap の扱い（Owner 未確定事項）

汚染済み5試合（Argentina v Scotland / Australia v Ireland / Fiji v Wales / South Africa v England / Japan v Italy）の recap は現在 `published` で公開中。以下いずれかを Owner が選択する:

- (A) イベント修正・再取り込みが完了するまで一時的に `draft` へ降格する（`content-regen` skill の precedent と同様の手当て。誤った選手名での公開を即座に止められるが、待機中は recap が非表示になる）
- (B) 何もせず、イベント修正完了後にまとめて再生成する（対応完了まで誤情報が公開され続けるリスクを許容）

いずれを選んでも、イベント修正・再取り込み完了後は5試合分の recap 再生成が必要（`content-regen` skill の手順に従い、まず1件で試し焼き→検品→残り4件）。

## 受け入れ条件

1. `computeEventPointTotals`（またはそれに相当する新規純関数）: 一致するイベント配列を渡すと `{home, away}` が実スコアと一致し、不一致な配列では不一致な値を返す（単体テスト）
2. `scripts/backfill-nations-championship-match-events.ts` の挿入前ガード: イベント合計と最終スコアが不一致な場合、`upsertMatchEvents` が呼ばれず `skipped` カウントが増える（単体テスト、モックした `eventMatch` で確認）
3. 修正後の `--dry-run` 実行で、Nations Championship 2026 の finished 6試合それぞれについて「イベント合計 = 実スコア」が成立するもの（少なくとも New Zealand v France を含む）を正しく識別できる
4. 修正後の本実行後、対象6試合の `match_events` を SQL で再集計し、各試合の home/away 合計点が `matches.home_score`/`away_score` と一致することを確認する（Owner 実行・検証手順として明記）
5. 汚染していた5試合について、得点者名が実際の対戦国籍の選手名（DB上の `metadata.player_name`）に置き換わっていることを目視確認する
6. `pnpm test`・`pnpm tsc --noEmit` が通る

## 未解決の質問

- `lib/llm/pipeline.ts` の生成時 `score-integrity` チェックを常時ブロッキング（`skipped` 扱いにして draft に落とす等）に格上げするかどうかは、全大会・全試合への影響範囲が今回のスコープと異なるため Owner 判断待ち。別 spec 候補として検討する。
- 汚染済み5試合の recap を修正待ちの間 `draft` に降格するか（上記「recap の扱い」参照）は Owner 判断待ち。
- 今回のバックフィルスクリプト固有のガードを、他の Wikipedia ベースのバッチ取り込みスクリプト（`fill-event-gaps.ts` 等）にも横展開するかは、今回の原因特定結果を見てから追加判断する。
