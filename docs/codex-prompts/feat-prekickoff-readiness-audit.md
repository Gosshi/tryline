# Codex 指示: キックオフ前にプレビューの準備状況を点検して通知する cron を作る

## 仕様書

`specs/feat-prekickoff-readiness-audit.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が問題か（一文）

生成に失敗しても、素材が揃っていなくても、**キックオフまで誰にも知らされない。**

## 実際に起きたこと（2026-08-21、本番）

南アフリカ vs ニュージーランド第1テスト（8/23 00:10 JST）で同時に2つ起きていた。

1. **ラインアップは 8/20 に発表済みで、allowlist 内の Wikipedia に先発15人が載っていた**のに `match_lineups` は 0 件。手動実行するまで実名なしのプレビューが公開される寸前だった
2. プレビューは 03:47 に生成されたが QA に却下され、**draft のままキックオフ20時間前まで放置**

**どちらも Owner が偶然気づくまで検知されなかった。**

## 窓の穴（背景として把握しておくこと。本 spec では直さない）

`cron-weekend-preview-refresh.yml` は木・金の2本。

```
木 5 12 * * 4  → 当日〜+2日  = 木・金・土
金 5 12 * * 5  → 翌日〜+2日  = 土・日
```

**土曜は2回、日曜は1回きり、水曜は0回。** JST 深夜キックオフは日付が繰り上がるため、`greatest-rivalry-2026` のテスト4戦は全部「日曜」に入る。ライオンズ戦（8/26 水）は自動では一度も生成されない。

**ただし窓をどう広げても「走ったが失敗した」は残る。** だから検知を独立させる。

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `app/api/cron/send-prematch-notifications/route.ts` | **31行の参考実装。** `assertCronAuthorized` → `getMatchesInRange` → 処理 → `apiSuccess` の形をそのまま踏襲する |
| `lib/db/queries/matches` の `getMatchesInRange` | **これを使う。範囲クエリを自作しない** |
| `lib/cron/auth` の `assertCronAuthorized` | 認可 |
| `lib/api/v1/response` の `apiSuccess` / `apiError` / `PRIVATE_CACHE_CONTROL` | 応答形式 |
| `lib/llm/notify.ts:25-51` | `postOpsAlert`。**これを使う。新しい送信経路を作らない** |
| 同 `:92-116` | `notifyDataIntegrityReport`。**複数項目をまとめて報告する既存の書き方。文面をここに寄せる** |
| `lib/format/kickoff.ts` | JST 整形 |
| 既存 `.github/workflows/cron-*.yml` | ワークフローの構成 |

## やること

1. `app/api/cron/` に読み取り専用の点検ルートを追加
2. `lib/llm/notify.ts` に通知関数を追加
3. `.github/workflows/` に cron ワークフローを追加

## 点検する4条件（すべて決定的。LLM を使わない）

| 判定 | 条件 |
|---|---|
| プレビュー未公開 | `content_type='preview'` / `language='ja'` / `status='published'` の行が無い |
| draft 滞留 | draft はあるが published が無い |
| ラインアップ未取り込み | `match_lineups` が 0 件 **かつ** `external_ids.wikipedia_url` が設定済み |
| sourced_facts 0件 | preview 用の行が無い |

**ラインアップの判定で `wikipedia_url` の条件を落とさないこと。** 未設定の試合は取り込みようがなく、報告しても Owner が動けない。ノイズになる。

## 設計上の注意

**欠落が0件なら通知しない。** 毎日「異常なし」が届くと読まれなくなり、本当に異常な日を見逃す。これは仕様の一部であって最適化ではない。

**発火時刻は手が打てる余裕から逆算すること。** キックオフ直前に通知しても行動できない。既存 cron の JST 換算（`5 12 * * 4` = 木 21:05 JST）を確認したうえで、日曜・水曜キックオフの両方を1日1回で拾える時刻を選び、**理由を PR 本文に書くこと**。

時間窓の広さはトレードオフがある。24時間前なら金曜 run の失敗を拾えるが水曜キックオフに間に合わない。48時間前なら拾えるが、まだ生成予定の試合まで「欠落」と報告してしまう。**判断してよいが、根拠を書くこと。**

## 絶対にやってはいけないこと

1. **`cron-weekend-preview-refresh.yml` に触らない。** 窓の穴を直すのは別判断
2. **自動修復しない。** 取り込みも再生成も本 cron から実行しない。通知だけ
3. **`send-prematch-notifications` に触らない。** 読者向けプッシュの別系統
4. **書き込みを一切しない。** SELECT のみ
5. **`getMatchesInRange` を使わず独自の範囲クエリを書かない**
6. **新しい通知送信経路を作らない。** `postOpsAlert`
7. **LLM 呼び出しを追加しない**
8. **recap を対象にしない。** preview のみ
9. **英語コンテンツを対象にしない**
10. **本番へ通知を送るテストを書かない。** `postOpsAlert` はモックする
11. **日時整形を自前で書かない。** `lib/format/kickoff.ts`

## テストで押さえる点

- 未認可で 401
- published な ja プレビューがある試合は報告に**出ない**
- draft のみ → 報告に出る
- `match_lineups` 0件 + `wikipedia_url` あり → 出る
- **`match_lineups` 0件 + `wikipedia_url` なし → 出ない**（ここを外すとノイズ源になる）
- preview 用 sourced_facts 0件 → 出る
- **欠落0件のとき `postOpsAlert` が呼ばれないことを固定するテスト**
- 各行に対戦カード日本語表記とキックオフ JST が入る

## 完了の定義

- `specs/feat-prekickoff-readiness-audit.md` の受け入れ条件 1〜13 を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が green
- PR 本文に以下を書くこと
  - **選んだ発火時刻と時間窓、およびその根拠**（既存 cron のスケジュールとの関係を示す）
  - **通知メッセージの実際の出力全文**（テストのスナップショットでよい）。想定文言ではなくコードが生成した文字列
