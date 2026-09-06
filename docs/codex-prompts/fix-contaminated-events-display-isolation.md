仕様書 `specs/fix-contaminated-events-display-isolation.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**最終スコアと合計が合わないイベントを、得点推移グラフとタイムラインにそのまま描いています。**

`/matches/f01f68e2-bdd6-47c8-8910-0ea37a382b0a` は表示スコアが豪州 56–17 日本なのに、イベント合計は 32–35 です。`components/match-events-section.tsx:63` の表示条件が `events.length === 0` だけで、**スコアとの整合を見ていません**。

同じコンポーネントが `ScoreGraph`（L3 で import）とイベント一覧の両方を作るので、**汚染データが見た目の違う2つのUIとして同時に出ています。**

## 触るファイル

```
components/match-events-section.tsx
app/api/v1/matches/[id]/route.ts
```

**`app/matches/[id]/page.tsx` には差分を作らないでください。** `MatchEventsSection` は `finalHomeScore` / `finalAwayScore` を既に props で受け取っています（L20-31 を見てください）。呼び出し側4箇所（L458, 473, 501, 518）はそのままで、コンポーネント内だけで判定できます。

## 変えてはいけないもの

**試合ヘッダーのスコア表示（豪州 56 – 17 日本）はそのまま残してください。** これは公式に確認された最終スコアです。消すのはイベント由来の表示だけです。

**`match_events` と `match_content` を1行も触らないでください。** データの修正は別 spec です。

**`toScoreEvent`（`lib/data-integrity/audit.ts:117`）は export されていないので import できません。** また `computeScoreTimeline` は `assemble.ts` にあり DB クライアントを引き込むため、**React コンポーネントから import しないでください。**

使うのは `lib/format/match-event-points.ts` の `pointsForMatchEvent`（DB 非依存の純関数）です。

**「4箇所は変更不要」という前回の指示は誤りでした。** `app/matches/[id]/page.tsx:462-463` は `match.homeScore ?? 0` で null を 0 に変換しているため、コンポーネント側はスコア未確定と 0–0 を区別できません。**status・awayTeamId・nullable なスコアを渡すよう、4箇所の props を変更してください。**

## 気をつけること

**代替表示を重複させないでください。** `MatchEventsSection` は同一ページで最大2回呼ばれます。「得点記録を確認中です」が2回出たら差し戻します。

**試合前のページに出してはいけません。** `status !== "finished"` では従来どおりの挙動です。

**赤（`--color-accent`）を使わないでください。** 不具合の告知ではなく、記録が未確定であることを淡々と伝える表示です。`--color-panel` を使い、周囲と同じ角丸・余白に収めてください。

**`api-types.ts` は本リポジトリにありません**（実体は別リポジトリの `tryline-mobile/reference/api-types.ts`）。同期は Owner が手動で行うので、**本リポジトリ内の差分だけを作ってください。**
