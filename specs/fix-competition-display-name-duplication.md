# fix-competition-display-name-duplication

## 背景

RSS フィードの記事タイトルで、**大会名の年が二重に出ている**（2026-09-06 実測、本番）。

```
<title>オーストラリア 対 日本 — リポビタンDチャレンジカップ2026 2026</title>
<title>フィジー 対 スコットランド — Nations Championship 2026 2026</title>
<title>オーストラリア 対 イタリア — Nations Championship 2026 2026</title>
```

**2 つの問題が同時に出ている。**

1. **年の二重表記**: 大会名に既に「2026」が含まれているのに、シーズンを無条件に連結している
2. **英語名の露出**: 「Nations Championship」は日本語名（ネーションズチャンピオンシップ）があるのに英語で出ている

### 原因

`lib/db/queries/match-content.ts:195-197` の `listPublishedRecapsForFeed` が、**`name_ja ?? name` と `season` を無条件に連結**している。

一方 `lib/format/competition.ts:38` の `formatCompetitionTitle` には**重複ガードが実装済み**である。

```
return displayName.includes(season)
  ? displayName
  : `${displayName} ${season}`;
```

**RSS 経路はこのガードを通っていない。** 同じ整形が 2 箇所に別実装で存在し、片方だけが正しい。

英語名が出るのも同様で、`getCompetitionDisplayName`（`lib/format/competition.ts:13`）は `nameJa → family 別の日本語名 → name` の順にフォールバックするが、RSS 経路は `name_ja ?? name` しか見ておらず、**family 別の日本語名テーブル（`JAPANESE_COMPETITION_NAMES_BY_FAMILY`）を経由していない。**

### なぜ問題か

RSS はフィードリーダーと外部サービスに配信される。**Tryline の外に出る表示**であり、二重表記と英語混在はそのまま読者に届く。

`project_competition_name_ja_overwritten_by_ingest` のとおり、**大会名の権威はコード側の定数**であって DB ではない。DB の `name_ja` を直しても取り込みで戻るため、**表示側で正しい関数を通すことが唯一の解**になる。

## スコープ

対象:
- `lib/db/queries/match-content.ts`: `listPublishedRecapsForFeed` の大会名生成を既存の共通関数へ置き換える
- 同種の直書き連結が他にないかの洗い出しと、見つかった場合の置き換え

対象外:
- `lib/format/competition.ts` の**ロジック変更**（既存のガードは正しい。呼ばせるだけ）
- DB の `competitions.name_ja` の更新（**取り込み定数が権威**。DB を直しても 6 時間で戻る）
- `JAPANESE_COMPETITION_NAMES_BY_FAMILY` への大会追加（別 spec）
- OG 画像・メール・X 投稿の大会名（本 spec では RSS と、洗い出しで見つかった直書き箇所に限る）

## データモデル変更

なし。

## API サーフェス

`/rss.xml` の `<title>` の文字列が変わる。**フィード URL・item の構造・`<guid>` は変えない**（購読者の既読状態を壊さないため）。

## UI サーフェス

なし。

## LLM 連携

なし（コスト影響ゼロ）。

## 変更詳細

`listPublishedRecapsForFeed` の `competitionName` 生成を、`lib/format/competition.ts` の `formatCompetitionTitle` に置き換える。

`formatCompetitionTitle` は `CompetitionDisplayInput`（`family` / `name` / `nameJa` / `slug`）と `season` を取るので、**クエリで `competition.family` と `competition.slug` も取得する必要がある。** 現在 `name_ja` と `name` と `season` しか読んでいない場合は select を広げる。

**同種の直書きを洗い出すこと。** `season` を大会名へ連結している箇所を横断で探し、`formatCompetitionTitle` を通していないものを列挙して PR 本文に書く。置き換えるか、意図的に対象外とするかを明記する。

## 受け入れ条件

**テスト実行の条件**: 既定の `pnpm test` は `vitest.config.ts` の `exclude` により `tests/db/**` を実行しない。除外されていない新規ファイルに DB をモックしたテストを置くか、除外を外した実行コマンドを用意し、**PR 本文に実行コマンドと結果を貼ること。**

1. 大会名に既に年が含まれる場合（`リポビタンDチャレンジカップ2026`、season `2026`）、フィードのタイトルが **`リポビタンDチャレンジカップ2026` で終わり、`2026 2026` にならない**ことを検証するテストがある
2. 大会名に年が含まれない場合（`プレミアシップ`、season `2026-27`）、従来どおり `プレミアシップ 2026-27` になることを検証するテストがある
3. `name_ja` が null で family 別の日本語名が存在する大会（Nations Championship）で、**英語名ではなく日本語名が出る**ことを検証するテストがある
4. `name_ja` も family 別の日本語名も無い大会で、`name` にフォールバックすることを検証するテストがある
5. `lib/format/competition.ts` に差分が無い（既存ロジックを変更していない）
6. `/rss.xml` の item 構造と `<guid>` に差分が無い
7. `season` を大会名へ直書き連結している箇所の洗い出し結果が PR 本文に列挙され、各々について置き換え済みか意図的な対象外かが明記されている
8. `pnpm typecheck` が green
9. **本番確認**: マージ・デプロイ後に `/rss.xml` を取得し、`20[0-9]{2}[^0-9]*20[0-9]{2}</title>` にマッチするタイトルが 0 件であることを確認する

## 未解決の質問

なし。原因・置き換え先・境界条件は本 spec で確定している。

**本 spec で解決しないこと**: **`JAPANESE_COMPETITION_NAMES_BY_FAMILY` に登録の無い大会は英語名のまま出る。** 本 spec は「正しい関数を通す」ことまでで、日本語名の追加は別途。洗い出しで英語名のまま残る大会が見つかった場合は、PR 本文に列挙して Owner へ渡すこと。
