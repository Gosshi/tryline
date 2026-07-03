# シーズンページの情報設計反転

## 背景

2026-07-03 のデザイン・UI・集客横断レビュー（`docs/design-ui-growth-review-2026-07-03.md` B-5）で、シーズンページ（`/c/[competition]/[season]`）の構成順序に問題があることが判明した。

`app/c/[competition]/[season]/page.tsx` の title は「◯◯ 順位表・試合結果・日本語レビュー」と順位表を主役として謳っているが、実際の表示順は「大会ガイド（長文）→ 試合一覧（アコーディオン）→ 順位表（最下部）」となっており、title で最初に謳っている情報が最後にしか出てこない。加えて、大会ガイドはハブページ（`/c/[competition]`）と全く同じ文章が再掲されており、シーズンページ独自の情報（このシーズンの順位・結果）に辿り着く前に長文コンテンツで埋まってしまう。

## 事前確認: 誤検出の訂正

本レビューの元になった `docs/design-ui-growth-review-2026-07-03.md` では「18節すべてが閉じたアコーディオン」という指摘があったが、コード調査の結果これは**誤り**と判明した。`components/season-match-groups.tsx` の `getDefaultOpenGroupIndexes` は既にシーズンの進行状況に応じて最新の1〜3節を自動展開し、`didAutoScroll` の `useEffect` で自動スクロールも行っている（実装済み・正しく動作している）。フルページスクリーンショットは静的キャプチャのためスクロール位置を反映せず、誤読の原因になった。**本 spec はこのアコーディオン展開ロジックを変更しない。**

## スコープ

**対象:**
- `app/c/[competition]/[season]/page.tsx` — セクションの表示順序の変更
- `components/standings-table.tsx` — チーム名のフルネーム表示

**対象外:**
- `components/season-match-groups.tsx`（アコーディオン展開・自動スクロールロジックは変更不要。上記の通り既に正しく動作している）
- `components/competition-viewing-guide.tsx`（コンポーネント自体の実装は変更不要。呼び出し位置と折りたたみラップのみ変更する）
- `app/c/[competition]/page.tsx`（ハブページの構成は本 spec の対象外。ハブ側はガイドが主役として先頭にあるのが適切）
- プレーオフ圏・昇降格圏に応じた行の色分けロジックの精緻化（現状 `position === 1` / `position <= 3` の簡易ハイライトのみ。大会ごとに異なるプレーオフ人数を正しく反映する仕組みは別途データモデル拡張が必要なため、本 spec のスコープ外とする）

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### `app/c/[competition]/[season]/page.tsx` の表示順序変更

現状（166-255行目）:

```
header
SeasonSwitcher
(league-one banner)
matches.length === 0 ? 空状態 : [
  CompetitionViewingGuide
  PremiumUpsellBanner
  SeasonMatchGroups
]
StandingsTable（常に最後、id="standings"）
```

変更後:

```
header
SeasonSwitcher
(league-one banner)
StandingsTable（id="standings"。matches.length === 0 でも standings があれば表示、無ければ非表示。既存の StandingsTable は standings.length === 0 で null を返すため追加分岐不要）
matches.length === 0 ? 空状態 : [
  PremiumUpsellBanner
  SeasonMatchGroups
]
CompetitionViewingGuide（<details> でラップし、デフォルト閉じた状態にする）
```

`id="standings"` の anchor は現在サイト内のどこからも参照されていない（`grep -rn "#standings" app components` で確認済み）ため、移動しても既存リンクが壊れる心配はない。

### `CompetitionViewingGuide` の折りたたみラップ

コンポーネント自体は変更せず、呼び出し側で `<details>`/`<summary>` にラップする（JS 状態を持たない、クロール可能なまま視覚的に折りたためる HTML ネイティブの折りたたみ）:

```tsx
<details className="group rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)] sm:p-6">
  <summary className="cursor-pointer list-none font-heading text-lg font-bold text-[var(--color-ink)]">
    大会ガイドを見る
  </summary>
  <div className="mt-4">
    <CompetitionViewingGuide markdown={guide} />
  </div>
</details>
```

`CompetitionViewingGuide` コンポーネント内部の `<h2>大会ガイド</h2>` 見出しと `<summary>` の文言が重複しないよう、`CompetitionViewingGuide` 側の `<h2>` は `sr-only` にするか、`<summary>` 側の文言を「もっと詳しく」に変える等、実装時に見た目を確認して調整してよい（大枠の「デフォルト折りたたみ・展開可能」という要件のみ必須）。

### `components/standings-table.tsx` のフルネーム表示

現状 72行目で `teamShortCode` のみを表示し `teamName` は `title` 属性（ホバーのみ・タッチ非対応）に留まっている。

```tsx
// 変更前
<td className="py-2 pr-4 font-semibold text-slate-900">
  <span title={row.teamName}>{row.teamShortCode}</span>
</td>

// 変更後
<td className="py-2 pr-4 font-semibold text-slate-900">
  <span className="hidden sm:inline">{row.teamName}</span>
  <span className="sm:hidden" title={row.teamName}>{row.teamShortCode}</span>
</td>
```

sm 以上（タブレット・PC幅）ではフルネームを表示し、モバイル幅では従来通り略号＋ホバーの title を残す（横幅の制約が厳しいモバイルでは略号のままが妥当なため）。

## LLM 連携

なし。

## 受け入れ条件

1. シーズンページで `StandingsTable` が `SeasonMatchGroups` および `CompetitionViewingGuide` より上に表示される
2. `CompetitionViewingGuide` が `<details>` でラップされ、初期状態で閉じている
3. `<details>` を開くと大会ガイドの全文が表示される（`view-source` でクロール可能なマークアップが保持されていることを確認。JS 無効環境でも `<details>` は開閉可能な HTML ネイティブ機能であるため問題ない）
4. `StandingsTable` は `sm` 幅以上でチームのフルネームを表示する（`title` 属性のみでなく可視テキストとして）
5. モバイル幅（375px）では従来通り略号表示のままである
6. `matches.length === 0`（空状態）でも `standings` にデータがあれば `StandingsTable` は表示される（既存の `StandingsTable` 内部の `standings.length === 0` ガードにより、データが無ければ自動的に非表示になる）
7. `components/season-match-groups.tsx` の展開・自動スクロールロジックに差分がない（`git diff` で当該ファイルに変更が無いことを確認）
8. `pnpm tsc --noEmit` / `pnpm build` が通る

## 未解決の質問

- `<details>` のデフォルト閉じ表示について、SEO 上ガイドの文章がクロールされ続けることは維持されるが、視覚的な折りたたみが「情報を隠している」と受け取られないか、Owner が実際の見た目で確認してから展開してよい
- プレーオフ圏・昇降格圏の正確な色分け（大会ごとに異なる人数）は、`competitions` テーブルに「プレーオフ進出人数」等のフィールドが無いと正確に実装できない。将来必要になった場合は別 spec でデータモデル拡張から検討する
