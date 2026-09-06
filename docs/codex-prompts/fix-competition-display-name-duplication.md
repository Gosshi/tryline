仕様書 `specs/fix-competition-display-name-duplication.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**RSS のタイトルで大会名の年が二重に出ています。**

```
<title>オーストラリア 対 日本 — リポビタンDチャレンジカップ2026 2026</title>
<title>フィジー 対 スコットランド — Nations Championship 2026 2026</title>
```

年の二重表記に加えて、**日本語名があるのに英語名が出ています**（Nations Championship）。

## 原因は特定済みです

`lib/db/queries/match-content.ts:195-197` の `listPublishedRecapsForFeed` が、**`name_ja ?? name` と `season` を無条件に連結**しています。

一方 `lib/format/competition.ts:38` の `formatCompetitionTitle` には**重複ガードが実装済み**です。

```
return displayName.includes(season) ? displayName : `${displayName} ${season}`;
```

**RSS 経路がこのガードを通っていません。** 同じ整形が2箇所に別実装で存在し、片方だけ正しい状態です。

英語名が出るのも同じ理由で、`getCompetitionDisplayName`（`lib/format/competition.ts:13`）は `nameJa → family別の日本語名 → name` の順にフォールバックしますが、RSS 経路は `name_ja ?? name` しか見ておらず、**`JAPANESE_COMPETITION_NAMES_BY_FAMILY` を経由していません。**

## 触るファイル

```
lib/db/queries/match-content.ts
```

**`lib/format/competition.ts` を変更しないでください。** 既存のガードは正しいので、呼ばせるだけです。

`formatCompetitionTitle` は `family` と `slug` も取るので、**クエリの select を広げる必要があります。**

## DB を直さないでください

**`competitions.name_ja` を更新しないでください。** 大会名の権威はコード側の取り込み定数で、**DB を直しても6時間で戻ります**（`project_competition_name_ja_overwritten_by_ingest`）。表示側で正しい関数を通すことが唯一の解です。

## 洗い出してください

**`season` を大会名へ直書き連結している箇所を横断で探してください。** `formatCompetitionTitle` を通していないものを列挙し、置き換えたか意図的に対象外としたかを **PR 本文に書いてください。**

## 変えてはいけないもの

**`/rss.xml` の item 構造と `<guid>` を変えないでください。** 購読者の既読状態が壊れます。フィード URL も変えません。

## 本番確認

マージ・デプロイ後に `/rss.xml` を取得し、**`20[0-9]{2}[^0-9]*20[0-9]{2}</title>` にマッチするタイトルが0件**であることを確認してください。

## テスト

**`pnpm test` だけを完了根拠にしないでください。** `exclude` が `tests/db/**` を実行しません。DB をモックしたテストを除外外の新規ファイルに置き、**実行結果を PR 本文に貼ってください。**

必ず入れるケース: 年を含む大会名（`リポビタンDチャレンジカップ2026` + season `2026`）で二重にならないこと、含まない大会名（`プレミアシップ` + `2026-27`）で従来どおり連結されること、`name_ja` が null で family 別の日本語名がある大会で日本語が出ること。
