# 大会ファミリーページのタイトルが英語で CTR を落としている

## 背景

**検索順位は取れている。落としているのはクリック率で、原因はタイトルが英語であること。**

### 実測（GSC、2026-07-28〜08-24 の28日、`--dims page`）

| URL                            | 表示回数 | クリック |      CTR | 平均順位 |
| ------------------------------ | -------: | -------: | -------: | -------: |
| `/c/pnc/2026`（シーズン）      |       79 |        6 | **7.6%** |      9.5 |
| `/c/pnc`（ファミリー）         |       88 |        1 | **1.1%** |     10.4 |
| `/c/premiership`（ファミリー） |      107 |        2 | **1.9%** |      9.7 |

**同一サイト・同一大会（pnc）・ほぼ同じ順位帯で、CTR が 7.6% と 1.1%。約7倍の差がある。** 順位が同じである以上、差はスニペット（タイトル・説明文）にしかない。

### 本番の実タイトル（2026-08-31 取得）

```
/c/premiership          <title>Premiership 順位表・日程・日本での視聴方法 | Tryline</title>
/c/premiership/2026-27  <title>プレミアシップ 2026-27 日程・見どころ | Tryline</title>

/c/pnc                  <title>Pacific Nations Cup 順位表・日程・日本での視聴方法 | Tryline</title>
/c/pnc/2026             <title>パシフィック・ネーションズカップ 2026 日程・見どころ | Tryline</title>
```

**ファミリーページだけ大会名が英語。** シーズンページは日本語。meta description は両方とも日本語なので、**タイトルだけの問題**である。

日本語話者が「プレミアシップ 順位」「パシフィック・ネーションズカップ 2026」で検索したとき、検索結果に英語表記のタイトルが並ぶ。これが CTR 差の説明として最も整合する。

### Bing でも同じ構造

Bing Webmaster Tools（2026-08-25〜08-28 の4日）の実測でも、**掲載順位は1〜7位と高いのにクリックが付かないクエリ**がある。

| クエリ                                |   表示 | クリック | 平均掲載順位 |
| ------------------------------------- | -----: | -------: | -----------: |
| `リポビタンdチャレンジカップ2026`     | **12** |    **0** |            6 |
| `リポビタンdチャレンジカップ2026結果` |      2 |        1 |            5 |

Bing 全体は 16クリック / 247表示（CTR 6.48%）で、Google（31クリック / 1401表示、CTR 2.21%）より**クリック数で約3.6倍**。**Bing の方が流入が大きいため、CTR 改善の効き幅も大きい。**

ただし Bing の `GetPageStats` は 2026-08-31 時点でまだ 0 件を返すため、**どのページに着地しているかは未確認**。上表を本 spec の直接の根拠には使わない（傍証として扱う）。

## 原因

**同じ「ファミリーの表示名」に対してマップが2つ存在し、ファミリーページは英語側を使っている。**

`lib/format/competition.ts:67-82` の `FAMILY_DISPLAY_NAMES`（**14件中11件が英語**）:

```ts
const FAMILY_DISPLAY_NAMES: Record<string, string> = {
  "autumn-nations": "Autumn Nations",
  "league-one": "ジャパンラグビー リーグワン",
  "lipovitan-challenge-cup": "リポビタンDチャレンジカップ",
  "nations-championship": "Nations Championship",
  "pacific-nations-cup": "Pacific Nations Cup",
  pnc: "Pacific Nations Cup",
  "puma-trophy": "プーマ・トロフィー",
  premiership: "Premiership",
  "rugby-championship": "The Rugby Championship",
  rwc: "Rugby World Cup",
  "six-nations": "Six Nations",
  "super-rugby-pacific": "Super Rugby Pacific",
  "top-14": "Top 14",
  urc: "URC",
};
```

`lib/format/japanese-names.ts:82-95` の `JAPANESE_COMPETITION_NAMES_BY_FAMILY`（**全件日本語**）:

```ts
export const JAPANESE_COMPETITION_NAMES_BY_FAMILY: Record<string, string> = {
  "autumn-nations": "オータムネーションズシリーズ",
  "nations-championship": "ネーションズチャンピオンシップ",
  "league-one": "ジャパンラグビー リーグワン",
  "pacific-nations-cup": "パシフィック・ネーションズカップ",
  pnc: "パシフィック・ネーションズカップ",
  premiership: "プレミアシップ",
  "rugby-championship": "ザ・ラグビーチャンピオンシップ",
  rwc: "ラグビーワールドカップ",
  "six-nations": "シックスネイションズ",
  "super-rugby-pacific": "スーパーラグビー・パシフィック",
  "top-14": "トップ14",
  urc: "ユナイテッド・ラグビー・チャンピオンシップ",
};
```

- **ファミリーページ**（`app/c/[competition]/page.tsx:53`）は `formatFamilyName(competition)` を呼ぶ → 英語側
- **シーズンページ**は `getCompetitionDisplayName` / `formatCompetitionTitle` 経由 → 日本語側（`lib/format/competition.ts:24-28`）

### 見落としやすい点（重要）

**2つのマップは収録キーが一致していない。**

| family                    | 英語マップ                  | 日本語マップ |
| ------------------------- | --------------------------- | ------------ |
| `lipovitan-challenge-cup` | リポビタンDチャレンジカップ | **無し**     |
| `puma-trophy`             | プーマ・トロフィー          | **無し**     |

**単純に日本語マップへ差し替えると、この2つが失われて slug のタイトルケース（`Lipovitan Challenge Cup` / `Puma Trophy`）に落ちる。** 現在は英語マップ側に日本語で入っているため正しく表示されている。この退行を起こしてはならない。

## スコープ

対象:

- `lib/format/competition.ts` の `formatFamilyName` の解決順序
- `tests/format/competition.test.ts` の更新

対象外:

- **`app/` 配下のページの変更**。`formatFamilyName` の戻り値を変えるだけで、呼び出し側は一切触らない
- `getCompetitionDisplayName` / `formatCompetitionTitle` / `JAPANESE_COMPETITION_NAMES_BY_FAMILY` の変更
- シーズンページのタイトル・説明文
- meta description の変更（既に日本語で、今回の CTR 差の原因ではない）
- **タイトルへのシーズン（年）の追加**（後述の未解決の質問）
- OG 画像の生成ロジック
- 2つのマップの統廃合。**今回は解決順序だけを変える**

## データモデル変更

**なし。**

## API サーフェス

**なし。** `formatFamilyName(family: string): string` のシグネチャは変えない。

## 実装方針

`formatFamilyName` の解決順序を **日本語マップ優先**に変える。

```ts
export function formatFamilyName(family: string): string {
  return (
    JAPANESE_COMPETITION_NAMES_BY_FAMILY[family] ??
    FAMILY_DISPLAY_NAMES[family] ??
    family.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
```

**この順序にする理由**: 日本語マップに無い `lipovitan-challenge-cup` / `puma-trophy` は `FAMILY_DISPLAY_NAMES` にフォールバックして日本語のまま残る。1行の追加で、**11件を日本語化しつつ2件の退行を防げる**。

`FAMILY_DISPLAY_NAMES` は**削除しない**。フォールバック先として必要である。

### 影響範囲

`formatFamilyName` は以下から呼ばれており、**すべて日本語表示が望ましい面**である（英語を必要とする呼び出し元は無い）。

| 呼び出し元                                                        | 用途                                         |
| ----------------------------------------------------------------- | -------------------------------------------- |
| `app/c/[competition]/page.tsx:53,67,101,112`                      | ファミリーページの title / OG / alt / 見出し |
| `app/c/[competition]/[season]/page.tsx:415,467,637,653`           | シーズンページの OG / 見出し / alt           |
| `app/c/[competition]/[season]/standings/page.tsx:108,144,166`     | 順位表ページの構造化データ名 / 見出し        |
| `app/c/[competition]/[season]/round/[round]/page.tsx:297,333,352` | ラウンドページの構造化データ名 / 見出し      |
| `app/page.tsx:419,462,465,772,808,827`                            | トップページの大会名表示                     |

**シーズンページの見出し（`:467` の `familyTitle` 等）も日本語に変わる。** これは意図した改善であり、現在シーズンページの `<title>` が日本語なのに見出しが英語という不整合が解消される。

## UI サーフェス

大会名の表示文字列が英語から日本語に変わる。**レイアウト・DOM 構造・クラスは変更しない。**

日本語名は英語名より長いものがある（例: `URC` → `ユナイテッド・ラグビー・チャンピオンシップ`、23文字）。

**OG 画像は 2026-08-31 に実物で確認済み・対応不要。** 本番の `/api/og?type=competition&family_name=<最長の日本語名>&accent=%2300823E` は HTTP 200 / 1200x630 を返し、23文字が2行に折り返して中央に収まった。はみ出し・見切れなし。

トップページの大会カード（`app/page.tsx:419,462,465`）はデプロイ後に実機確認する。

## LLM 連携

**なし。**

## 受け入れ条件

1. `formatFamilyName("premiership")` が `"プレミアシップ"` を返す。
2. `formatFamilyName("pnc")` と `formatFamilyName("pacific-nations-cup")` がいずれも `"パシフィック・ネーションズカップ"` を返す。
3. `formatFamilyName("urc")` が `"ユナイテッド・ラグビー・チャンピオンシップ"` を返す。
4. `formatFamilyName("nations-championship")` が `"ネーションズチャンピオンシップ"` を返す。
5. `formatFamilyName("top-14")` が `"トップ14"` を返す。
6. **`formatFamilyName("lipovitan-challenge-cup")` が `"リポビタンDチャレンジカップ"` を返す**（日本語マップに無いためフォールバックが効くこと）。
7. **`formatFamilyName("puma-trophy")` が `"プーマ・トロフィー"` を返す**（同上）。
8. `formatFamilyName("league-one")` が `"ジャパンラグビー リーグワン"` を返す（両マップに存在、値は同一）。
9. どちらのマップにも無いキー（例 `"unknown-cup"`）でタイトルケースのフォールバックが従来どおり動く。
10. `tests/format/competition.test.ts` の既存の `formatFamilyName` テストを、上記の新しい期待値に更新する。**英語を期待している既存アサーション（`"Pacific Nations Cup"` / `"Rugby World Cup"` 等）は日本語に書き換える。**
    10b. **`formatFamilyName` の戻り値を検証している他のテストも更新する。** 2026-08-31 の PR #744 で実際に7件落ちた。対象は次の4ファイル（モックの入力値として英語名を渡しているだけの箇所は変更不要。**出力を検証しているアサーションだけ**が対象）:

- `tests/app/competition-guide-metadata.test.ts`（OG URL の `family_name`。**`URLSearchParams` でパーセントエンコードされるため、`new URL(...).searchParams.get("family_name")` でデコードして比較する**）
- `tests/app/competition-hub-indexing.test.tsx`（画像 alt、3件）
- `tests/app/home-page.test.tsx`（RWC アーカイブカード）
- `tests/app/season-page-ia.test.tsx`（画像 alt、パンくず JSON-LD の `name`）

11. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る。
12. `app/` 配下のファイルを変更していない。

## やってはいけないこと

- **`FAMILY_DISPLAY_NAMES` を削除しないこと。** `lipovitan-challenge-cup` と `puma-trophy` の唯一の供給源であり、消すと日本語表示が失われる。
- **`JAPANESE_COMPETITION_NAMES_BY_FAMILY` に項目を追加して解決しないこと。** このマップは `getCompetitionDisplayName` が `competitions.name_ja` のフォールバックとして使う別責務のものであり、取り込み側の定数と対応関係がある（`project_competition_name_ja_overwritten_by_ingest` の経緯）。今回はファミリー表示名の解決順序だけを変える。
- **2つのマップを統合しないこと。** 責務が異なる。統合するなら別 spec で経緯を確認してから。
- 呼び出し元（`app/` 配下）を変更しないこと。
- meta description を変更しないこと。今回の CTR 差の原因ではない。
- **タイトルにシーズン（年）を足さないこと。** 下記の未解決の質問で Owner が判断する。
- `getCompetitionDisplayName` の `language === "en"` 分岐に手を入れないこと。

## 検証方法（マージ後）

1. デプロイ後、`curl -s --compressed https://www.trylinerugby.com/c/premiership | grep -oE '<title>[^<]*</title>'` が `プレミアシップ` を含むこと
2. **効果測定**: GSC で `/c/premiership` と `/c/pnc` の CTR を、マージ前28日と後28日で比較する。取得は `--dims page` を使う（既定の `query,page` はクリックを取りこぼす）
3. 判定の注意: **2026-09-25 に URC・プレミアシップが開幕して表示回数が跳ね上がる。** 絶対クリック数ではなく **CTR** で判定しないと、開幕効果と区別できない

## 未解決の質問（Owner 判断）

**ファミリーページのタイトルにシーズン（年）を含めるか。**

Bing の実測クエリは年を含むものが多い（`リポビタンdチャレンジカップ2026` / `ネーションズチャンピオンシップ2026 結果` / `オールブラックス2026日程`）。一方でファミリーページのタイトルには年が無い。

- **含める場合**: 「プレミアシップ 2026-27 順位表・日程」のようになり年クエリに一致しやすくなるが、**シーズンページ（`/c/premiership/2026-27`）とタイトルがほぼ重複し、共食いする恐れがある**
- **含めない場合**: 役割分担は明確（ファミリー=大会そのもの、シーズン=その年）だが、年つきクエリはシーズンページに任せることになる

**本 spec では含めない。** 日本語化の効果を単独で測ってから判断するのが、変数を1つに保つ意味で妥当と考える。Bing の `GetPageStats` が返るようになれば、どちらのページが年クエリを取っているかが分かり判断材料が増える。
