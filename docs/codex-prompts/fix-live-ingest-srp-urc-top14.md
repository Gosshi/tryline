# fix-live-ingest-srp-urc-top14: ライブ取込バグ修正

## 背景

`ingest-live-competitions` cron を実行したところ、以下3つのバグが判明した。

- `super-rugby-pacific-2026`: fetch 例外で結果なし
- `urc-2025-26`: 0件（プレーオフ未開始のため全件 `continue` されている）
- `top-14-2025-26`: 0件（同上）

---

## Bug 1 — Super Rugby Pacific: timezone 略称 regex

### ファイル: `lib/ingestion/sources/wikipedia-super-rugby-pacific.ts`

### 原因

Wikipedia のキックオフテキストが `13 February 202619:05 NZDT (UTC+13)` の形式（年と時刻の間にスペースなし、`(UTC+13)` の前に `NZDT` が挟まる）。

現在の regex（47行目）:
```ts
/(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})\s+\(UTC([+-]\d{1,2})\)/
```

`\s+\(UTC` の部分が ` NZDT (UTC+13)` にマッチしない。

### 修正

```ts
// 変更前
/(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})\s+\(UTC([+-]\d{1,2})\)/

// 変更後
/(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})\s+(?:[A-Z]+\s+)?\(UTC([+-]\d{1,2})\)/
```

`(?:[A-Z]+\s+)?` を追加して `NZDT`・`AEST` 等の timezone 略称をオプションで読み飛ばす。

---

## Bug 2 — URC: レギュラーシーズン未対応

### ファイル: `lib/ingestion/sources/wikipedia-urc.ts`

### 原因

`STAGES` にプレーオフ3ラウンドのみ定義されており、レギュラーシーズンのセクション（Wikipedia では `Round_1`〜`Round_18` 形式の h3）は全件 `round === undefined` で `continue` される。2025-26 はレギュラーシーズン中なので 0件になる。

### 修正方針

`lib/ingestion/sources/wikipedia-premiership.ts` の実装を参照し、レギュラーシーズン対応を追加する。

```ts
const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const PLAYOFF_ROUNDS: Record<string, number> = {
  "Quarter-finals": 100,
  "Semi-finals": 101,
  "URC_Grand_Final": 102,
};

function resolveRound(sectionId: string | null): number | undefined {
  if (sectionId === null) return undefined;
  const playoffRound = PLAYOFF_ROUNDS[sectionId];
  if (playoffRound !== undefined) return playoffRound;
  const matched = sectionId.match(ROUND_ID_PATTERN);
  return matched?.[1] !== undefined ? Number(matched[1]) : undefined;
}
```

`parseUrcLiveHtml` のループ内で `getSectionId` の結果を `resolveRound` に渡す。`undefined` なら `continue`。

---

## Bug 3 — Top 14: レギュラーシーズン未対応

### ファイル: `lib/ingestion/sources/wikipedia-top-14.ts`

### 原因

URC と同様、`SECTION_ROUNDS` にプレーオフ4セクションのみ定義。レギュラーシーズン（`Round_1`〜`Round_26`）は全件 `continue` される。

さらに既存スクレイパー由来で `!score` の場合も `continue` しており、scheduled 試合が取れない。

### 修正方針

URC と同様に `ROUND_ID_PATTERN` を追加してレギュラーシーズン対応。`!score` による `continue` を削除し、`parseScoreText`（`live-source-utils.ts`）を使って score なしを scheduled として扱う。

```ts
const ROUND_ID_PATTERN = /^Round_(\d+)$/;
const PLAYOFF_ROUNDS: Record<string, number> = {
  "Relegation_play-off": 0,
  "Semi-final_Qualifiers": 1,
  "Semi-finals": 2,
  Final: 3,
};

function resolveRound(sectionId: string | null): number | undefined {
  if (sectionId === null) return undefined;
  const playoffRound = PLAYOFF_ROUNDS[sectionId];
  if (playoffRound !== undefined) return playoffRound;
  const matched = sectionId.match(ROUND_ID_PATTERN);
  return matched?.[1] !== undefined ? Number(matched[1]) : undefined;
}
```

---

## 変更しないこと

- `lib/scrapers/` 以下のファイル（一切変更しない）
- `lib/ingestion/sources/wikipedia-premiership.ts`（参照するだけ）
- チーム slug マッピング・URL 生成関数
- URC のキックオフ UTC 変換（タイムゾーンオフセットなし）、Top 14 の CET/CEST 変換ロジック

---

## 完了条件

- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
- [ ] cron を再実行したとき `urc-2025-26` と `top-14-2025-26` で `matches_inserted > 0` になる
- [ ] `super-rugby-pacific-2026` が results に含まれ `matches_inserted > 0` になる
