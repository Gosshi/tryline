# league-one以外の大会でラインアップ取り込みが恒久的に0件の問題を修正

## 背景

2026-07-09、プレビュー生成の字数不足（直近30日で22/22件＝100%が「字数下限未達」QA警告）を調査する過程で、根本原因の一つを特定した。

本番DB実測（直近60日、finished試合）:

| 大会 | 終了試合数 | ラインアップあり |
|------|---:|---:|
| super-rugby-pacific | 20 | **0** |
| premiership | 16 | **0** |
| urc | 14 | **0** |
| league-one | 9 | 9（100%） |
| nations-championship | 6 | **0** |
| top-14 | 5 | **0** |

**league-one以外の5大会で、ラインアップが試合終了後も恒久的に0件**（タイミングの問題ではなく、既に終了した試合でも一切回復しない）。

### 根本原因

`app/api/cron/ingest-lineups/route.ts`（79行目）は `lib/scrapers/wikipedia-lineups.ts` の `parseMatchLineupFromHtml` を正しいチーム名付きで呼び出している。この関数は直接パース（`parseWikipediaLineupHtml`）が失敗した場合、季節ページ用フォールバック `parseSeasonPageLineupHtml`（182-215行目）に処理を委譲する設計になっている。

しかし `parseSeasonPageLineupHtml` は内部で `parseWikipediaSixNationsHtml`（`lib/ingestion/sources/wikipedia-six-nations.ts`）を呼んでおり、**これはSix Nations固有のページ構造（"Round N" vevent セクション）専用のパーサー**である。今夜の別調査（`feat-top14-regular-season-backfill.md`・PR #521関連調査）で確認した通り、大会ごとにWikipediaページ構造は大きく異なる:
- Top14: 「Match grid」形式の対戦マトリックス、Round見出しなし
- Nations Championship: 北半球/南半球の別ページ・別セクション構造
- URC/Premiership/SRP: それぞれ異なる構造

Six Nations専用パーサーを汎用フォールバックとして使い回しているため、Six Nations以外の全大会でフォールバックが実質的に機能せず、`null` を返し続けている。

一方、これらの大会にはそれぞれ**既に正しく動作しているフィクスチャ専用パーサー**が存在する（`lib/ingestion/sources/wikipedia-urc.ts`・`wikipedia-top-14.ts`・`wikipedia-premiership.ts`・`wikipedia-super-rugby-pacific.ts`・`wikipedia-nations-championship.ts`、いずれも今夜のPR #521で対戦カード・日程を正しく抽出できることを確認済み）。これらが読んでいるのと同じページに、ラインアップ/スターティングメンバー情報が含まれている可能性がある。

## スコープ

対象:
- 5大会（urc・top-14・premiership・super-rugby-pacific・nations-championship）それぞれについて、**実際に各大会が現在使用している情報源ページ（`matches.external_ids.wikipedia_url`が指すページ、または既存フィクスチャパーサーが参照しているページ）にラインアップ/スターティングメンバー情報が含まれているか実地調査する**（最初のステップとして必須）
- 含まれている大会については、既存のフィクスチャ専用パーサー（`wikipedia-urc.ts`等）を拡張してラインアップ抽出機能を追加するか、同じページを対象にした専用のラインアップ抽出関数を新設する
- `lib/scrapers/wikipedia-lineups.ts` の `parseMatchLineupFromHtml` または呼び出し元（`app/api/cron/ingest-lineups/route.ts`）を、大会ファミリーに応じて適切なパーサーを選択するよう拡張する（`competitionFamily` 引数は既に `ingestLineups` 呼び出し側で渡されている、`lib/cron/orchestrate.ts:252` 参照）

対象外:
- 調査の結果、特定の大会のページにラインアップ情報が一切含まれないと判明した場合、その大会は本specの対象外とし、完了報告に理由を明記する（無理にデータを作らない）
- league-one（既に正常動作）
- Six Nations本体（既に `parseWikipediaSixNationsHtml` で正常動作していると推測されるが、念のため実装時に確認してよい）
- ラインアップ以外のデータ（スタッツ・イベント等）の取得

## データモデル変更

なし（既存 `match_lineups` テーブルへの書き込み経路を増やすのみ）。

## API サーフェス

なし。既存の `app/api/cron/ingest-lineups/route.ts` の内部ロジック拡張。

## スクレイピング / コンプライアンス

- 新規の外部リクエストは追加しない想定（既存フィクスチャパーサーが既に取得しているページを再利用する）。もし新規ページ取得が必要になった場合は `fetchWithPolicy`（robots.txt準拠）を必ず経由する

## 実装詳細

### 1. 実地調査（各大会1件ずつ、実装前に必須）

各大会の直近の実際の試合ページ・季節ページを確認し、以下を記録する:
- ラインアップ情報が含まれているか（スターティングメンバー・ポジション・背番号）
- 含まれている場合、そのHTML構造（既存フィクスチャパーサーと同じページ内の別セクションか、別ページか）

### 2. パーサー拡張

調査結果に基づき、大会ごとに以下のいずれかを選ぶ:
- (a) 既存フィクスチャパーサー（例: `wikipedia-urc.ts` の `parseUrcLiveHtml`）を拡張し、ラインアップ情報も同時に抽出する
- (b) 同じページを対象にした新しい専用関数を追加する

### 3. 呼び出し元の切り替え

`app/api/cron/ingest-lineups/route.ts` または `parseMatchLineupFromHtml` に、`competitionFamily` に応じて適切なパーサーへ振り分けるロジックを追加する。既存のSix Nations向けフォールバックはそのまま残し、対象外にしない。

## LLM 連携

なし。

## 受け入れ条件

1. 5大会それぞれについて、実地調査の結果（ラインアップ情報の有無・ページ構造）が完了報告に明記されている
2. ラインアップ情報が確認できた大会について、`node --env-file=.env.production.local tools/run-ts.cjs <検証スクリプトまたは既存cron>` で実際に1件以上のラインアップが正しく取得できることを確認する（対象試合1〜2件のdry-run/手動確認でよい。全件バックフィルは本spec対象外）
3. 既存の league-one・Six Nations の取り込みに回帰がないことを確認する
4. ラインアップ情報が存在しないと判明した大会があれば、その大会名と確認方法を完了報告に明記する（対応不要）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. 本番DBへの一括バックフィル・書き込みは行わない。本spec自体はコード実装・個別確認までで完了とする

## 未解決の質問

- 5大会すべてを1つのPRで対応すると差分が大きくなりすぎる場合、大会ごとに分割して段階的にPRを出してよい（判断はCodexの裁量）
- 一部の大会で「ラインアップ情報自体がWikipediaに存在しない」と判明した場合、代替データソース（各大会公式サイト等）の検討は本specのスコープ外とし、別途新しいspecの候補として完了報告に記載する
