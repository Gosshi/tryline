# 未登録チームの試合が警告なく捨てられ、欠落に気づけない問題

## 背景

`fix-premiership-multiday-kickoff-parse.md`（PR #676、マージ済み）の適用後、2026-08-09 に本番で取り込みを実行したところ、Premiership 2026-27 が **72試合**登録された。

ログ上は成功である。

```
[premiership-2026-27] inserted=72 updated=0 events_inserted=0
```

**スキップの警告は1件も出ていない。**

しかし Wikipedia の 2026-27 ページを確認すると、**10チーム・18ラウンド・90試合**が正しい構成である。18試合が欠落していた。

DB に登録された9チームを数えて初めて判明した。

| 登録されたチーム | 欠落 |
|---|---|
| Bath / Bristol Bears / Exeter Chiefs / Gloucester / Harlequins / Leicester Tigers / Northampton Saints / Sale Sharks / Saracens | **Newcastle Red Bulls** |

9対戦 × 2（ホーム/アウェー） = 18試合が、Newcastle の1チーム分としてまるごと落ちていた。72 + 18 = 90 で数が一致する。

### 直接の原因: リブランド

DB には `newcastle-falcons`（Newcastle Falcons / ニューカッスル・ファルコンズ）として登録されている。

一方 Wikipedia の 2026-27 ページは **Newcastle Red Bulls** と表記している。Red Bull の出資に伴うクラブ名の変更である。

チーム名のマッピングが一致せず、該当試合が捨てられた。

### 構造的な原因: 警告が出ない

`lib/ingestion/sources/wikipedia-premiership.ts`（95-97行）は、チーム名またはスラッグが解決できない試合を**無言で捨てる**。

```ts
if (!homeTeamName || !awayTeamName || !homeTeamSlug || !awayTeamSlug) {
  continue;
}
```

同じファイルの直後（99-106行）には、キックオフの解析失敗に対する警告がある（PR #676 で追加）。

```ts
if (!kickoffAt) {
  console.warn(
    `Skipping Premiership live match with unparseable kickoff: ${homeTeamName} vs ${awayTeamName}`,
  );
  continue;
}
```

**キックオフの失敗は記録され、チーム解決の失敗は記録されない**という非対称がある。

### Premiership だけの問題ではない

2026-08-09 の調査で、**同じ無言スキップが4ファイルに存在する**ことを確認した。

| ファイル | チーム解決の判定 | 警告 |
|---|---|---|
| `lib/ingestion/sources/wikipedia-premiership.ts` | あり | キックオフ用のみ |
| `lib/ingestion/sources/wikipedia-super-rugby-pacific.ts` | あり | **なし** |
| `lib/ingestion/sources/wikipedia-top-14.ts` | あり | **なし** |
| `lib/ingestion/sources/wikipedia-urc.ts` | あり | **なし** |

**これら3大会で現在いくつの試合が落ちているかは分からない。** 警告が無いため、DB の件数を人手で数える以外に検出手段がない。

なお `lib/ingestion/sources/live-source-utils.ts`（135-140行）の `mapWithTeamSlugs` は警告を出す実装になっており、Nations Championship 等はこちらを経由している。**個別実装を持つ4ファイルだけが無言**である。

### Top 14 との関連

Top 14 は2シーズン連続で正規シーズンが欠落している（2024-25 が6試合、2025-26 が5試合。いずれも6月のプレーオフのみ）。既知の別課題として記録されているが、**原因の一部が未登録チームの無言スキップである可能性がある**。

本 spec で警告が出るようになれば、次回の取り込みで実際に何が起きているかが分かる。

## スコープ

対象:
- Premiership のチーム名マッピングに `Newcastle Red Bulls` を追加する
- **チーム解決に失敗した試合を警告として記録する**（Premiership / SRP / Top 14 / URC の4ファイル）

対象外:
- `teams` テーブルの `name` 変更（表示名を「Newcastle Red Bulls」へ改称するか否か。下記「未解決の質問」参照）
- `newcastle-falcons` の slug 変更。URL が変わり既存ページが 404 になる
- Top 14 の正規シーズン欠落の解消（既知の別課題。本 spec は検出手段を用意するに留める）
- `mapWithTeamSlugs` を使う大会の変更（既に警告あり）
- 4ファイルの個別実装を `mapWithTeamSlugs` へ統合するリファクタ（有用だが範囲が広い）
- 取り込み済みデータの修正

## データモデル変更

**なし。マイグレーション不要。**

## API サーフェス

### 1. Newcastle のマッピング追加

`lib/ingestion/sources/wikipedia-premiership.ts` のチーム名マップに `Newcastle Red Bulls` を追加し、既存の `newcastle-falcons` スラッグへ解決させる。

**旧名 `Newcastle Falcons` のエントリも残すこと。** 過去シーズンのページは旧名で書かれており、`lib/scrapers/wikipedia-premiership-results.ts` 経由の履歴取り込みが壊れる。

### 2. 警告の追加

4ファイルのチーム解決失敗箇所に警告を追加する。

文面と形式は `live-source-utils.ts` 135-140行の既存実装に揃えること。**新しい方式を発明しない。**

```ts
console.warn(
  `Skipping live match with unknown team: ${match.homeTeamName} vs ${match.awayTeamName}`,
);
```

**解決できなかった側のチーム名がログから分かること。** 「どちらが未登録か」が分からないと調査に使えない。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. `Newcastle Red Bulls` が `newcastle-falcons` へ解決される。
2. `Newcastle Falcons`（旧名）も引き続き解決される。
3. **チーム解決に失敗した試合が警告としてログに残る。** 対象は Premiership / SRP / Top 14 / URC の4ファイル。
4. 警告から、解決できなかったチーム名が分かる。
5. 警告の文面・形式が `live-source-utils.ts` の既存実装と揃っている。
6. 既存の取り込み挙動が変わらない（スキップする条件自体は変更しない）。
7. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **表示名を「Newcastle Red Bulls」へ変えるか。** `teams.name` を変更すると過去シーズンのページ表示も新名称になる。ラグビーのクラブ改称では過去の記録を旧名で残す慣習もあり、Owner の判断が要る。**本 spec ではマッピングの追加のみを行い、表示名は変更しない。**

2. **SRP・Top 14・URC で現在いくつの試合が落ちているかは不明。** 本 spec で警告が出るようになった後、次回の取り込みログを確認して実態を把握する必要がある。判明した欠落への対応は別途。

3. **4ファイルの個別実装を `mapWithTeamSlugs` へ統合すべきか。** 同じ判定が5箇所（4ファイル＋共通ユーティリティ）に分散しており、今回のように片方だけ警告を持つ状態が生まれる。統合は有用だが影響範囲が広く、本 spec では扱わない。

4. **他の大会でも同種のリブランドが起きうる。** クラブ名の変更は珍しくなく、そのたびに無言で試合が消える。警告が出るようになれば検出はできるが、**ログを定期的に見る運用**が前提になる。通知への接続は別途検討する価値がある。
