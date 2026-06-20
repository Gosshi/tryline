# ライブ取り込み→生成 cron パイプライン再設計

## 背景

マーキー試合（決勝・代表戦など、特に土曜夜キックオフ）の recap が、試合終了から1日以上遅れて公開される問題がある。X での拡散の旬（当日〜翌朝）を逃しており、SEO トラックでの集客にも機会損失。

根因は GitHub Actions の cron スケジュール（UTC、`vercel.json` ではなく `.github/workflows/cron-*.yml` で定義）:

- `cron-ingest-live-competitions.yml`（結果取り込み: finished 化・スコア・イベント）
  - `0 2 * * *` ＝ **1日1回・02:00 UTC ＝ 11:00 JST のみ**
- `cron-orchestrate.yml`（recap/preview 生成）
  - `0 12 * * *`（21:00 JST）＋ `0 15 * * 6,0`（土日 翌00:00 JST）

具体的な詰まり（2026-06-20 SRP 決勝、KO 16:05 JST）:
- 結果取り込みは 11:00 JST に1回だけ＝試合前に走り終わっており、当日は結果が入らない（status=scheduled のまま）
- 次の取り込みは翌日 11:00 JST → recap は同日 21:00 JST の orchestrate
- 結果、決勝から丸1日以上遅れて recap 公開。構造的に「土曜夜の試合は日曜夜まで recap が出ない」

### 関連 cron の依存チェーン（設計の核心）

recap 生成の前段にイベント補完ジョブが挟まっている。現状は固定オフセットで成立している:

```
ingest-live-competitions (02:00 UTC)
  → fill-league-one-playoff-events (03:00 UTC, 毎日)   League One プレーオフのイベント補完
  → orchestrate (12:00 UTC)                            recap 生成
  → post-to-x (13:00 UTC)                              X/Discord 配信
```

**最重要の制約: recap は試合単位で一度だけ生成・キャッシュされ、再生成されない**（`lib/cron/orchestrate.ts:122-136` が draft/published 済み試合を候補から除外）。
→ **イベント補完が終わる前に recap が生成されると、イベント不足の recap が恒久的に固定される。** 補完ジョブは必ず orchestrate より前に走らねばならない。

### 調査で確定した前提

1. **頻度を上げても LLM 生成コストは増えない。** recap/preview の生成回数は「実施された試合数」に比例し「cron 実行回数」には比例しない（上記の除外ロジック）。頻度を4倍にしても生成される recap は finished 化した試合ぶんだけ。**LLM 増分コスト ≈ ¥0。**
2. **連動は既存パターンの延長。** `app/api/cron/orchestrate/route.ts` はすでに他 cron route の `POST` ハンドラを直接呼んでいる（`ingest-lineups`）。ただし本 spec ではアプリコードは変更せず、GitHub Actions ワークフロー内で各 route を連続 HTTP 実行する（疎結合）。
3. **maxDuration（300s）は分離で回避。** 各ステップを別 curl にすれば、各々が別の関数呼び出しで独立した 300s 予算を持つ。1リクエストに詰め込まない。
4. ingest は `statusChangedToFinished` の試合だけイベント抽出する（`lib/ingestion/live-ingest.ts:271-306`）。SRP/URC 等は live-ingest 内でイベント取得が完結するが、**League One プレーオフのイベントは `fill-league-one-playoff-events` 依存**（ハードな順序依存、`specs/fix-cron-timing-league-one-playoff.md` 参照）。
5. orchestrate の recap 候補は「finished かつ未生成」を直近10件（`RECAP_BATCH_SIZE=10`）。頻度を上げるほどバックログが速く捌ける。

## スコープ

対象:
- 既存の `cron-ingest-live-competitions.yml` と `cron-orchestrate.yml` を、**ingest → fill-league-one-playoff-events → orchestrate を連続実行する単一の「ライブパイプライン」ワークフロー**に統合する
- 実行頻度を 6時間ごと（4回/日）に引き上げる
- `cron-fill-league-one-playoff-events.yml` のスケジュールをパイプラインに畳み込む（順序依存を維持するため）
- マーキー試合の手動即時実行のために `workflow_dispatch` を維持する

対象外:
- アプリケーションコードの変更（route ハンドラ、`orchestrate.ts`、`live-ingest.ts` 等は一切変更しない）
- キックオフ駆動の動的スケジュール（論点5）。固定6時間で目標達成のため見送り（YAGNI）。将来オプション
- 試合 ID 指定の手動ジョブ（論点4）。全パイプラインの手動実行で十分安く解決できるため不要
- 以下の cron は据え置き（理由は「据え置きジョブの扱い」節）: `cron-cleanup-raw-data`, `cron-ingest-fixtures`, `cron-ingest-results`, `cron-ingest-squads`, `cron-fill-event-gaps`, `cron-post-to-x`
- 取り込み対象大会リスト（`lib/ingestion/live-competitions.ts`）の変更
- DB スキーマ変更

## データモデル変更

なし。

## API サーフェス

新規エンドポイントなし。既存の以下を利用する（変更なし）。すべて `secrets.CRON_SECRET` で Bearer 認証:
- `POST /api/cron/ingest-live-competitions`
- `POST /api/cron/fill-league-one-playoff-events`
- `POST /api/cron/orchestrate`

### 変更するファイル

**新規:** `.github/workflows/cron-live-pipeline.yml`

```yaml
name: Cron — Live Pipeline

on:
  schedule:
    # 6時間ごと: 00/06/12/18 UTC = 09/15/21/03 JST
    - cron: "0 0,6,12,18 * * *"
  workflow_dispatch:

jobs:
  pipeline:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Ingest live competitions (results + events)
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tryline-six.vercel.app/api/cron/ingest-live-competitions

      - name: Fill League One playoff events
        if: ${{ always() }}
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tryline-six.vercel.app/api/cron/fill-league-one-playoff-events

      - name: Orchestrate (preview/recap generation)
        if: ${{ always() }}
        run: |
          curl -f -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://tryline-six.vercel.app/api/cron/orchestrate
```

設計上のポイント:
- 各ステップは `curl -f` で HTTP 完了まで待つ。orchestrate が走る時点で、その回の取り込み（finished 化・イベント挿入）と League One プレーオフのイベント補完が完了済み → orchestrate がイベント完備の状態で newly-finished 試合を拾える。**取り込み→補完→生成のラグ ≈ 0、かつ順序保証あり。**
- 2・3ステップ目に `if: ${{ always() }}` を付与し、前段が失敗してもバックログ処理・preview 生成のため後続を実行する。失敗時も既存データに対して安全（未生成のみ拾う）。
- マーキー試合は Actions UI から `Run workflow`（workflow_dispatch）で全パイプラインを即実行。今回 SRP 決勝で行った運用と同じ。

**スケジュール削除（workflow_dispatch は残す）:** `.github/workflows/cron-fill-league-one-playoff-events.yml`
- `schedule` ブロックを削除し `workflow_dispatch:` のみ残す（パイプラインに畳み込んだため。手動実行は引き続き可能）。

**削除:** `.github/workflows/cron-ingest-live-competitions.yml`, `.github/workflows/cron-orchestrate.yml`

### 据え置きジョブの扱い（変更しない理由）

| ワークフロー | スケジュール | 据え置き理由 |
|---|---|---|
| `cron-cleanup-raw-data` | `0 4 * * *` | 保守ジョブ。生成チェーンと独立 |
| `cron-ingest-fixtures` | `0 2 * * 1` | 日程（未来の試合）取り込み。結果取り込みとは別系統 |
| `cron-ingest-squads` | `0 2 * * 0` | スカッド取り込み。週次で十分 |
| `cron-fill-event-gaps` | `0 6 * * 0` | URC 等の週次イベント補完バックストップ。live-ingest 側で URC イベントは取得済みのため保険。現状でも orchestrate より前に走る保証はなく、本変更で悪化しない |
| `cron-ingest-results` | `0 17 * * 6,0` | Six Nations 2027 専用の別実装取り込み（`lib/ingestion/results.ts`、`ingestLiveCompetition` のロジック重複）。本 spec では据え置き。重複解消は別フォローアップ spec `specs/feat-six-nations-2027-live-source.md` で対応（app コード変更のため） |
| `cron-post-to-x` | `0 3,13 * * *` ほか | X/Discord 配信。**現状維持で確定（Owner 判断）。** 配信は生成済み recap を拾う設計のため、生成タイミング変更の影響を受けない |

## UI サーフェス

なし。

## LLM 連携

- 段階: コンテンツ生成パイプライン（集約→事実抽出→ナラティブ生成→品質チェック）の起動タイミングのみ変更。パイプライン内部・モデル・プロンプトは不変。
- モデル: 既存のまま（抽出・QA = `gpt-4o-mini`、ナラティブ = `gpt-4o`、`lib/llm/models.ts` 管理）。
- **コスト見積もり（CLAUDE.md 必須項目）:**
  - **LLM 増分 ≈ ¥0。** 生成は「未生成の finished/scheduled 試合」のみ。週次の生成総数は実施試合数に等しく、cron 実行回数に依存しない。頻度 1→4 回/日でも recap 生成数は変わらない。
  - **Wikipedia 取得:** ingest 8 ソース × 4 回/日 ＝ 32 fetch/日（現状 8/日、+24/日）。`fill-league-one-playoff-events` も 4 回/日になるが、対象ページ1枚・オフシーズンは no-op。各ソース数時間間隔で Wikipedia のレート/robots 的に問題ない水準。
  - **Vercel 関数呼び出し:** 1パイプライン3 invocations × 4 回/日 ＝ 12/日（現状 約4/日）。各 maxDuration 300s 内。Fluid Compute の範囲で無視できる。
  - **空振り DB クエリ:** orchestrate は何もない回でも Supabase select を数回。4回/日で無視できる。

## 受け入れ条件

Codex が検証可能な粒度:

1. `.github/workflows/cron-live-pipeline.yml` が新規作成され、`schedule` が `0 0,6,12,18 * * *`、`workflow_dispatch` を含む。
2. 同ワークフローが3ステップ（ingest → fill-league-one-playoff-events → orchestrate）を、それぞれ `curl -f` で対応する `…/api/cron/<name>` に対し実行する。全ステップとも `Authorization: Bearer ${{ secrets.CRON_SECRET }}`。
3. 2・3ステップ目に `if: ${{ always() }}` が付与されている（前段失敗時も後続が走る）。
4. 旧ワークフロー `cron-ingest-live-competitions.yml` と `cron-orchestrate.yml` が削除されている。
5. `cron-fill-league-one-playoff-events.yml` は `schedule` ブロックが削除され `workflow_dispatch:` のみになっている。
6. 据え置き対象（cleanup-raw-data / ingest-fixtures / ingest-results / ingest-squads / fill-event-gaps / post-to-x）に差分がない。
7. アプリケーションコード（`app/api/cron/**`, `lib/cron/**`, `lib/ingestion/**`）に差分がない。
8. マーキー試合の手動即時実行手順が `docs/runbooks/cron-live-pipeline.md` に存在する（作成済み）。Codex 側で内容の追加作業は不要だが、ワークフロー実装がこの runbook の記述（ステップ名・順序）と一致していること。
9. `docs/next-session-cron-redesign.md` は役目を終えるため削除または「実装済み」追記（Owner 判断）。

検証方法（Codex 実装後、Owner がマージ前に確認）:
- ワークフローの YAML 構文が valid（`actionlint` 等があれば実行）。
- マージ後に `workflow_dispatch` で手動実行し、3ステップが順に成功、orchestrate のレスポンス JSON に `previews`/`recaps`/`lineups` が返ることを確認。

## 未解決の質問

解決済み（Owner 判断、2026-06-21）:

- **手動 runbook → 作成する。** `docs/runbooks/cron-live-pipeline.md` 作成済み。
- **`cron-post-to-x` → 現状維持。** 配信は生成済み recap を拾う設計のため据え置きで問題なし。
- **`cron-ingest-results`（Six Nations 2027 重複）→ 重複を減らす方針。** ただし app コード変更のため本 spec とは別の **フォローアップ spec `specs/feat-six-nations-2027-live-source.md`** で対応。Six Nations 2027（2027年2〜3月）開幕前に完了させること。本 spec では `cron-ingest-results` は据え置き。

残る判断（Owner、必要に応じて）:

1. **`cron-fill-event-gaps`（週次 URC バックストップ）を将来パイプラインに畳み込むか。** 現状は live-ingest で URC イベント取得済みのため保険。万一 URC recap のイベント欠落が再発したら、League One プレーオフと同様にパイプライン化を検討。
2. **将来のキックオフ駆動スケジュール（論点5）。** 固定6時間で不満が出た場合の再検討要否を `docs/decisions.md` に1行残すか。
3. **旧 `docs/next-session-cron-redesign.md` の扱い。** 削除 or 「→ refactor-cron-live-pipeline.md で実装」追記。
