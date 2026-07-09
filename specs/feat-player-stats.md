# 選手ページに match_events 由来のスタッツを表示する（noindex解除の前提条件）

## 背景

`fix-player-pages-noindex-until-stats.md`（2026-06-13実装済み）により、選手ページは実名選手も含めて全て `noindex` になっている。同specは明示的に「`feat-player-stats`（トライ数・出場試合数等を選手ページに表示する施策）を実装したら `PLAYER_PAGES_INDEXABLE = true` に戻す」と将来の解除条件を定義しており、本specがその `feat-player-stats` にあたる。

2026-07-08〜09 の再評価で、選手データの現況を本番DBで実測した:

| 属性 | 有データ件数 | 全体2,441人中 |
|------|---:|---:|
| 生年月日 | 175人 | 7% |
| ポジション・caps | 218人 | 9% |

`external_ids.source` 別の内訳:
| source | 人数 | DOB保有 |
|------|---:|---:|
| `null`（旧スクエリプト経由） | 513 | 175 |
| `world-rugby` | 766 | 0 |
| `league-one-jp` | 1,162 | 0 |

生年月日・ポジション（Wikipediaのsquadsページ由来）の補完は、`world-rugby`・`league-one-jp` 経由で作られた1,928人（全体の79%）の空レコードを埋める必要があり、ソース側の対応表整備を含む別軸の作業になる。**一方、`fix-player-pages-noindex-until-stats.md` が明示する noindex 解除条件は生年月日ではなく「match_events由来のスタッツ表示」であるため、本specはそちらを優先する**（Owner判断、2026-07-09）。生年月日・ポジション補完は別途、独立specとして再評価する。

## スコープ

対象:
- 選手の通算スタッツ（出場試合数・トライ数・コンバージョン数・ペナルティゴール数・獲得ポイント）を `match_events` から集計する関数を実装する
- 集計ロジックは `lib/llm/stages/qa.ts` に既に実装済みの `buildPlayerStatsFromEvents`・`normalizePlayerNameForStatMatch`・`ActualPlayerStats`（PR #509、`feat-recap-player-stat-verification.md`で実装）を抽出・再利用する（同じ名寄せロジックを二重実装しない）
- `app/players/[slug]/page.tsx` に集計スタッツを表示するセクションを追加する
- スタッツ表示が実装され、動作確認が取れたら `lib/db/queries/players.ts` の `PLAYER_PAGES_INDEXABLE` フラグを `true` に戻す

対象外:
- 生年月日・ポジション・caps等のプロフィール情報補完（別途独立spec、本specでは着手しない）
- カード（イエロー/レッド）・交代等、得点以外のイベント種別の集計表示（`match_events` に得点イベント以外の記録が薄いため、本specは得点関連スタッツに限定する）
- 選手ページのデザイン刷新（スタッツセクションの追加のみ。既存レイアウトの他部分は変更しない）

## データモデル変更

なし（既存 `match_events`・`players` テーブルを読み取るのみ、集計はオンザフライまたはキャッシュ、DBスキーマ変更は不要）。

## API サーフェス

なし。

## UI サーフェス

`/players/[slug]` ページに「通算成績」セクションを追加する。表示例: 出場試合数・トライ・コンバージョン・ペナルティゴール・獲得ポイント。スタッツが0件（`match_events` に一致する記録が無い選手）の場合は「記録なし」等、空データを正直に示す表示にする（存在しないデータを匂わせない）。

## LLM 連携

なし（決定的集計のみ、LLM呼び出しなし）。

## 受け入れ条件

1. `lib/llm/stages/qa.ts` の選手別集計ロジックが共有関数として抽出され、QAゲート（既存）と選手ページ（新規）の両方から同じロジックを呼び出す（コードの二重実装がない）
2. 実際に得点イベントがある選手（例: 今夜検証したコルベ等）の選手ページで、通算スタッツが `match_events` の実データと一致する
3. `match_events` に記録の無い選手（大多数を占める見込み）のページで、スタッツセクションが「記録なし」等を適切に表示し、エラーにならない
4. `PLAYER_PAGES_INDEXABLE` を `true` に戻した状態で、`isIndexablePlayer()` の既存定義(b)（実名 AND published試合出場）に基づき、対象選手ページが再び sitemap に含まれることを確認する
5. スタッツ集計は `player_id` ではなく `match_events.metadata->>'player_name'` を正としたロジックを使う（`player_id IS NULL` は「得点者不明」を意味しないという既存の教訓を踏襲する）
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- `PLAYER_PAGES_INDEXABLE` を実際に `true` に戻すタイミング（実装直後か、Owner が表示内容を確認してからか）はOwner判断。実装完了後に確認を仰ぐこと
- 複数大会・複数シーズンにまたがる同一選手の名寄せ（`canonical_player_id`）が、スタッツ集計時にも正しく統合されるか実装時に確認すること
