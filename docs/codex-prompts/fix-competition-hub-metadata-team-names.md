仕様書 `specs/fix-competition-hub-metadata-team-names.md` を実装してください。**先に全文を読んでください。**

大会ハブの `<title>` と `<meta name="description">` だけを変えます。**画面表示は変えません。**

## なぜやるか（Bing 実測・2026-08-25〜09-07）

総計 1,727 表示 / 92 クリック。**表示のほぼ全量が大会ハブに集中しています。**

```
 表示 クリック   CTR  平均順位  ページ
  157      8   5.1%    7.0    /c/pnc/2026
  145      4   2.8%    5.0    /c/lipovitan-challenge-cup/2026
  107     22  20.6%    4.0    /c/greatest-rivalry/2026     ← 突出
   92      2   2.2%    7.0    /c/lipovitan-challenge-cup
   55      5   9.1%    6.0    /c/nations-championship/2026
```

**平均表示順位は 4〜8 位で 1 ページ目に出ています。順位が原因ではありません。**

同じ大会ハブで CTR が 9 倍違います。差は title です（本番の実際の出力）。

```
20.6%  グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征 2026 最新結果・次戦・日程
 2.8%  リポビタンDチャレンジカップ2026 最新結果・次戦・日程
 2.2%  リポビタンDチャレンジカップ 順位表・日程・日本での視聴方法
```

**効いているのはチーム名です。** クエリ側も「オールブラックス2026日程」「南アフリカ　オールブラックス　2026年8月」「ノーザンプトン・セインツ」が上位で、**検索者は大会ではなくチームを追っています。**

リポビタンは description には「オーストラリア・カナダ・フィジー代表と対戦します」と書いてあるのに、**title に無い**のが問題です。

## 新しい DB クエリを足さないでください

`generateMetadata`（`app/c/[competition]/[season]/page.tsx:492-497`）は**既に両方を読んでいます**。

```ts
const [matches, standings] = await Promise.all([
  listMatchesForCompetition(comp.slug),
  getStandingsForCompetition(comp.slug),
]);
```

チーム名はここから取れます。

```
MatchListItem.homeTeam / awayTeam   nameJa?: string | null   lib/db/queries/matches.ts:26-45
StandingRow                          teamName: string         lib/db/queries/standings.ts:10
```

`teams` は **91/91 が name_ja を保有**しています（2026-09-10 本番実測）。null のときは `name` にフォールバックしてください。

**PR #636 で、`generateMetadata` への依存追加が既存テストのモック不足を突いて CI を壊した前例があります。** 既存の 2 つの戻り値だけを使ってください。

## やること

**1. title にチーム名**

参加チームが少数（目安 2〜4）のとき含めてください。**リーグ戦のようにチーム数が多い大会では列挙しないでください** — 14 チーム並べた title は検索結果で切れて逆効果です。**閾値は実装が決め、PR 本文に書いてください。**

並び順は決定論的にしてください。日本語の検索結果は概ね 30 字前後で切れるので、**「| Tryline」込みの全長を PR 本文に記載**してください。

**2. description を大会固有に**

`getCompetitionHubMetadataCopy`（`[season]/page.tsx:307`）の定型に、検証済みの情報を足してください。`/c/pnc/2026` は今「パシフィック・ネーションズカップ 2026 の日程・見どころを掲載。」で、大会名を差し替えただけです。

書いてよいもの: 参加チーム名 / 試合数・開催期間（`matches` の `kickoff_at`）/ 順位表の有無・レビューの有無（既に `hasStandings`・`hasRecap` として渡っています）

**3. family ハブ**

`app/c/[competition]/page.tsx:58`。**description にだけある対戦相手を title へ上げる**のが最小の変更です。

## やってはいけないこと

- **放送・配信サービス名を書くこと。** 今後 321 試合中 0 試合しか放送データがありません（2026-09-10 実測）。2026-09-09 に検証できないサービス名を 11 件のガイドから削除したばかりです
- **LLM に description を書かせること。** 検証していない事実の混入経路になります
- 本文・レイアウト・見出しを変えること
- `app/c/rwc/2027/page.tsx` を触ること（独自ルート・別 spec）
- OG 画像、順位、構造化データを変えること
- `generateMetadata` に新しい DB クエリを足すこと

## 完了の定義

受け入れ条件 1〜12 を満たすこと。特に:

- lipovitan の season / family 両方の title にチーム名（条件 1・2）
- **チーム数が閾値超なら列挙しない**（条件 3）
- `nameJa` が null で `name` にフォールバック（条件 4）
- **並び順が決定論的**（条件 5・同じ入力で 2 回呼んで同一文字列）
- `/c/pnc/2026` の description がテンプレのままでない（条件 6）
- **description に放送・配信サービス名が含まれない**（条件 7）
- **新しい DB クエリが追加されていない**（条件 8）
- **画面表示に差分が無い**（条件 10）

**PR 本文に、変更後の title / description の全文を 5 大会分（lipovitan family / lipovitan 2026 / pnc 2026 / nations-championship 2026 / greatest-rivalry 2026）と文字数を記載してください。部分ではなく全文です。**

テストは `tests/app/`（`exclude` 非該当。確認済み）。既存の `tests/app/season-page-ia.test.ts` を壊さないでください。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**CTR が上がる保証はありません。** 相関の観察であって対照実験ではなく、母数的に A/B テストも成立しません。「CTR を改善した」と報告しないでください。効果は Bing Webmaster の CTR を同じ取得条件で数週間後に再取得して比べます。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
