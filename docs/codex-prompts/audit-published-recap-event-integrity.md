仕様書 `specs/audit-published-recap-event-integrity.md` を実装してください。**先に全文を読んでください。**

## 何を作るか

**公開済み recap を持つ試合に、イベント汚染がどれだけあるかを数える読み取り専用ツール**です。

1件は確定しています（`f01f68e2-bdd6-47c8-8910-0ea37a382b0a`）。**それ以外にどれだけあるかは分かっていません。** 2026-06 にも37試合（published recap 35本）で同種の汚染が見つかっており、再発は初めてではありません。

## 触るファイル

```
tools/audit-published-recap-event-integrity.ts   （新規、これだけ）
```

**`app/` `lib/` `components/` に差分を作らないでください。** `lib/data-integrity/audit.ts` と `lib/llm/notify.ts` にも触りません（週次通知の改善は別 spec です）。

## 絶対に守ること

**書き込みを1件もしないでください。** ソース中に `.insert(` `.update(` `.upsert(` `.delete(` が現れたら差し戻します。

見つかった汚染をどう処理するか（削除・再取得・draft降格・再生成）は、**件数と類型が分かってから Owner が決めます。** 先回りして処理を書かないでください。

## 実行方法

`tools/audit-entity-grounding.ts:1-9` の規約に合わせてください。

```
node --env-file=.env.production.local tools/run-ts.cjs tools/audit-published-recap-event-integrity.ts
```

**`--confirm-owner-approved` は不要です。** `audit-entity-grounding.ts` がフラグを要求するのは LLM 課金があるからで、**本ツールは LLM を一切呼びません（コスト $0）。** 判定はすべて決定論で行ってください。

## 判定で気をつけること

**C3（署名一致）は 4件以上のときだけ**適用してください。3件以下は偶然一致します。

**C4（帰属反転）は「対戦カード一致 かつ 全件反転」のときだけ**立ててください。一部だけ反転している場合は C3 の `suspect` に留めます。

**得点換算を書き起こさないでください。** `lib/format/match-event-points.ts` の `pointsForMatchEvent` を使ってください。

**`toScoreEvent`（`audit.ts:117`）は export されていないので import できません。**

**`match_events` に `player_name` 列はありません。** `metadata: Json` の中（`metadata.player_name`）で、`player_id` は別の nullable FK です。署名はこれを正規化して作ってください。

## 出力で優先すること

`findings.csv` の `url` 列に `https://www.trylinerugby.com/matches/<match_id>` を入れてください。**Owner がそのまま開いて目視確認できることが、このツールの価値です。**
