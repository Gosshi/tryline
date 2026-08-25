# 大会ハブ3ページの視覚的差別化（案B2）

## 背景

デザイン監査（`docs/design/audit-2026-08-24.md`、所見 A-2 / E-1）で、大会ハブの3ページが**同一のヒーローマークアップを使い回している**ことが判明した。

```
rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200
＋ borderLeft: 4px solid accentColor
＋ h1: font-heading text-4xl sm:text-5xl
```

- `app/c/[competition]/[season]/page.tsx:569-580`
- `app/c/[competition]/[season]/standings/page.tsx:156-168`
- `app/c/[competition]/[season]/round/[round]/page.tsx:187-203`

**副題の文言以外に差が無く、順位表なのかラウンド一覧なのかが、下のコンテンツが始まるまで分からない。**

### なぜこの3ページが優先なのか

実測の平均滞在時間は**大会ハブ 107秒 / カレンダー 120秒**に対し、**試合詳細ページは 3.6秒**。さらに **Bing 流入の 86% が大会ハブに着地**している。過去3回のデザイン刷新（試合ページ・bento カード・背景テクスチャ）はいずれもこの3ページを対象外にしていた。**最も読まれている面に、まだ一度も手が入っていない。**

### 方向性の決定

モック3案（A: データ前倒し / B: 構造で分ける / C: エディトリアル）から Owner が **案B** を選定。その後「全体が白っぽい」との指摘を受け、濃色を補強した **案B2** で確定した。

**基準ビジュアル: `docs/design/mock-hub-b2-depth.html`**

## スコープ

対象:

1. `app/c/[competition]/[season]/page.tsx` — ヒーローを写真ベースの帯に置き換え
2. `app/c/[competition]/[season]/standings/page.tsx` — 巨大見出しを畳み、表を主役にする
3. `app/c/[competition]/[season]/round/[round]/page.tsx` — 深色ストリップ＋日付スパイン
4. `components/standings-table.tsx` — 深色プール帯と順位ティント
5. `lib/competition-hero-images.ts` — 未登録3ファミリーの追加

対象外（重要）:

- **セクションの並び順は一切変更しない。** 後述の「触ってはいけない過去の判断」を参照
- `app/c/[competition]/page.tsx`（ファミリーハブ）— 既にキービジュアル実装済み。今回は触らない
- `app/c/rwc/2027/page.tsx` — 専用ページ。同じヒーローを持つが本 spec の対象外
- `components/match-card.tsx` — ラウンドページの表示は行リストに変えるが、**`MatchCard` 自体は他ページで使われているので削除・改変しない**
- 試合詳細・ホーム・カレンダー・料金
- `design.md` の更新（新トークンを足す場合のみ後述）
- 監査の他の改善候補（#4 player/H2H、#5 active states、#6 Support）

## 触ってはいけない過去の判断

シーズンページの構成順は**過去3回**調整されており、いずれも `docs/decisions.md` に無い。**巻き戻すと同じ議論を4回目からやり直すことになる。**

| spec | 決定 |
|---|---|
| `feat-season-page-ia.md`（PR #454） | ガイドを畳み、順位表を前に出す |
| `fix-competition-season-page-flow.md`（2026-07-10） | 逆に全順位表が先頭だと「次の試合を知りたい」訪問者が日程までスクロールする。**日程を順位表より前に** |
| `fix-season-page-guide-collapse-regression.md` | 大会ガイドの折りたたみは commit `bd3fba1` で明示的に廃止済み。`CompetitionViewingGuide` から `collapsible` prop 自体が削除されている。**再導入しない** |

現在の並び（変更しないこと）:

```
header(616) → SeasonSwitcher(618) → ページ内ナビ(635)
→ 日程 #schedule(667) → 順位表 #standings(722) → 大会ガイド(743)
```

**本 spec が置き換えるのは 616 で閉じる `<header>` の中身だけ。** それ以降のセクションの順序・有無・折りたたみ状態には触れない。

## データモデル変更

なし。**新規クエリも不要。**

## 必要なデータはすべて取得済み

シーズンページは既に以下を1つの `Promise.all` で取得している（`app/c/[competition]/[season]/page.tsx:393-401`）。

```ts
const [matches, standings, poolStandings, seasons, guide] = await Promise.all([
  listMatchesForCompetition(comp.slug),
  getStandingsForCompetition(comp.slug),
  getPoolStandingsForCompetition(comp.slug),
  listSeasonsByFamily(comp.family),
  getCompetitionGuide(comp.family),
]);
```

| 帯に出す項目 | 導出元 | 追加クエリ |
|---|---|---|
| プール別の首位 | `poolStandings`（`position === 1` の行） | **不要** |
| 進行度「N節 / 全M節」 | `matches[].round` | **不要** |
| 次節の日付 | `matches[].kickoff_at` | **不要** |

`MatchListItem.round` は既に存在する（`lib/db/queries/matches.ts:49`）。値は `external_ids` から導出されている:

```ts
// lib/db/queries/matches.ts:504
export function getRoundFromExternalIds(externalIds: Json): number | null {
  // ... externalIds.round ?? externalIds.wikipedia_round を number へ
}
```

**`listRoundsForCompetition` を新たに呼ばないこと。** その関数は内部で `listMatchesForCompetition` を再実行するため、同じクエリが2回走る。

```ts
// lib/db/queries/matches.ts:1882 — これは呼ばない
export async function listRoundsForCompetition(competition, season) {
  const matches = await listMatchesForCompetition(`${competition}-${season}`);
  return [...new Set(matches.map((m) => m.round))]...
}
```

同じ導出をシーズンページ内で `matches` から行う。

### 進行度の算出方法

- 全節数 M = `matches` の `round` の distinct 数（`null` を除く）
- 完了節数 N = 「その節の全試合が `status === 'finished'`」を満たす節の数
- `round` が全件 `null` の大会（ツアー・単発シリーズ等）では**進行度を表示しない**。バーごと省略する
- 次節 = 未完了の節のうち最小の `round` の、最も早い `kickoff_at`

## UI サーフェス

### 1. シーズンページのヒーロー（写真帯）

`app/c/[competition]/[season]/page.tsx:569-616` の `<header>` を、写真背景の帯に置き換える。

- 背景画像は `getCompetitionHeroImage(comp.family)`（`lib/competition-hero-images.ts`）。`next/image` の `fill` を使い、既存のファミリーハブ（`app/c/[competition]/page.tsx:99-107`）と同じ流儀にする
- **画像の上にスクリム（暗幕）を必ず重ねる。** 左が濃く右が薄い横方向グラデーション。基準モックの値は `linear-gradient(100deg, rgb(18 41 63/.92) 0%, rgb(18 41 63/.78) 42%, rgb(18 41 63/.42) 100%)`。色は大会カラーの暗色版から導出してよい
- テキストは左側に配置。**スクリムの上なので白文字で十分なコントラストが出る**が、`--color-ink-muted` 等の淡色トークンを白背景前提のまま流用しないこと
- 帯の下端に「首位 / 進行 / 次節」の情報行を置く（半透明の暗色地）
- 既存の CTA（`この大会を購読` / `大会iCal URL` / `今週の全試合を見る`）と `NewsletterSignup` は**残す**。帯の下、または帯の内側のいずれでもよい

**画像が無い大会の扱い**: `getCompetitionHeroImage` は未登録ファミリーに `DEFAULT_COMPETITION_HERO`（`/visuals/default.jpg`）を返す。フォールバックはそのまま機能させる。

### 2. `lib/competition-hero-images.ts` に3行追加

2026-08-25 に以下3枚を生成・配置済み（いずれも 1916×821）。**マップに登録しないとコードから参照されず、`default.jpg` のままになる。**

```
public/visuals/nations-championship.jpg
public/visuals/greatest-rivalry.jpg
public/visuals/lipovitan-challenge-cup.jpg
```

`COMPETITION_HERO_IMAGES` にキー `nations-championship` / `greatest-rivalry` / `lipovitan-challenge-cup` を追加する。既存行と同じ書式・アルファベット順を保つこと。

### 3. 順位表ページ

`app/c/[competition]/[season]/standings/page.tsx:156-174` の巨大ヒーローを、1行のヘッダに畳む。

- パンくず的な小さい大会名（`text-xs` uppercase、大会カラー）＋ `順位表` の見出し（`text-xl` 程度まで縮小）＋ 右端に最終更新
- 下端に大会カラーの 2px 罫線
- **`h1` は残すこと**（SEO）。視覚サイズを下げるだけで、要素を消さない
- 表が即座に始まる

参考: 基準モックの `.t-head`。

### 4. `components/standings-table.tsx`

- テーブル上部に**深色のプール帯**（大会カラーの暗色、白文字）。プール名を表示。プール分けが無い大会では大会名または「順位表」を出す
- 上位行にティントを段階適用: 1〜2位 = 16%、3位 = 9%、4位 = 4.5%（大会カラーの `rgb(... / alpha)`）。**段階は情報を表す**（上位ほど濃い）ので、装飾として全行に均一に塗らない
- **何位までを強調するかは大会によって異なる。** 現時点で `competitions` に「決勝進出枠数」を持つカラムは無い。**枠数のハードコードや推測をしないこと。** 単純に「上位3位までを濃さ3段階で強調」とし、意味の断定（「決勝進出圏」等のラベル）は本 spec では出さない。基準モックにある `上位2チームが決勝進出` の文言は**モック上の例示であり実装しない**
- 横スクロールは `overflow-x-auto` でテーブル自身に閉じ込める（ページ本体を横スクロールさせない）

### 5. ラウンドページ

`app/c/[competition]/[season]/round/[round]/page.tsx:187-217` を置き換える。

- 上部に**深色ストリップ**（大会カラー暗色、白文字）: `第N節` ＋ 大会名 ＋ 試合数 ＋ 解説本数 ＋ 右端に日付
- その下に**日付スパイン**: 左に固定幅の濃色ブロック（曜日・日・月）、右に試合行のリスト
- 試合行は交互にティント（4.5%）、ホバーで 9%
- 日付ブロックのデザインは `components/calendar/week-schedule.tsx` に**既に実装されている日付スパインと同じ視覚言語**にすること。ゼロから作らず、既存実装を読んで揃える
- **`MatchCard` のグリッドを行リストに置き換えるが、`MatchCard` コンポーネント自体は削除・改変しない**（他ページで使用中）
- 各行が持つ情報（キックオフ時刻・チーム名・スコア/ステータス・解説バッジ・試合詳細へのリンク）は現行 `MatchCard` から欠落させないこと
- 1つの節が複数日にまたがる場合は、日付ブロックを日ごとに分ける（`week-schedule.tsx` の `groupMatchesByJstDay` と同じ考え方。**同関数を再利用できるなら再利用する**）

## LLM 連携

なし

## 受け入れ条件

1. season / standings / round の3ページのヒーローが、**それぞれ異なるマークアップ**になっている。`rounded-xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200` の3ページ完全一致が解消されている
2. シーズンページのヒーローが `getCompetitionHeroImage` の画像を背景に使い、スクリムの上に白文字が載っている
3. `lib/competition-hero-images.ts` に3ファミリーが追加され、`/c/nations-championship/2026` で `default.jpg` ではなく `nations-championship.jpg` が配信される
4. 画像が未登録のファミリーで `default.jpg` にフォールバックし、レイアウトが崩れない
5. 「首位 / 進行 / 次節」が実データから表示される。**新規の DB クエリが1つも増えていない**（`Promise.all` の要素数が変わっていない）
6. `round` が全件 `null` の大会で進行度が表示されず、エラーにもならない
7. 順位表ページの `h1` が DOM 上に存在し続けている（視覚サイズのみ縮小）
8. `StandingsTable` の上位行ティントが3段階で、4位以下が均一である
9. ラウンドページで `MatchCard` が持っていた情報（時刻・チーム名・スコア・解説バッジ・詳細リンク）が欠落していない
10. `components/match-card.tsx` に差分が無い
11. **セクションの並び順に差分が無い**（日程 → 順位表 → ガイドの順が維持され、ガイドが折りたたまれていない）
12. 320 / 768 / 1024 / 1440px で横スクロールが発生しない。順位表の横スクロールはテーブル内に閉じている
13. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## 未解決の質問

- **決勝進出枠数のデータが存在しない。** 上位何チームが勝ち上がるかは大会ごとに異なるが、`competitions` にその情報を持つカラムが無い。本 spec では「上位3位を濃さ3段階で強調するが、意味のラベルは出さない」に留めた。将来的にデータ化するかは別途判断
- 生成した3枚のキービジュアルは 1916×821 で、既存9枚（1024×434 が多い）より大きい。`next/image` が派生画像を生成するため配信上の問題は無いが、**既存9枚を将来的に高解像度で作り直すかは別途判断**
- ラウンドページを行リストにすると、`MatchCard` が持つ視覚的リッチさ（チームカラー等）が失われる可能性がある。**実装後に Owner が視覚確認し、情報密度と見栄えのバランスを判断する**
