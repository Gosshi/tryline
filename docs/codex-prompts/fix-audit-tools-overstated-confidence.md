仕様書 `specs/fix-audit-tools-overstated-confidence.md` を実装してください。**先に全文を読んでください。**

読み取り専用の監査ツール 2 本が、**根拠のない断定を出力します。** 監査結果は本番データ修復の判断材料になるため、確信度を実態より高く見せてはいけません。

## R3 — 人名欠損の署名で帰属反転が confirmed になる

`tools/audit-published-recap-event-integrity.ts:173-177` の `getMetadataString` は**欠損時に空文字を返します。**

署名は `[minute, type, normalizePlayerName(player_name)]`（`:205-212`）なので、**分と種別が同じ無名イベントは全部同一署名**になります。

同じ分・種別が 4 件並び帰属が逆なら、**無関係な匿名イベント同士でも C3 と C4 が成立**し、片方が得点不足なら C1 も立って `confirmed` へ昇格します。再現は `docs/audits/gpt6-spec-review-followup-2026-09-08/audit-observation.test.ts`。

**C1（得点不足）は他試合からのコピーの証拠になりません。** 単に取り込みが欠けているだけでも立ちます。

交代イベントは `player_in_name` / `player_out_name` に名前を持つため、`player_name` だけを見ると常に無名になります。署名契約を明記してください。

**本物の検出を殺さないでください。** 人名のある `f01f68e2` と `2c276057` は引き続き C3 / C4 が立ち `confirmed` のままである必要があります（受け入れ条件 2）。

## R4 — 順位表 1 行で「網羅」と報告する

`tools/audit-competition-guide-facts.ts:378-384` が、**1 行でも順位表があれば `coverage: "complete"` を返し matches 側を読みません。**

同一 family / season に複数 competition がある場合、どれか 1 つに 1 行あるだけで他 competition の日程を無視します。再現では、1 チームだけ登録した fixture で**その 1 チームの集合を `complete` とし、もう一方の参加国を「ガイドにしか無い候補」として報告**しました。

Owner はこの `coverage` を見て候補の重みを判断します。**`complete` が誤っていると、実在する参加国を捏造と誤認しかねません。**

**入力集合が非空であることを完全性の判定基準にしないでください。** これが核心です。

## やってはいけないこと

- C1 / C2 / C5 の判定を変えること
- `lib/ingestion/event-integrity.ts` の V3 を触ること（あちらは警告のみで拒否に使われていません）
- 両ツールに書き込みを入れること（読み取り専用のまま）
- LLM を呼ぶこと
- **本番の env ファイルを使う実行。** 合成 fixture で完結させてください。本番再実行は Owner が行います

git worktree で分けてください（`docs/runbooks/codex-worktree.md`）。
