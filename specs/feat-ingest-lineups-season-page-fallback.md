# ingest-lineups: 季節ページ（vevent 隣接テーブル）フォールバックで国際大会ラインアップを cron 自動取得可能にする

> 関連: `specs/fix-wikipedia-vevent-section-traversal.md`（PR #474、本specの前提）／`specs/backfill-nations-championship-wikipedia-urls.md`（PR #470/#473）／`specs/feat-lineup-aware-previews.md`（プロンプト側=実装済み）

## 背景

**cron 経路のラインアップ取り込みは、国際大会の季節ページに対して元々一度も機能していない**（2026-07-05 実ページ・実コードで確定）:

- `app/api/cron/ingest-lineups/route.ts:62` は `scrapeMatchLineup`（`lib/scrapers/wikipedia-lineups.ts` の `parseWikipediaLineupHtml`）**のみ**を使う。このパーサーは `#Line-ups` / `#Line-ups_and_bench` / `#Lineups` 見出しを前提とする
- 国際大会の `matches.external_ids.wikipedia_url` は季節/シリーズページ（例: `2026_Six_Nations_Championship`、NC の Southern/Northern Hemisphere Series）であり、**これらのページに `#Line-ups` 見出しは存在しない**（6N 2026 実ページで確認済み）。結果、route は黙って `{ announced: false }` を返し続ける
- DB に存在する歴代の国際大会ラインアップ（6N 各年 15/15・ANS・PNC 等）は、すべて `scripts/backfill-match-lineups.ts` の**手動実行**由来。同スクリプトは `parseWikipediaSixNationsHtml` が試合ごとに返す `lineupTableHtml`（vevent ブロック隣接のラインアップテーブル、`wikipedia-six-nations.ts:217` の `findLineupTableHtml`）を `parseLineupFromTableHtml` に渡す方式で動いている
- PR #474 で共有パーサーが Parsoid 形式に対応したため、この方式を route に組み込む前提が整った

これを直すと、NC 2026（Round 2 は 7/11、preview 生成窓は 7/8 開始）・6N 2027・ANS 等の国際大会で、Wikipedia にラインアップが掲載され次第、orchestrate の既存経路（preview 窓内で6時間ごとに `ingestLineups` を呼ぶ）が自動でラインアップを取り込むようになる。データスパース準拠のプレビューから「実名入りプレビュー」への転換に必要な最後の配線。

## スコープ

対象:
- `lib/scrapers/wikipedia-lineups.ts`（または新規 lib。配置は Codex 判断）: 季節ページ HTML＋対象試合のチーム名ペアを受け取り、該当試合の vevent 隣接テーブルからラインアップを抽出する関数（例: `parseSeasonPageLineup(html, homeTeamName, awayTeamName, sourceUrl)`）。内部は `parseWikipediaSixNationsHtml` → `homeTeamName_awayTeamName` キーで対象試合の `lineupTableHtml` を特定 → `parseLineupFromTableHtml`、という `scripts/backfill-match-lineups.ts:296-346` の既存パターンの lib 化
- `app/api/cron/ingest-lineups/route.ts`: `parseWikipediaLineupHtml` が null のとき、上記フォールバックを試す。HTML の fetch は1回に統一する（現状 `scrapeMatchLineup` 内部で fetch しているため、fetch と parse を分離するリファクタを含む）。route は match の home/away チーム名を既に取得しているのでそれを渡す
- 対応するテスト（**Parsoid 形式のフィクスチャ必須**。`findLineupTableHtml` の隣接判定が `<section>` ラッパー配下でも機能するかは #474 では未検証のため、ここで必ず検証する）

対象外:
- `scripts/backfill-match-lineups.ts` 自体の書き換え（新 lib 関数を使う形へのリファクタは任意。挙動を変えないこと。共通化する場合も dry-run 出力の互換を保つ）
- preview の再生成トリガ（lineup 確定後に preview を焼き直す仕組み。別spec = P1。本specは「データが入る」まで）
- クラブ大会（Premiership/URC/Top14/SRP）のラインアップ取得（Wikipedia にクラブ戦の先発は掲載されないため別ソースが必要。別判断）
- League One（専用 route `ingest-league-one-lineups` が既に機能している）

## データモデル変更

なし（`match_lineups` への upsert・players 自動作成は route の既存ロジックをそのまま使う）。

## API サーフェス

変更なし（`POST /api/cron/ingest-lineups?match_id=` の入出力互換を維持。ラインアップが見つからない場合は従来どおり `{ announced: false }`）。

## LLM 連携

なし（スクレイパー/取り込みのみ）。LLM コスト影響ゼロ。fetch は既存 `fetchWithPolicy`（robots.txt・レート制限準拠）を使用し、フォールバック発動時も同一 URL への fetch は1回。

## 受け入れ条件

1. Parsoid 形式（`<section data-mw-section-id>` が見出し＋vevent＋ラインアップテーブルをラップ）の季節ページフィクスチャで、複数試合が載るページから**対象試合のみ**の home/away ラインアップ（背番号・is_starter 付き、先発15＋リザーブ）が抽出できる
2. 同フィクスチャで、別試合のラインアップテーブルが混入しないこと（チーム名ペア不一致の試合を要求した場合は null）
3. ラインアップテーブルが未掲載の季節ページ（現時点の NC Southern 記事の状態）では null → route が `{ announced: false }` を返す（黙って成功扱いにしない・500 にもしない）
4. `#Line-ups` 見出しを持つ従来型ページでは既存経路が先に成功し、挙動が変わらない（後方互換）
5. route の fetch が1試合あたり1回であること（フォールバック時に同一 URL を再 fetch しない）
6. `pnpm test`・`pnpm tsc --noEmit` 通過

## 今回発覚した個別対応（spec範囲外・Owner判断事項）

- マージ後、Round 2（7/11）の preview 窓内で Wikipedia にラインアップが掲載されたかを `match_lineups` で確認する（掲載タイミングは Wikipedia 編集者依存。通常メンバー発表=キックオフ約48時間前以降）
- ラインアップが preview 生成**後**に入った場合、現行では preview は焼き直されない（既知の構造問題）。P1 spec（lineup 確定時の再生成トリガ）を別途起案する

## 未解決の質問

- チーム名ペアが同一シーズンページに複数回出現する大会（例: RWC のプール戦＋ノックアウトで同カード再戦）でのキー衝突。NC/6N/ANS は同一ページ内で各カード1回のため当面問題にならないが、汎用性のためキックオフ日付での曖昧性解消を入れるかは Codex 判断（入れない場合は制約としてコード内コメントに明記）
- `homeTeamName_awayTeamName` キーは Wikipedia 表記と DB の `teams.name` の一致に依存する（国際大会は "Japan"/"Italy" 等で一致する想定）。不一致が見つかった場合は `wikipedia-team-name-map.ts` の既存マッピングを利用すること
