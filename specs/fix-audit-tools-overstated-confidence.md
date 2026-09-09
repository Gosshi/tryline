# fix-audit-tools-overstated-confidence

> 2026-09-08 再レビュー R3 / R4（いずれも P2）。読み取り専用の監査ツール 2 本が、**根拠のない断定を出力する**。監査結果は本番データ修復の判断材料になるため、確信度を実態より高く見せてはならない。

## 背景

### R3 — 人名欠損の署名から帰属反転を `confirmed` にできる

`tools/audit-published-recap-event-integrity.ts:173-177`。

```typescript
function getMetadataString(metadata: Json, key: string): string {
  const value = getJsonRecord(metadata)?.[key];
  return typeof value === "string" ? value : "";
}
```

署名は `[minute, type, normalizePlayerName(player_name)]` で作られる（`:205-212`）。**人名が無いイベントは全て空文字になる**ため、分と種別が同じ無名イベントは互いに同一署名になる。

同じ分・種別が 4 件並び、両チームの帰属が逆であれば、**無関係に作った匿名イベント同士でも C3 と C4 が成立する**。片方が得点不足なら C1 も立ち、severity が `confirmed` へ昇格する。再レビューが 4 件の匿名 try で再現した（`docs/audits/gpt6-spec-review-followup-2026-09-08/audit-observation.test.ts`）。

**C1（得点不足）は、他試合からのコピーの証拠にならない。** 単に取り込みが欠けているだけでも立つ。C4 単独を `confirmed` にしない対処（2026-09-06）は入っているが、**欠損名を同一人物とみなす入口が残っている。**

交代イベントは `player_in_name` / `player_out_name` に名前を持つため、`player_name` だけを見ると常に無名になる。

### R4 — 順位表が 1 行あれば「網羅」と報告する

`tools/audit-competition-guide-facts.ts:378-384`。

```typescript
if (standingRows.length > 0) {
  return {
    coverage: "complete",
    coverageReason: "順位表に行があるため、competition_standingsを参加チームの照合元として使用しました。",
    dataSource: "competition_standings",
    teamIds: new Set(standingRows.map((row) => row.team_id)),
```

**1 行でも順位表があれば `complete` を返し、matches 側を読まない。** 同一 family / season に複数 competition がある場合、どれか 1 つに 1 行あるだけで他 competition の日程を無視する。

再レビューは、2 つの competition のうち一方に 1 チームだけ登録した fixture で、**その 1 チームの集合を `complete` とし、もう一方の参加国を「ガイドにしか無い候補」として報告する**ことを再現した。

Owner はこの `coverage` を見て候補の重みを判断する。**`complete` が誤っていると、実在する参加国を「ガイドの捏造」と誤認しかねない。**

## スコープ

対象:
- `tools/audit-published-recap-event-integrity.ts`: 名前欠損を別状態として扱い、識別根拠のない一致を C3 / C4 の確定材料にしない
- `tools/audit-competition-guide-facts.ts`: 部分的な順位表を `complete` と報告しない
- 両ツールのテスト

対象外:
- **C1 / C2 / C5 の判定**。触らない。C1 は引き続き独立して `suspect` の材料になる
- **`lib/ingestion/event-integrity.ts` の V3**。共通入口側にも `__missing_name_0` 等が試合ごとに同じ番号へ戻る問題があるが、**あちらの V3 は警告のみ**であり自動拒否の問題ではない。本 spec では扱わない
- ガイド本文の実際の訂正（Owner 作業）
- DB への書き込み。**両ツールとも読み取り専用のまま**

## データモデル変更 / API / UI

なし。

## LLM 連携

**なし。コスト $0。** 判定を LLM に委ねない。

## 変更詳細

### 1. 署名における名前欠損（R3）

名前が無いイベントを、名前が空文字の別イベントと**同一視しない**。

実装方法は問わないが、**「無名同士が一致した」という状態を、C3 / C4 の確定材料から外す**こと。名前のあるイベントだけで 4 件以上の一致がある場合に C3 を立てる、などが素直である。

交代の署名契約を明記すること。`player_in_name` / `player_out_name` を持つ型では、`player_name` が無いことは欠損ではない。

C1 は独立に残す。**得点不足だけでは `confirmed` にしない。**

### 2. 参加チームの網羅性（R4）

`competition_standings` に行があることを、**参加チームを網羅している証拠にしない**。

- competition ごとに取得状況を扱う
- 独立した期待チーム数などで完全性を確認できない場合は `incomplete` とする
- 順位表と日程（matches）をどう採用・統合するかを明記する

**入力集合が非空であることを完全性の判定基準にしないこと。** これが R4 の核心である。

## 受け入れ条件

**テスト実行の条件**: `tests/tools/` は `vitest.config.ts:16` の `exclude` に該当しない。**既定の `pnpm test` で実行される。** 結果を PR 本文に貼る。

1. **回帰テスト（必須・R3）**: 4 件の匿名イベント（人名なし・同一分・同一種別・帰属が逆）を持つ 2 試合の合成 fixture で、**C4 が立たず `confirmed` にもならない**ことを検証する。`docs/audits/gpt6-spec-review-followup-2026-09-08/audit-observation.test.ts` の該当例を、期待値を書き換えて回帰テストにする
2. 人名のあるイベントで 4 件以上一致する既存ケース（`f01f68e2` と `2c276057`）は**引き続き C3 / C4 が立ち、`confirmed` のまま**であることを検証する。**この確認を欠かすと、誤検出を消すついでに本物の検出も殺すことになる**
3. 交代イベント（`player_in_name` / `player_out_name`）の署名の扱いがテストで固定されている
4. C1 単独では `confirmed` にならず `suspect` に留まることを検証するテストがある
5. **回帰テスト（必須・R4）**: 同一 family / season に 2 competition があり、一方に 1 チームだけ順位表がある fixture で、**`coverage` が `complete` にならない**ことを検証する
6. 順位表が完全な大会では従来どおり `complete` になることを検証するテストがある
7. **両ツールに書き込みが 1 件も無い**。`.insert(` / `.update(` / `.upsert(` / `.delete(` がソースに現れない
8. LLM 呼び出しが差分に含まれない
9. `lib/ingestion/event-integrity.ts` に差分が無い
10. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**本番での再実行は Owner が行う。** Codex は合成 fixture で完結させ、本番の env ファイルを使わないこと。

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **C5 の `wikipedia_event_id` 由来の識別子品質欠陥は直らない**（`"mw-content-text"` 等）。別途
- **共通入口の V3 における欠損名の扱いは変えない。** あちらは警告のみで、拒否の判断に使われていない
- **監査の件数が減ることは、汚染が減ったことを意味しない。** 確信度の表示が正確になるだけである
