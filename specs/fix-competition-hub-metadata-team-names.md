# fix-competition-hub-metadata-team-names

> GPT-6 監査 **A-4 3（P2）**「descriptionの定型は確定日程・日本戦・視聴確認状況の差を伝えない」に対する、**実測に基づく回答**。2026-09-10 の Bing Webmaster 実データで、対象と原因が特定できたため spec 化する。

## 背景

### 順位は取れている。落ちているのはクリック

Bing Webmaster Tools 実測（2026-08-25〜09-07 の 14 日、`tmp/bing/`）。総計 1,727 表示 / 92 クリック / CTR 5.33%。**表示のほぼ全量が大会ハブに集中している。**

| 表示 | クリック | CTR | 平均表示順位 | ページ |
|---:|---:|---:|---:|---|
| 157 | 8 | 5.1% | 7.0 | `/c/pnc/2026` |
| 145 | 4 | **2.8%** | 5.0 | `/c/lipovitan-challenge-cup/2026` |
| 107 | 22 | **20.6%** | 4.0 | `/c/greatest-rivalry/2026` |
| 92 | 2 | **2.2%** | 7.0 | `/c/lipovitan-challenge-cup` |
| 55 | 5 | 9.1% | 6.0 | `/c/nations-championship/2026` |
| 43 | 0 | **0.0%** | 8.0 | `/c/rwc/2027` |
| 11 | 0 | 0.0% | 4.0 | `/c/super-rugby-pacific/2026` |

**平均表示順位は 4〜8 位。** 検索結果の 1 ページ目に出ている。**「順位が低いから読まれない」ではない。**

同じ大会ハブで **CTR が 20.6% と 2.2% で 9 倍違う**。順位差では説明できない（lipovitan 5.0 位 / greatest-rivalry 4.0 位）。

### 差はタイトルにある

本番の実際の出力（2026-09-10 実測）。

```
20.6%  グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征 2026 最新結果・次戦・日程
 2.8%  リポビタンDチャレンジカップ2026 最新結果・次戦・日程
 2.2%  リポビタンDチャレンジカップ 順位表・日程・日本での視聴方法
 5.1%  パシフィック・ネーションズカップ 2026 日程・見どころ
```

**効いているのは「オールブラックス」「南アフリカ」というチーム名である。** 大会名だけの 3 本はいずれも CTR が低い。

クエリ側も同じ方向を示す。上位に **「オールブラックス2026日程」「南アフリカ　オールブラックス　2026年8月」「ノーザンプトン・セインツ」** が並ぶ。**検索者は大会ではなくチームを追っている。**

リポビタンの family ページは、**description には「オーストラリア・カナダ・フィジー代表と対戦します」と書いてあるのに title に無い。** 検索結果で最初に読まれるのは title である。

### description のテンプレ

`/c/pnc/2026` の description は「パシフィック・ネーションズカップ 2026 の日程・見どころを掲載。」。**大会名を差し替えただけで、その大会固有の情報が 1 つも無い。** 157 表示ある面である。

## スコープ

対象:
- season ハブ（`app/c/[competition]/[season]/page.tsx` の `generateMetadata`、`:484-513`）の title / description
- family ハブ（`app/c/[competition]/page.tsx` の `:57-58`）の title / description
- テスト

対象外:
- **本文・レイアウト・見出しの変更**。metadata のみ
- **新しい DB クエリの追加**（後述。既存の取得で足りる）
- `/c/rwc/2027`（`app/c/rwc/2027/page.tsx` の独自ルート）。**0 クリック / 43 表示だが原因が別**で、別 spec とする
- OG 画像
- 放送・視聴情報の追記。**今後 321 試合中 0 試合しか放送データが無い**（2026-09-10 実測）。書けない
- 順位・構造化データ

## データモデル変更

なし。**新規クエリも不要。**

`generateMetadata`（`:492-497`）は既に両方を読んでいる。

```ts
const [matches, standings] = await Promise.all([
  listMatchesForCompetition(comp.slug),
  getStandingsForCompetition(comp.slug),
]);
```

チーム名はどちらからも取れる。

| 取得元 | 日本語名 |
|---|---|
| `MatchListItem.homeTeam` / `awayTeam` | `nameJa?: string \| null`（`lib/db/queries/matches.ts:26-45`） |
| `StandingRow` | `teamName: string`（`lib/db/queries/standings.ts:10`） |

**`teams` は 91/91 が `name_ja` を保有**（2026-09-10 本番実測）。`nameJa` が null のときは既存の `name` にフォールバックする。

**`generateMetadata` に新しい DB クエリを足さないこと。** PR #636 で、同関数への依存追加が既存テストのモック不足を突いて CI を壊した前例がある（`feedback_generatemetadata_dependency_test_break`）。既存の 2 つの戻り値だけを使う。

## API サーフェス / UI サーフェス

なし。**画面表示は変わらない。** 変えるのは `<title>` と `<meta name="description">`、および OG の対応フィールド。

## LLM 連携

なし。コスト $0。**description を LLM に書かせない。** 大会ごとに生成すると、検証していない事実（放送予定・優勝予想など）が混入する経路になる。

## 変更詳細

### 1. title にチーム名を入れる

**参加チームが少数（目安 2〜4）のとき、title にチーム名を含める。**

- 出典は `standings` の `teamName`、無ければ `matches` の `homeTeam.nameJa` / `awayTeam.nameJa` の和集合
- **`nameJa` が null / 空なら `name` を使う**
- 順序は決定論的にすること（表示順のゆらぎで title が変わらない）

**チーム数が多い大会（リーグ戦）では列挙しない。** 14 チームを並べた title は検索結果で切れて逆効果になる。**何チームまで列挙するかを実装が決め、その閾値を PR 本文に書くこと。**

title の長さに上限を設ける。**日本語の検索結果は概ね 30 字前後で切れる。**「| Tryline」を含めた全長を PR 本文に記載すること。

### 2. description のテンプレを大会固有にする

`getCompetitionHubMetadataCopy`（`app/c/[competition]/[season]/page.tsx:307`）が返す定型に、**その大会で検証済みの情報**を足す。

**書いてよいもの**（すべて既に取得済みのデータから導ける）:
- 参加チーム名
- 試合数・開催期間（`matches` の `kickoff_at` から）
- 順位表の有無、レビューの有無（既に `hasStandings` / `hasRecap` として渡っている）

**書いてはいけないもの**:
- **放送・配信サービス名**。今後 321 試合中 0 試合しかデータが無い。2026-09-09 に検証できないサービス名を 11 件のガイドから削除したばかりである
- 優勝予想・注目選手など、DB に無い評価

### 3. family ハブ

`app/c/[competition]/page.tsx:58` の title も同様に扱う。**現在 description にだけ入っている対戦相手を title へ上げる**のが最小の変更である。

## 受け入れ条件

1. `/c/lipovitan-challenge-cup/2026` の title に**参加チーム名が含まれる**ことを検証するテストがある
2. `/c/lipovitan-challenge-cup`（family）の title に**参加チーム名が含まれる**ことを検証するテストがある
3. チーム数が閾値を超える大会で**チーム名を列挙しない**ことを検証するテストがある
4. `nameJa` が null のチームで **`name` にフォールバックする**ことを検証するテストがある
5. **チームの並び順が決定論的である**ことを検証するテストがある（同じ入力で 2 回呼んで同一文字列）
6. `/c/pnc/2026` の description が**「〜の日程・見どころを掲載。」のテンプレのままでない**ことを検証するテストがある
7. **description に放送・配信サービス名が含まれない**ことを検証するテストがある
8. **`generateMetadata` に新しい DB クエリが追加されていない**

    **2026-09-10 訂正**: 初版は「`listMatchesForCompetition` と `getStandingsForCompetition` の 2 本のまま」と書いていたが、**事実誤認だった**。main の `generateMetadata` は実際には `getCompetitionBySlug` / `listMatchesForCompetition` / `getStandingsForCompetition` / `getMatchBroadcastPresenceForMatches` / `getContentStatusForMatches` の **5 本**を呼んでいた。「2 本に減らせ」と読める書き方になっており、PR #807 は放送クエリを削除した。**削除自体は妥当**（放送データは今後 321 試合中 0 試合で `hasBroadcasts` は常に false、分岐は死んでいる。metadata から 1 クエリ減るのはキャッシュにも効く）。**条件は「増やさない」であって「本数を固定する」ではない。**

8-a. **Page ファイル（`app/c/[competition]/[season]/page.tsx`）から、Next.js が許可しない名前を export していない**

    許可されるのは `default` / `generateMetadata` / `generateStaticParams` / `revalidate` / `dynamic` / `metadata` 等に限られる。テストのために helper を export すると **`next build` が失敗する**（PR #807 初版が `getCompetitionMetadataTeams` を export して Vercel が落ちた）。**`pnpm typecheck` はこの制約を検査しない。`next build` だけが検査する。** helper は `lib/format/` 等の別モジュールへ置き、page とテストの双方から import する。
9. 既存の `tests/app/season-page-ia.test.ts` が green である（必要なら期待値を更新する）
10. **画面表示（本文・レイアウト）に差分が無い**
11. LLM 呼び出しが差分に含まれない（ソース中に `getOpenAIClient` / `MODELS` が現れない）
12. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**PR 本文に、変更後の title / description の全文を主要 5 大会分（lipovitan family / lipovitan 2026 / pnc 2026 / nations-championship 2026 / greatest-rivalry 2026）記載すること。** 文字数も併記する。**部分ではなく全文**を書くこと（2026-09-09 に、前半だけを「確定文」と書いて価格情報が消えた事故がある）。

**テストの置き場所**: `tests/app/`（`vitest.config.ts:32` の `exclude` に非該当。確認済み）。

## 未解決の質問

なし。

**本 spec で解決しないと明示するもの**:

- **CTR が上がる保証はない。** 相関の観察であって対照実験ではない。**228 ユーザー / 28 日では A/B テストが成立しない**（CVR 2% と仮定しても月 4〜5 件、2 群で各 2 件）。効果は Bing Webmaster の CTR を**同じ取得条件で数週間後に再取得して**比べる
- **`/c/rwc/2027` の 0 クリック / 43 表示は直らない。** 独自ルートで原因も別。別 spec
- **順位（4〜8 位）は変わらない。** これは title/description の変更であって、順位改善策ではない
