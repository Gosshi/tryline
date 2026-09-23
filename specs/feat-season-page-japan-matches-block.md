# シーズンページの冒頭に「日本代表の試合」を出す（11 月の日本代表戦向け）

## 背景

2026-09-23、Owner 経由で GPT から「日本代表の次の試合を調べる人を、既存の大会ページで取りにいく。まず 11 月の大会ページを一枚仕上げる」という提案があり、Owner が採用した。
提案の検証結果は `specs/feat-competition-top-season-summary.md` の「GPT 提案（2026-09-23）との関係」にある。要点:

- **実際に人が着地しているのは大会トップではなくシーズンページ。** GA4 organic 着地（2026-08-26〜09-22、`docs/market-demand-research-2026-09-22-evidence.json`）は `/c/pnc/2026` が Bing 67・Yahoo 2、`/c/greatest-rivalry/2026` が Bing 55・Yahoo 1、`/c/nations-championship/2026` が Bing 19・Yahoo 1
- `/c/nations-championship/2026` の **Google 表示は 28 日で 0**（GSC、2026-08-24〜09-20）
- 日本の 11 月 3 試合は既にこのページにあるが、第 4〜6 節の一覧に分散している。2026-09-23 の本番で冒頭の「日本代表の次戦」は 10/24 のリポビタン D チャレンジカップ（大会をまたぐ次戦）

| 日本時間 | 対戦 | 会場 | DB の `kickoff_at`（UTC） |
|---|---|---|---|
| 11/8(日) 01:40 | ウェールズ 対 日本 | Principality Stadium, Cardiff | 2026-11-07 16:40 |
| 11/15(日) 01:40 | イングランド 対 日本 | Allianz Stadium, London | 2026-11-14 16:40 |
| 11/21(土) 23:10 | スコットランド 対 日本 | Murrayfield, Edinburgh | 2026-11-21 14:10 |

### ファイナルズ週末に日本はもう 1 試合ある

Wikipedia「2026 Nations Championship」（2026-09-23 確認）によれば、ファイナルズ週末（11/27〜29、Twickenham）は**全 12 チームが出場**し、両カンファレンスの同順位どうしで順位決定戦を 6 試合行う。日本（Rest of the World 側）も 1 試合戦う。対戦相手と日時は第 6 節の後に決まる。
会場と日付は [Allianz Stadium Twickenham 公式](https://allianzstadiumtwickenham.com/nations-championship-finals-weekend) でも確認した（「27, 28 or 29 November」）。

**DB には 11/21 より後の試合が無い**（2026-09-23 確認）。取り込み側には決勝用の解析処理がある（`lib/ingestion/sources/wikipedia-nations-championship.ts:242` の `parseFinalsMatches`）が、チームが決まる前は拾えない。それまでは読者に「もう 1 試合ある」ことを文で知らせる。

### 規模と判定

- 11 月は日本代表戦の季節需要が来る。**需要の増加をすべて本 spec の成果には数えない**
- 判定（`docs/market-demand-research-2026-09-22.md` の施策 1 の基準を借りる）: 11/30 までに、3 試合それぞれの直前 7 日間（重複日は除く）の `/c/nations-championship/2026` への検索着地（Bing・Google・Yahoo の合計）。**合計 30 未満なら、この型の面を他の大会へ広げない**。30 以上でも施策の効果とは断定せず、9 月の PNC（`/c/pnc/2026`）の「日本戦の何日前」と比べる

## スコープ

対象:
- `app/c/[competition]/[season]/page.tsx` の冒頭（`SeasonSummaryBand` の直後）に、`feat-competition-top-season-summary` で作る `components/japan-matches-block.tsx` を置く
- 各試合の行に、H2H ページへのリンクを条件付きで出す
- Nations Championship 2026 のファイナルズについての注記

対象外:
- title / description / OG の変更（中身が揃った後に別途。GPT も同じ意見）
- 放送情報（JRFU 公開待ち、期限 10/10。`docs/broadcast-info-path-research-2026-09-22.md`）。放送が DB に入れば既存の「日本での視聴方法」節に出る
- H2H ページ自体の改善（過去の対戦の取り込み拡大）
- ファイナルズの試合の取り込み処理の変更
- 大会トップ（`app/c/[competition]/page.tsx`）への注記の追加

## 前提

**`specs/feat-competition-top-season-summary.md` の実装 PR がマージ済みであること。** `components/japan-matches-block.tsx` と `lib/format/season-summary.ts` の `isJapanMatch`・`formatMatchKickoffJst`・`getMatchLabel` を使う。

## データモデル変更

なし。

## API サーフェス

### `components/japan-matches-block.tsx` の拡張

前 spec の props（`matches`・`seasonHref`・`maxItems`）に次を足す。**どちらも省略可能で、省略時の表示は前 spec と同一**（大会トップの見た目を変えない）。

```ts
headToHeadHrefByMatchId?: Record<string, string>; // あれば行に「過去の対戦成績 →」
note?: string | null;                              // あれば一覧の下に 1 段落
```

### H2H リンク

- 各行の対戦相手ごとに `countHeadToHeadMatches(homeSlug, awaySlug)`（`lib/db/queries/matches.ts:2179`）を呼び、**2 以上なら** `/h2h/${normalizeHeadToHeadSlug(homeSlug, awaySlug)}`（`:1975`）へのリンクを出す。試合ページ（`app/matches/[id]/page.tsx:234-240`）と同じ条件
- `countHeadToHeadMatches` は**予定試合も数える**。2026-09-23 時点で日本対ウェールズ・スコットランドは各 2（終了 1＋予定 1）、イングランドは 4（終了 3＋予定 1）なので、3 戦ともリンクが出る
- 同じ対戦相手は 1 回だけ数える（`Promise.all` で並列）。ブロックに出す試合の分だけ呼ぶ
- `countHeadToHeadMatches` が throw したら、ページ全体は落とさずその行をリンク無しで表示し、`console.error` で記録する（H2H は補助情報のため）

### 注記

`lib/format/season-summary.ts` に追加:

```ts
export function getJapanMatchesNote(args: {
  competitionSlug: string;
  matches: MatchListItem[];
}): string | null;
```

- `competitionSlug === "nations-championship-2026"` で、かつ `matches` に**日本代表の試合で `kickoffAt >= "2026-11-27T00:00:00Z"` のものが無い**ときだけ、次の文を返す。それ以外は null

  > 11月27〜29日のファイナルズ週末（ロンドン・トゥイッケナム）で、日本は最終順位に応じた順位決定戦をもう1試合戦います。対戦相手と日時は第6節（11月21日）の後に決まります。

- 日本の決勝週末の試合が取り込まれたら、条件が外れて注記は自動で消える

## UI サーフェス

### 置き場所（design.md「Order around the primary task」）

```
[ヘッダー（変更なし。ニュースレター登録を含む）]
[SeasonSwitcher]
[SeasonSummaryBand]
[日本代表の試合]     ← 新規。日本代表の試合（中止を除く）が 1 件以上あるシーズンだけ
[IosAppCta]
[ページ内ナビ]
[日程・結果] ...
```

- 見出しは前 spec と同じ「日本代表の試合」。**全件**出す（`maxItems` は渡さず既定の 6。Nations Championship 2026 はちょうど 6 試合）
- 並びはキックオフ昇順（前 spec と同じ）。終了試合はスコア、予定試合は日本時間の日時
- `SeasonSummaryBand` の「日本代表の次戦」（大会をまたぐ次戦）はそのまま残す

### 状態ごとの見え方

| ページ | 出るもの |
|---|---|
| `/c/nations-championship/2026` | 7 月 3 試合（スコア付き）＋ 11 月 3 試合（日本時間）＋ 6 行とも H2H リンク（2 試合以上の相手のみ）＋ファイナルズの注記 |
| `/c/pnc/2026` | 日本代表 2 試合（スコア付き）。注記なし |
| `/c/premiership/2026-27` | ブロックなし（日本代表の試合が無い） |

## LLM 連携

なし。

## 受け入れ条件

`tests/app/season-page-ia.test.tsx` に追加する。

1. **置き場所**: 日本代表の試合を含む fixture で、DOM 順が `aria-label="シーズン要約"` のセクション → 「日本代表の試合」→ iOS アプリ CTA → 「シーズンページ内ナビ」
2. **出さない**: 日本代表の試合が 0 件（または中止のみ）の fixture で「日本代表の試合」見出しが無い
3. **H2H リンク**: `countHeadToHeadMatches` のモックが対戦相手 A に 2、B に 1 を返すとき、A の行にだけ `/h2h/{正規化 slug}` へのリンクがある。B の行には無い
4. **H2H の呼び出し回数**: 同じ相手と 2 試合ある fixture で、その相手について `countHeadToHeadMatches` が 1 回だけ呼ばれる
5. **注記あり**: `slug: "nations-championship-2026"` で、日本代表の最後の試合が `2026-11-21T14:10:00Z` のとき、注記の文が出る
6. **注記が消える**: 条件 5 に日本代表の試合（`2026-11-28T16:40:00Z`、`scheduled`）を足すと注記が出ない
7. **他の大会には出ない**: 条件 5 と同じ試合で `slug` が `"pnc-2026"` なら注記が出ない
8. **大会トップは変わらない**: `tests/app/competition-hub-indexing.test.tsx` が**無変更で**通る（props 省略時の表示が前 spec と同一）
9. **既存テスト**: `tests/app/season-page-ia.test.tsx` の既存テストが通る。`countHeadToHeadMatches` と `normalizeHeadToHeadSlug` を `@/lib/db/queries/matches` のモック（`:103`）に足す必要がある
10. **壊して落ちる確認**: 条件 3 が「件数を見ずに全行にリンクを出す」実装で落ちること、条件 6 が「日付を見ずに slug だけで注記を出す」実装で落ちることを一時的に壊して確認し、PR 本文に書く（コミットしない）
11. **画面**: `/c/nations-championship/2026` と `/c/pnc/2026` の 1440px・375px のスクリーンショット（ローカルまたはプレビュー）を PR に貼る
12. `pnpm lint`・`pnpm typecheck`・`pnpm test` が通り、CI（`gh pr checks`）が緑

## 既存テストの巻き添え（実測で特定済み）

- `tests/app/season-page-ia.test.tsx:100-104` は `@/lib/db/queries/matches` などをモジュールごとモックしている。`countHeadToHeadMatches`・`normalizeHeadToHeadSlug` が未定義になるので足す。`normalizeHeadToHeadSlug` は純粋関数なので `vi.importActual` で本物を使う
- `tests/app/competition-guide-metadata.test.ts:26` も `@/lib/db/queries/matches` をモックしてシーズンページを import する。`generateMetadata` は変えないので呼ばれないはずだが、import 時に未定義参照で落ちたらモックを足す（assert は変えない）

## 競合とマージ順

1. `specs/feat-competition-top-season-summary.md`（PR #855 の spec。実装は Codex 作業中）→ マージ
2. **本 spec**（`app/c/[competition]/[season]/page.tsx`・`components/japan-matches-block.tsx`・`lib/format/season-summary.ts`）
3. `specs/fix-published-content-count-row-cap.md`（`lib/db/queries/competitions.ts`・`app/page.tsx`。本 spec とファイルは重ならないので順不同でよい）

**11/8 の初戦の 1〜2 週間前（10/25 頃）までに本番に出す**ことを目標にする。

## 本番操作

なし。

### 実装後の運用確認（Claude Code、コード変更なし）

- 第 6 節（11/21）の後、日本のファイナルズの試合が `nations-championship-2026` に取り込まれたかを DB で確認する。入っていなければ取り込みの不具合として別途調べる（注記は出たままになる）
- 判定（「規模と判定」）は 11/30 以降に GA4 で集計する

## 未解決の質問

なし（2026-09-23 Owner 承認: 前 spec に続けて作る）。
