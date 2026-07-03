# ホームの大会アーカイブから RWC2027 への導線を追加

## 背景

2026-07-03 のデザイン・UI・集客横断レビュー（`docs/design-ui-growth-review-2026-07-03.md` B-1, B-8）で、ホームページの大会アーカイブに並ぶ RWC カードが `/c/rwc/2023`（終了済みの前回大会）を指しており、`/c/rwc/2027`（実需要が確認済みの次回大会）への導線がホームに存在しないことが判明した。

GSC 実測（`tools/gsc-pull.ts` 28日分、2026-07-03 取得）で「ラグビーワールドカップ 日程」「2027 ワールドカップ」等のクエリが `/c/rwc/2027` に対して実在し、うち「2027 ワールドカップ」は平均順位10.0位まで改善している。`specs/fix-rwc2027-hub-page-gate.md`（本番反映済み）でページ内部のデータ表示は解決済みだが、ホームからの内部リンクが無いため、サイト内回遊・クロール深度の面で機会損失が続いている。

## 根本原因

`app/page.tsx:107-128` の `homepageCompetitionLinks` は、各大会 family ごとに `selectLatestSeasonWithMatches`（`lib/db/queries/competitions.ts:58-72`）で「最新シーズン」を1つ選んで表示する。この関数は `publishedContentCount > 0`（=公開済み recap/preview がある）シーズンを最優先する設計になっており、これは一般的には正しい挙動（読める記事がある大会を優先表示する）。

RWC の場合、2023 は過去大会で recap が多数公開済み（`publishedContentCount > 0`）なのに対し、2027 はプールステージの日程のみでまだ試合が消化されておらず `publishedContentCount = 0`。そのため `withContent` フィルタで 2027 が除外され、2023 が選ばれる。

**この選定ロジック自体は他の全大会（Six Nations、Premiership 等）にとって正しい挙動であり、変更すべきではない。** RWC2027 のような「実需要はあるが読めるコンテンツがまだ無い次回大会」を扱うための専用の導線が別途必要、というのが本 spec の立場。

## スコープ

**対象:** `app/page.tsx` の大会アーカイブセクション（544-593行目付近）に、RWC 専用の小さな補助リンクを追加する

**対象外:**
- `selectLatestSeasonWithMatches` のロジック変更（他の全大会に影響するため触らない）
- `homepageCompetitionLinks` の汎用化（他大会にも同様の「次回大会」概念を持たせる一般化は本 spec のスコープ外。RWC2027 は GSC で実需要が確認された唯一の特例として個別対応する）
- `/c/rwc/2027` ページ自体の内容変更（`specs/fix-rwc2027-pre-tournament-pools.md` で別途対応）

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

大会アーカイブの RWC カード（`family === "rwc"`）に隣接して、2027年大会への小さな補助リンクを追加する。

### 実装方針

`app/page.tsx` の `homepageCompetitionLinks.map` ループ内（549-590行目）で、`competition.family === "rwc"` の場合のみ、カードの下（`<li>` 内、`</Link>` の直後）に以下のような小さなテキストリンクを追加する:

```tsx
{competition.family === "rwc" && (
  <Link
    className="mt-1 block text-xs font-medium text-[var(--color-accent)] underline underline-offset-4"
    href="/c/rwc/2027"
  >
    2027年大会（オーストラリア開催）の日程はこちら →
  </Link>
)}
```

既存のカードの `href`（`/c/${competition.family}/${competition.season}` = `/c/rwc/2023`）は変更しない。2023 は引き続き「読めるコンテンツがある RWC」として正しく機能する。2027 へのリンクはあくまで追加の補助導線。

### 代替案（Codex 実装時に判断してよい）

カード内にサブリンクを追記する代わりに、大会アーカイブセクションの直前・直後に「RWC2027 特設バナー」を1枚追加する形でもよい。その場合は既存のカードグリッド（`<ul className="grid gap-3 sm:grid-cols-2">`）の外に置くこと。どちらの形にするかは見た目のバランスで Codex が判断してよいが、**`/c/rwc/2027` へのリンクがホームのファーストビューに近い位置（大会アーカイブセクション内）に存在すること**が必須条件。

## LLM 連携

なし。

## 受け入れ条件

1. ホームページに `/c/rwc/2027` への内部リンクが存在する（`curl` で HTML を取得し `href="/c/rwc/2027"` を grep で確認できること）
2. 既存の RWC カード（`/c/rwc/2023` へのリンク）は変更されていない
3. 他の大会（Six Nations、Premiership 等）のカード表示・リンク先は一切変更されていない
4. モバイル幅（375px）でもリンクが読める・タップしやすいサイズで表示される
5. `pnpm tsc --noEmit` / `pnpm build` が通る

## 未解決の質問

- この特例対応は「RWC2027 が実際に開幕して recap が公開され始めたら不要になる」暫定的なもの。2027年10月の開幕後、`selectLatestSeasonWithMatches` が自然に2027を選ぶようになった時点で、この補助リンクを削除するかどうかは Owner が別途判断すること（削除しなくても実害はないが、コードの意図が古くなる）
- 「代替案」（カード内サブリンク vs 独立バナー）のどちらを採用するかは Codex の実装時判断に委ねてよいか、Owner が先に決めたいか
