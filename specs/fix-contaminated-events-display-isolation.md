# fix-contaminated-events-display-isolation

## 背景

2026-09-05 の監査（`docs/audits/gpt6-full-audit-2026-09-05.md` D-1）で、公開中の試合 `f01f68e2-bdd6-47c8-8910-0ea37a382b0a`（2026-08-15、豪州 56–17 日本）が、**最終スコアと合計が一致しないイベント 19 件をそのまま得点推移グラフとタイムラインに描画している**ことが確認された。イベント合計は home 32 / away 35 で、表示スコア 56 / 17 と一致しない。実体は第1戦（2026-08-08）のイベントをチーム帰属を反転して継承したもの。

`components/match-events-section.tsx:63` の表示条件は `events.length === 0` のみで、**最終スコアとの整合を表示条件にしていない**。同コンポーネントは `ScoreGraph`（L3 で import）とイベント一覧の両方を組み立てるため、汚染データは 2 つの見た目の異なる UI として同時に露出する。

監査の指摘（D-1 層4）のとおり、本文・グラフ・イベント一覧が「独立に食い違っている」のではなく、**グラフとイベント一覧は同一の汚染データを描いており、本文だけが別系統**である。したがって表示側の対処は「グラフとイベント一覧をまとめて止める」ことになる。

**入口での再発防止は `fix-event-ingestion-identity-guard.md` が扱う。本 spec は、すでに DB に入っている不整合データを読者に見せないことだけを扱う。** 両者は独立に実装・マージできる。

## スコープ

対象:
- `components/match-events-section.tsx`: 最終スコアとイベント合計が一致しない場合に、グラフ・イベント一覧を描画せず、確認中である旨の代替表示に切り替える
- `app/api/v1/matches/[id]/route.ts`: 同じ条件で `events` を空配列で返し、整合状態を示すフィールドを添える（iOS アプリが同じ汚染を描画しないようにする）

対象外:
- **データの削除・修正**（`match_events` の行に触れない。棚卸しは `audit-published-recap-event-integrity.md`）
- **本文（recap / preview）の訂正・非公開化**（本文には公式記録との差異という別の問題があり、`content-regen` 運用で個別対応する）
- 入口での拒否（`fix-event-ingestion-identity-guard.md`）
- 生成の停止（`fix-generation-event-integrity-gate.md`）
- `match_events` のスキーマ変更、整合状態を DB に永続化すること（**読み取り時に計算する**。永続化は状態の陳腐化を生むため本 spec では採らない）
- 試合ヘッダーのスコア表示（公式に確認された最終スコアであり、そのまま残す）

## データモデル変更

なし。整合判定は表示時・API 応答時に既存データから計算する。

## API サーフェス

`GET /api/v1/matches/[id]` の応答に整合状態を追加する。**既存フィールドは削除・改名しない。**

型定義ファイル `api-types.ts` は**本リポジトリには存在しない**（実体は別リポジトリ `tryline-mobile/reference/api-types.ts`）。手動コピー運用のため、**その同期は本 spec の対象外**とし、マージ後に Owner が行う。Codex は本リポジトリ内の差分だけを作ること。

```
data.match.event_integrity: "verified" | "mismatch" | "unavailable"
```

| 値 | 条件 | `data.match.events` |
|---|---|---|
| `verified` | `status` が `finished` かつ両スコアが非 null かつイベント合計が最終スコアと一致 | 従来どおり全件 |
| `mismatch` | `status` が `finished` かつ両スコアが非 null かつ合計が不一致 | **空配列** |
| `unavailable` | 上記以外（未終了、スコア未確定、イベント 0 件） | 従来どおり（多くは空） |

**`mismatch` のときにイベントを返さないのは、消費側（iOS アプリ）が状態を無視して描画する事故を防ぐため。** 状態フィールドだけを足して配列は返す設計にしない。

## UI サーフェス

MatchEventsSectionへstatus、awayTeamId、nullableな最終スコアを渡すため、app/matches/[id]/page.tsxの4呼び出し箇所のprops変更を対象に含める。nullを0へ変換して整合判定しない。

| 状態 | 表示 |
|---|---|
| イベント 0 件 | 従来どおり `null`（変更なし） |
| 合計が最終スコアと一致 | 従来どおりグラフ＋一覧 |
| **合計が不一致** | グラフ・一覧を描画せず、**「得点記録を確認中です」**の一文と、最終スコアが公式記録である旨を示す短い注記のみ |

代替表示のデザイン:
- 既存の内部パネル用トークン `--color-panel` を使い、周囲のセクションと同じ角丸・余白に収める（`design.md` の Elevation & Depth / Shapes に従う）
- **警告色（`--color-accent` の赤）を使わない。** 読者に不具合を告知するのではなく、記録が未確定であることを淡々と伝える。アクセントは操作と編集上の強調に限る（`design.md` Components）
- 本文の読書体験を分断しないよう、高さは最小限に留める
- **Owner による目視評価を受け入れ条件に含める**（機械的条件だけで完了としない）

`status` が `finished` でない試合では従来どおりの挙動を保つ。**試合前・進行中のページでこの注記が出てはならない。**

## LLM 連携

なし（コスト影響ゼロ）。

## 変更詳細

### 1. 判定関数の参照

整合判定は `fix-event-ingestion-identity-guard.md` が `lib/ingestion/event-integrity.ts` へ切り出す `eventTotalsMatchFinalScore` を使う。

**本 spec が先にマージされる場合**は、現行の `lib/llm/stages/assemble.ts:276` の `eventTotalsMatchFinalScore` を import して使う。判定ロジックを**新たに書き起こさないこと**（得点換算の重複実装は `penalty_try` 5 点誤りの再発源。`specs/fix-penalty-try-scoring.md` 参照）。

**`lib/data-integrity/audit.ts:117` の `toScoreEvent` は export されていないため import できない。** また `computeScoreTimeline` は `assemble.ts` にあり DB クライアントを引き込むため、**React コンポーネントから import してはならない**。

判定には `lib/format/match-event-points.ts` の `pointsForMatchEvent`（DB 非依存の純関数）を使い、`MatchEventRow` からの集計は本 spec で新規に定義する。`fix-event-ingestion-identity-guard.md` が `lib/ingestion/event-integrity.ts` に純関数を切り出した後は、そちらを共有する。

### 2. `components/match-events-section.tsx`

L63 の早期 return の後に整合判定を追加し、不一致なら代替表示を返す。`ScoreGraph` の呼び出しには到達させない。

### 3. `app/api/v1/matches/[id]/route.ts`

同じ判定で `events` を空配列に落とし、`event_integrity` を付与する。

## 受け入れ条件

1. `/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a` を開いたとき、**得点推移グラフとイベント一覧が描画されない**
2. 同ページに「得点記録を確認中です」相当の代替表示が 1 箇所だけ出る（`MatchEventsSection` は同一ページで最大 2 回呼ばれるため、**重複表示しないこと**）
3. 同ページの試合ヘッダーのスコア表示（豪州 56 – 17 日本）は従来どおり出る
4. `GET /api/v1/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a` が `data.match.event_integrity === "mismatch"` を返し、`data.match.events` が空配列である
5. `GET /api/v1/matches/2c276057-bb3a-4617-a5b1-b7742e65f034`（第1戦。合計 32–35 が最終スコアと一致）が `event_integrity === "verified"` を返し、`events` が 19 件のまま返る
6. 試合前の試合（`status !== "finished"`）で `event_integrity === "unavailable"` を返し、UI に代替表示が出ないことを検証するテストがある
7. イベント 0 件の finished 試合で、従来どおり `MatchEventsSection` が `null` を返すことを検証するテストがある（代替表示を出さない）
8. `app/matches/[id]/page.tsx` の `MatchEventsSection` 呼び出し 4 箇所に差分が無い
9. `eventTotalsMatchFinalScore` 相当の判定が本 spec で新規に書き起こされていない（既存実装を import している）
10. `pnpm test` と `pnpm typecheck` が green
11. **`match_events` および `match_content` に対する DELETE / UPDATE が差分に含まれない**
12. **Owner による目視評価**: 代替表示が「不具合の告知」ではなく「記録が未確定」として読め、記事の読書体験を分断していないこと。320 / 768 / 1440px で確認する

## 判定と表示の補足
unavailableを先に判定する（未終了、スコアnull、イベント0）。次に当該2チーム以外のIDを拒否し、残りで得点整合を判定する。verifiedは得点整合のみを意味する。mismatchの注記はhighlights側の1箇所に表示し、timeline側は空描画にする。「試合結果のみ掲載。得点経過は確認中です」と表示する。既存本文は未訂正であることを本変更の限界としてPRに明記する。

代替表示の文言は「得点記録を確認中です」を既定とし、Owner が実装後の目視で調整する場合は受け入れ条件 12 の範囲で行う。文言変更のために本 spec を差し戻す必要はない。
