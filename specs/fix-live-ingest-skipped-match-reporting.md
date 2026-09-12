# 取り込みで捨てた試合を件数として報告する

## 背景

**`lib/ingestion/live-ingest.ts:343-348` は、チームを解決できない試合を黙って捨てている。**

```ts
if (!homeTeamId || !awayTeamId) {
  console.warn(
    `Skipping unknown team: ${match.homeTeamName} vs ${match.awayTeamName}`,
  );
  return [];
}
```

`console.warn` は出るが、**件数が `LiveIngestResult` に届かない。** レスポンスの `unknown_teams` は別経路の値で、`fetched.unknownTeamNames`（`:286-288`）から来る。

```ts
const unknownTeamNames = Array.isArray(fetched)
  ? []
  : [...new Set(fetched.unknownTeamNames ?? [])].sort();
```

**`fetch()` が配列を返すソースでは常に `[]` になる。** Top 14 とプレミアシップはオブジェクトを返すので報告されるが、**PNC をはじめとする配列返しのソースは、何件捨てても 0 と報告する。**

### 実際に誤認を起こした（2026-09-12）

PNC 2026 の取り込みは毎回この結果を返す。

```json
{"competition":"pnc-2026","counts":{"events_inserted":0,"matches_inserted":0,"matches_updated":2,"unknown_teams":0}}
```

**パーサは4試合を返しているのに、2件は捨てられている。**

```
09-12 16:00  Fiji vs Canada            slugs=fiji/canada
09-12 19:05  Japan vs United States    slugs=japan/usa
09-19 16:00  Loser SF1 vs Loser SF2    slugs=-/-     ← 捨てられる
09-19 19:05  Winner SF1 vs Winner SF2  slugs=-/-     ← 捨てられる
```

捨てられた2件は**準決勝の勝者が未確定なプレースホルダで、捨てること自体は正しい**（`matches.home_team_id` は NOT NULL）。**問題は「取り込むものが無い」と「2件落とした」が区別できないことである。**

この表示のせいで、2026-09-12 の調査で「9/19 の試合が取り込めていない不具合」と誤認し、Owner に誤った緊急度を報告した。**実際は仕様どおりの挙動だった。**

## スコープ

対象:

- `lib/ingestion/live-ingest.ts` が、`:343-348` で捨てた試合の件数と内訳を `LiveIngestResult` に含める

対象外:

- **捨てた件数を理由に run を失敗させること。** ノックアウトのプレースホルダは正常に発生し、PNC は準決勝が終わるまで毎回2件、RWC 2027 は1年以上にわたって発生し続ける。**失敗にすると常時鳴りっぱなしになる**
- `unknown_teams` / `unknownTeamNames` の意味の変更（ソースが報告した未知チーム名のまま）
- **チーム未確定の試合を保存できるようにすること。** `home_team_id` の nullable 化とマイグレーションを伴う。`specs/fix-rwc2027-bracket-pending-states.md` と共通の判断が要るため別 spec
- `lib/format/schedule-coverage.ts` の `totalRounds === null` 盲点（別 spec）

## データモデル変更

なし。

## API サーフェス

新規ルートなし。`LiveIngestResult` に**フィールドを追加する**。既存フィールドは変えない。

```ts
export type LiveIngestResult = {
  competition: string;
  counts: {
    events_inserted: number;
    matches_inserted: number;
    matches_updated: number;
    skipped_matches: number;   // 追加
    unknown_teams: number;     // 変更しない
  };
  rejections?: EventInsertionRejection[];
  skippedMatches?: SkippedMatch[];   // 追加。0 件のときは省く
  unknownTeamNames: string[];        // 変更しない
};

export type SkippedMatch = {
  awayTeamName: string;
  homeTeamName: string;
  kickoffAt: string;
};
```

**`skippedMatches` は 0 件のとき省略する。** `rejections`（`:495`）が既に `...(rejections.length > 0 ? { rejections } : {})` の形をとっているので、**それに合わせること。**

## 実装の指定

`:335` の `parsedMatches.flatMap` の中で、捨てた試合を配列に積む。**`console.warn` は残す**（ログからの追跡を壊さないため）。

```ts
const skippedMatches: SkippedMatch[] = [];
const resolvedMatches = parsedMatches.flatMap((match) => {
  …
  if (!homeTeamId || !awayTeamId) {
    console.warn(
      `Skipping unknown team: ${match.homeTeamName} vs ${match.awayTeamName}`,
    );
    skippedMatches.push({
      awayTeamName: match.awayTeamName,
      homeTeamName: match.homeTeamName,
      kickoffAt: match.kickoffAt,
    });
    return [];
  }
  …
});
```

**戻り値は2箇所ある。** `:322-331`（`parsedMatches.length === 0` の早期リターン）と `:488-496`（通常の戻り値）。

- **早期リターンの側では `skipped_matches: 0` を返す。** そこに到達する時点で `flatMap` は走っていない
- 通常の戻り値では `skipped_matches: skippedMatches.length` と `...(skippedMatches.length > 0 ? { skippedMatches } : {})`

`:483-485` の `console.info` にも `skipped=` を加える。**既存の項目の順序と表記を変えないこと。**

```
[pnc-2026] inserted=0 updated=2 events_inserted=0 unknown_teams=0 skipped=2
```

## 受け入れ条件

1. `LiveIngestResult` に `counts.skipped_matches: number` と省略可能な `skippedMatches?: SkippedMatch[]` がある
2. `SkippedMatch` 型が `homeTeamName` / `awayTeamName` / `kickoffAt` を持つ
3. チームを解決できない試合が2件あるとき、`counts.skipped_matches` が **2** を返し、`skippedMatches` に2件のチーム名とキックオフが入るテストがある
4. 捨てた試合が0件のとき、`counts.skipped_matches` が **0** で、**`skippedMatches` キー自体がレスポンスに存在しない**テストがある（`"skippedMatches" in result === false` で確認すること。`undefined` との比較にしないこと）
5. `parsedMatches.length === 0` の早期リターンが `counts.skipped_matches: 0` を含む
6. **捨てた試合があっても関数は例外を投げず、呼び出し側も失敗にしない。** 2件捨てた入力で `runLiveIngest` が正常に戻り値を返すテストがある
7. `counts.unknown_teams` と `unknownTeamNames` の算出が変わっていない（`fetched.unknownTeamNames` 由来のまま）。**Top 14 のようにオブジェクトを返すソースで、`unknown_teams` の値が従来と一致することを確認するテストがある**
8. `console.warn` の `Skipping unknown team:` 行が残っている
9. `console.info` の行に `skipped=<件数>` が加わり、既存項目の順序と表記が変わっていない
10. `rejections` の扱いに差分が無い
11. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 検証（PR 本文に書くこと）

- 受け入れ条件3が**実装前に落ちること**を確認してから実装したか（RED → GREEN）。**4・6・7 は現行実装でも通る保護テストであり、RED にはならない**
- 受け入れ条件4を `"skippedMatches" in result` で確認した出力
- PNC 2026 相当の入力（4試合中2件が slug 解決不可）で `counts` がどうなるかの実際の出力

## デプロイ後に Owner が確認すること

- `live-pipeline` の PNC 2026 の行が `skipped=2` を示すこと（**準決勝が終わって対戦が確定すると 0 になる**）
- RWC 2027 など他の大会で `skipped_matches` が想定外に大きくないか

## 未解決の質問

- **チーム未確定の試合を読者に見せるか。** Wikipedia も JRFU も PNC 決勝を「9/19 19:05・秩父宮」と公表しているが、`home_team_id` が NOT NULL のためサイトには何も出ない。`specs/fix-rwc2027-bracket-pending-states.md` が言う「チーム未確定」と「日程未公表」の区別そのもので、**スキーマ変更を伴うため単独の判断が要る**
