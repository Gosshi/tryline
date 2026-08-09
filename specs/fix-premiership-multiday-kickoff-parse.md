# 複数日表記のキックオフで Premiership の取り込みが全滅する問題

## 背景

`feat-european-club-2026-27-season.md`（PR #675、マージ済み）で Premiership 2026-27 を登録し、2026-08-09 に本番で取り込みを実行したところ、**1試合も取り込まれなかった**。

Vercel のランタイムログに原因が出ている。

```
Failed to ingest premiership-2026-27:
Error: Unable to locate Premiership kickoff text: 22/23/24 January 2027
```

Wikipedia の 2026-27 ページには、**開催日が3日間にまたがる表記**の試合がある。放送枠が未確定なラウンドでよくある書き方である。

`lib/ingestion/sources/wikipedia-premiership.ts` の `parseKickoffAt`（59-67行）は単一日付を前提とした正規表現を使い、一致しない場合に例外を投げる。

```ts
const matched = normalized.match(
  /(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})/,
);

if (!matched) {
  throw new Error(`Unable to locate Premiership kickoff text: ${normalized}`);
}
```

同一の実装が `lib/scrapers/wikipedia-premiership-results.ts`（97行）にもある。

### 被害は1試合では済まない

例外は `ingestLiveCompetition` を突き抜け、`ingestAllLiveCompetitions`（`lib/ingestion/live-competitions.ts` 123-143行）の `Promise.allSettled` で rejected になる。

```ts
return results
  .filter((result) => result.status === "fulfilled")
  .map((result) => result.value);
```

**rejected は結果配列から除外される。** そのため次の状態になる。

- **18ラウンド分の日程がすべて失われる**（1試合の日付表記が原因で）
- API レスポンスの `results` に `premiership-2026-27` が現れない
- ワークフローは `status: "ok"` を返し、**success と報告される**
- 失敗は `console.error` にのみ残り、Vercel のログを見ないと分からない

2026-08-09 の実行では、11大会が結果に並ぶ一方で Premiership だけが消えていた。**成功と報告されながら1大会が丸ごと欠落する**構造になっている。

### 既に「スキップして続行」の前例がある

同じ取り込み経路には、解決できないチーム名を持つ試合を**個別にスキップして続行する**実装がある（`lib/ingestion/sources/live-source-utils.ts` 135-140行）。

```ts
if (!homeTeamSlug || !awayTeamSlug) {
  console.warn(
    `Skipping live match with unknown team: ${match.homeTeamName} vs ${match.awayTeamName}`,
  );
  return [];
}
```

2026-08-09 のログでも、Nations Championship の「NTH 1st vs STH 1st」等がこの経路でスキップされ、**他の試合は正常に取り込まれている**。

**日付だけが例外で全滅するという非対称がある。**

### 急ぐ理由

**Premiership 2026-27 は 2026年9月25日に開幕する。** それまでに直さないと、大会ハブは前シーズンの終了済み試合しか表示しない。

グロースロードマップは 2026年11月の日本代表欧州遠征を初のピーク検証としており、そこで集めた来訪者の回遊先として欧州クラブのページを想定している。

## スコープ

対象:
- `parseKickoffAt` が複数日表記を扱えるようにする
- **1試合の解析失敗で大会全体が落ちないようにする**

対象外:
- `lib/ingestion/live-competitions.ts` の `Promise.allSettled` の構造変更。失敗を結果に含める改善は有用だが、本 spec は個別試合の失敗を大会全体へ波及させないことに絞る（下記「未解決の質問」参照）
- URC / Top 14 のパーサ。両大会は 2026-27 の Wikipedia ページが未公開で `No matches found` となっており、これは正常な挙動
- Top 14 の正規シーズン欠落（既知の別課題）
- チームの新規登録

## データモデル変更

**なし。マイグレーション不要。**

## API サーフェス

### 1. 複数日表記への対応

`22/23/24 January 2027` のような表記を扱えるようにする。

**どう解釈するかは実装時に判断すること。** 候補は次のとおり。

- 先頭の日を採る（`22 January 2027`）
- 日付未定として扱い、キックオフを月内の代表値にする

**判断と根拠を報告すること。** 実際の Wikipedia ページで他にどんな表記が使われているかを確認したうえで決めること（`22/23 January`、`TBC` 等の変種がありうる）。

時刻が併記されていない場合の扱いも決めること。現在の正規表現は日付と時刻の両方を要求している。

`lib/scrapers/wikipedia-premiership-results.ts`（97行）にも同一の実装がある。**両方を直すか、共通化するかを判断すること。** 片方だけ直すと同じ知識が2箇所に残る。

### 2. 個別試合の失敗で大会を落とさない

キックオフの解析に失敗した試合は、**例外を投げずにスキップし、警告を出して続行する**。

`live-source-utils.ts` 135-140行の「不明なチーム」の扱いと同じ形にすること。**新しい方式を発明しない。**

スキップした試合が分かるよう、ログには試合の識別に足る情報（対戦カード等）を含めること。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. `22/23/24 January 2027` 形式のキックオフ表記が解析できる、またはスキップされる。**例外を投げない。**
2. **1試合の解析に失敗しても、同じ大会の他の試合が取り込まれる。** これを満たすテストがあること（本 spec の中心的な条件）。
3. スキップした試合が警告としてログに残り、対戦カードが識別できる。
4. `lib/ingestion/sources/wikipedia-premiership.ts` と `lib/scrapers/wikipedia-premiership-results.ts` の両方が同じ挙動になっている（共通化してもよい）。
5. 既存の単一日付表記の解析が壊れていない。
6. 他大会の取り込みに影響がない。
7. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **`ingestAllLiveCompetitions` が失敗を結果から除外する構造は残る。** 本 spec は Premiership の個別事象を塞ぐが、他大会で例外が出れば同じく「成功と報告されて1大会が消える」状態になる。失敗を結果に含めてログとレスポンスの両方に出す改善は別途検討する価値がある。**2026-08-09 の事象は、Vercel のランタイムログを直接見なければ発見できなかった。**

2. **`clearFutureZeroScores` の効果は未検証。** PR #675 で追加した「未実施試合の 0-0 をスコアなしへ正規化する」処理は、Premiership が取り込まれていないため本番で一度も動いていない。本 spec のマージ後、取り込みが通った時点で**スコアが `null` で入っているか（`0` でないか）を必ず確認すること**。

3. **URC と Top 14 の 2026-27 ページ公開時期が不明。** 2026-08-09 時点では `No matches found` で、ページが未公開と見られる。公開されれば自動的に取り込まれるが、同種の複数日表記で同じ問題が起きる可能性がある。
