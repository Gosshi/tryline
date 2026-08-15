# Codex 指示: 汎用ラインアップ取込＋再生成の手動ワークフロー

## 仕様書

`specs/feat-manual-ingest-lineups-workflow.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 作るもの（一文）

`.github/workflows/manual-ingest-lineups.yml` を 1 本追加する。`workflow_dispatch` のみで、指定した match_id に対して ingest-lineups → fetch-sourced-facts → generate-content を順に叩き、**各段が何件成功して何件どの理由で落ちたかを Owner が一目で分かる形に集計する**。

## この spec の本体は「集計とサマリ」であって「curl を並べること」ではない

雛形の `.github/workflows/cron-ingest-league-one-lineups.yml` は non-200 を `echo "WARN: …"` するだけで、ジョブは常に green になる。**それをコピーしないこと。** 仕様書の受け入れ条件 10〜16 がこの spec の中心。

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `.github/workflows/cron-ingest-league-one-lineups.yml` | 3 段構成の雛形。認証ヘッダと secrets 名（`PRODUCTION_URL` / `CRON_SECRET`） |
| `app/api/cron/ingest-lineups/route.ts:69-74, 88-90, 198-210` | 400 / `{announced:false}` 200 / 成功時の `home_count`・`away_count` / 500 の 4 分岐 |
| `app/api/cron/fetch-sourced-facts/route.ts:16-37` | `match_id` / `content_type` / `force` のパラメータ |
| `app/api/cron/generate-content/route.ts:8-25` | body スキーマ。`matchIds` が**配列**であること |

## 雛形と変える点（明示）

1. **`content_type` の choice から `auto` を削除する。** League One 版の `auto` はワークフロー内にハードコードした試合 ID リストとの照合で実装されており、汎用版では原理的に成立しない
2. **`generate-content` は 1 回だけ呼ぶ。** `matchIds` が配列を受けるので、League One 版のように 1 件ずつループしない
3. **失敗でジョブを赤くする。** 仕様書の受け入れ条件 15・16

## ingest-lineups の 4 分岐（実測済み・推測で書かない）

```
HTTP 400                                   → SKIP    (matches.external_ids.wikipedia_url 未設定)
HTTP 200 かつ {"announced": false}          → NO-DATA (パーサーがラインアップを返さなかった)
HTTP 200 かつ home_count + away_count === 0 → NO-DATA
HTTP 200 かつ home_count + away_count > 0   → OK
HTTP 500 その他                             → FAIL
```

`SKIP` と `NO-DATA` と `FAIL` を混ぜないこと。Owner がデータ不足・パーサー不調・障害を取り違えると、2026-08-14 の放送情報の件（対応表 1 行の不足を「未対応」として放置していた）と同じことが起きる。

## 想定される実行結果（これが正常）

**このワークフローは、当面ほとんどの試合で赤くなる。それが設計どおり。**

仕様書の「背景 → 本 spec が解決しないこと」に書いたとおり、`app/api/cron/ingest-lineups/route.ts` の `ensurePlayerIds()` は `players` への insert に `slug` を含んでおらず、`players.slug` は NOT NULL（`supabase/migrations/20260517010000_add_player_slugs.sql:24`、DEFAULT なし）。**未登録選手が 1 名でも含まれる試合では 500 が返る。**

これを「ワークフローのバグ」と誤認して `ensurePlayerIds` を直しに行かないこと。**そのバグの修正は本 spec の対象外**であり、別 spec で扱う。ここで作るのは「そのバグが起きていることを Owner に見せる装置」でもある。

## エッジケース

- `match_ids` が空白のみ → ジョブを失敗させる（何もせず green で終わらない）
- `match_ids` が 11 件以上 → 実行前に失敗させる（LLM 課金の暴発防止。2026-06 の 297 件 draft 化事故の再発防止）
- UUID 形式でない要素が混ざる → その要素だけスキップしてサマリの失敗件数に数える。他の ID の処理は続行する
- 3 つのトグルをすべて `false` → API 呼び出し 0 回で **成功**（明示的な no-op）
- `generate-content` が 200 だが個別試合が draft 化 → ワークフローはそこまで追わない。HTTP ステータスのみ記録すればよい
- 途中の段で失敗しても `exit 1` で即座に抜けない。**全件処理してから最後に落とす**

## サマリの出力先

ログだけでなく `$GITHUB_STEP_SUMMARY` にも書くこと。Owner が Actions の結果画面でログを展開せずに読めることが要件（受け入れ条件 14）。

最低限含める項目:
```
対象: N 件
ingest    : OK n / NO-DATA n / SKIP n / FAIL n
facts     : OK n / FAIL n
regenerate: HTTP <code>
```

## 未解決の質問への対処

仕様書の「未解決の質問 1」（対象 match_id の調べ方）は Owner に確認が必要。**確認が取れないまま推測でコメントを書かないこと。** 決まらない場合は「本番サイトの試合詳細 URL の末尾が match_id」とだけ書いて先に進む。

## 完了の定義

- `specs/feat-manual-ingest-lineups-workflow.md` の受け入れ条件 1〜17 をすべて満たす
- 追加ファイルは `.github/workflows/manual-ingest-lineups.yml` の 1 本のみ
- **`app/api/cron/` 配下・`lib/` 配下を変更しない**（変更が必要だと判断した場合は実装せず PR で報告すること）
- **本番でこのワークフローを実行しない。** 起動は Owner が判断する
- YAML の構文チェックが通ること（`actionlint` があれば使う。無ければ導入しない）
- PR 本文に「未実行。初回起動時は match_ids を 1 件にすること」と、slug バグにより 500 が想定されることを明記する
