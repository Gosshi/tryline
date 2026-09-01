# Codex 指示書: 大会ハブの開幕前表示とラウンドフィルタの修正

仕様書: `specs/fix-hub-preseason-standings-and-round-filter.md`

**先にこの spec を最後まで読んでから着手してください。** 以下は補足で、spec の内容を繰り返しません。

## 期限

**2026-09-25 の URC / プレミアシップ開幕まで。** それ以降は本番で誤情報が出続けます。

## なぜ急ぐか（1行）

`/c/urc/2026-27` が今この瞬間、1試合も行われていないのに「首位 ベネトン」と表示しています。

## 触るファイル

| ファイル | 何をするか |
|---|---|
| `app/c/[competition]/[season]/page.tsx` | `seasonNotStarted` 判定の導入。`leaderLabel`(:500-511) / `hasStandings`(:575-577) / `seasonFaqs`(:553-560) / ページ内ナビ / `#standings` 節(:848-866) を分岐 |
| `components/season-match-groups.tsx` | `ROUND_FILTERS`(:22-29) 廃止、`showRoundFilter`(:120) の条件差し替え、`filterGroupsByRound`(:401-422) の見直し、0件時の空状態追加 |
| `app/c/rwc/2027/page.tsx` | `PoolTeamGrid`(:93) を `components/pool-team-grid.tsx` へ切り出し、import に置き換え |
| `components/pool-team-grid.tsx` | 新規。切り出し先 |

行番号は 2026-08-31 時点のものです。ズレていたら周辺を読んで判断してください。

## 踏襲すべき既存パターン

**新しい設計を考えないでください。すでに動いているものを一般化するだけです。**

1. **開幕前判定**: `app/c/rwc/2027/page.tsx:160-162` の `tournamentStarted`。同じ式を使い、spec の A 節にある順位データ側の OR 条件を足す
2. **開幕前のチーム表示**: `app/c/rwc/2027/page.tsx:93` の `PoolTeamGrid`。**中身を書き直さず切り出す**。`row.teamName === "-"` → 「未確定」の置換も維持
3. **プール名の日本語化**: `formatPoolName`（`lib/format/competition.ts`、`fix-hub-hero-scrim-and-pool-labels.md` で実装済み）。新しい変換関数を作らない
4. **空状態の見た目**: `app/c/[competition]/[season]/page.tsx:794` 付近の「試合データを準備中です」ブロック。新しいカード様式を作らない

## 入出力の具体例

### `seasonNotStarted`

| matches の状態 | 順位データの状態 | 期待 |
|---|---|---|
| 全件 `scheduled` | 16行すべて `played:0` | `true` |
| 全件 `scheduled` | 0行 | `true` |
| 8件 `finished` | 16行、`played` に 1 以上あり | `false` |
| 8件 `finished` | 16行すべて `played:0`（取り込みラグ） | **`true`** |
| 1件 `in_progress` | 16行、`played` に 1 以上あり | `false` |
| プール制、全件 `scheduled` | 全プールの全行 `played:0` | `true` |

### ラウンドフィルタの生成

| 大会 | `competition_pools` | 期待されるタブ |
|---|---|---|
| urc/2026-27（144試合） | なし | **フィルタ列を描画しない** |
| premiership/2026-27（90試合） | なし | **描画しない** |
| urc/2025-26（150試合） | なし | **描画しない** |
| nations-championship/2026 | Northern Hemisphere / Southern Hemisphere | 全試合 / 北半球 / 南半球（＋プール外があればノックアウト） |
| rwc/2027 | Pool A 〜 **Pool F** | 全試合 / プールA 〜 **プールF**（＋ノックアウト） |

**`rwc/2027` の E と F を落とさないこと。** 現行のハードコードは A〜D しかなく、ここが最も間違えやすい箇所です。

## 処理すべきエッジケース

1. **順位データ0行**（テストマッチ形式の大会。`autumn-nations` 等）。`seasonNotStarted` は `true` になるが `PoolTeamGrid` に渡すチームが0件。この場合は `#standings` 節とナビ項目を**そもそも出さない**（現行の `hasStandings === false` と同じ挙動を保つ）
2. **プールが1件しかない大会**。フィルタ列を出さない（タブが「全試合」1つだけの列は無意味）
3. **`?round=` に未知の値**。`?round=pool-a` を URC で開いても 500 やクラッシュにせず全試合を返す
4. **プール名の正規化衝突**。`Northern Hemisphere` → `northern-hemisphere`、`Pool A` → `pool-a`。既存の `normalizeRoundLabel` を使い、`startsWith` による部分一致で別プールを巻き込まないこと（`Pool A` のクエリが `Pool AB` を拾わない）
5. **消化済みシーズンの回帰**。`/c/urc/2025-26` と `/c/rwc/2027` は**見た目が1pxも変わってはいけない**。これが最重要の回帰チェックです

## 「完了」の定義

1. spec の受け入れ条件 30 項目を**1件ずつ**照合し、PR 本文にチェックリストとして貼る
2. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
3. ユニットテストを追加（spec 受け入れ条件 27 の7ケース）
4. **PR 本文に本番相当データでの実測を貼る。** 最低限:
   - `/c/urc/2026-27`: 「首位」文字列の有無、`[role="tab"]` の要素数、`#standings` 節のテキスト、節グループ数と `aria-expanded="true"` の数
   - `/c/nations-championship/2026`: タブのラベル一覧
   - `/c/urc/2025-26` と `/c/rwc/2027`: 変更前後の差分が無いこと
5. スクリーンショット: `/c/urc/2026-27` のヒーロー帯と `#standings` 節（**デスクトップ幅 1440 で撮る**。読者の63%がデスクトップです）

## やってはいけないこと

- `competition_standings` のデータを書き換える / 取り込み処理を直す（表示層で解決します）
- ヒーロー帯のレイアウト・配色・キービジュアルに差分を出す（`fix-hub-hero-scrim-and-pool-labels.md` で確定済み）
- `PoolTeamGrid` の中身をリファクタする（切り出すだけ）
- `/c/rwc/2027` の見た目を変える
- 新しい色・角丸・影トークンを足す
- 折りたたみ挙動（`shouldCollapseRoundGroups` / `getDefaultOpenGroupIndexes`）に手を入れる
- スコープ外に書かれた「デスクトップの情報密度」「スケジュール節のサーバーレンダリング」に着手する

## 判断に迷ったら

spec の「未解決の質問」3件は Owner 判断です。実装を止めて聞くのではなく、**spec に書かれた既定（参加チーム一覧を出す / 過去シーズンは個別対応しない）で進め、PR 本文で明示的に指摘してください。**
