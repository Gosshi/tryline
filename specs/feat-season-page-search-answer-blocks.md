# シーズンページに検索意図への即答ブロックを追加（FAQ構造化データ + 日本代表の次戦）

## 背景

2026-07-07〜08 の集客レビュー（3本のCodex分析いずれも）で、「大会ハブは検索意図への即答ページにすべき」「FAQ構造化データを追加」「『日本代表の次戦』ブロックを追加」が繰り返し指摘された。

`feat-season-page-ia.md`（PR #454、実装済み）で順位表を主役にする表示順反転は既に本番稼働済みと確認した（`https://www.trylinerugby.com/c/pnc/2026` 実測: `id="standings"` が `大会ガイド` より前に出現）。しかし以下2点は未実装のまま残っている:

1. **FAQ構造化データが無い**（本番HTML実測で `FAQPage` schema 不在を確認）。料金ページ（`app/pricing/page.tsx:81-91`）には既に `FAQPage` の JSON-LD 実装パターンがあり、シーズンページにも同じパターンを適用できる
2. **「日本代表の次戦」ブロックが無い**（本番HTML実測で「日本代表の次戦」「次戦」等の文言が season page に存在しないことを確認）。日本代表が出場する大会（DB実測: `autumn-nations` / `nations-championship` / `pnc` / `rwc`）でのみ意味を持つ

## スコープ

対象:
- `app/c/[competition]/[season]/page.tsx` に `FAQPage` JSON-LD を追加
- 同ページに、日本代表が出場するシーズンでのみ表示される「日本代表の次戦」ブロックを追加

対象外:
- ハブページ（`app/c/[competition]/page.tsx`）への同様の追加（本 spec はシーズンページのみ。ハブページは別途検討）
- FAQ の質問文言・回答文言の大会横断的な一般化（大会ごとに個別生成する。共通テンプレート化は未解決の質問に記載）
- `feat-season-page-ia.md` で決定済みの表示順序・折りたたみの変更

## データモデル変更

なし。

## API サーフェス

なし。

## UI サーフェス

### 1. FAQ 構造化データ

`app/pricing/page.tsx:81-91` の `pricingFaqJsonLd` と同じパターンで、シーズンページ用の FAQ を生成する。質問は検索意図に直結する4つに固定する:

```ts
const seasonFaqs = [
  {
    answer: `${formatCompetitionTitle(comp, comp.season)}は${dateRange ?? "開催期間未定"}に開催されます。`,
    question: `${formatCompetitionTitle(comp, comp.season)}はいつ開催されますか？`,
  },
  {
    answer: `日本では${viewingMethodSummary}で視聴できます。`, // 下記参照
    question: `${formatFamilyName(family)}はどこで見られますか？`,
  },
  {
    answer: nextMatchJst
      ? `次の試合は${nextMatchJst}（日本時間）です。`
      : "現在予定されている試合はありません。",
    question: `${formatFamilyName(family)}の次の試合はいつですか（日本時間）？`,
  },
  {
    answer: standings.length > 0
      ? "このページ上部の順位表で最新順位を確認できます。"
      : "このシーズンの順位表はまだ確定していません。",
    question: `${formatFamilyName(family)}の順位表はどこで見られますか？`,
  },
];

const seasonFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: seasonFaqs.map((faq) => ({
    "@type": "Question",
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
    name: faq.question,
  })),
};
```

`viewingMethodSummary`: `guide`（`getCompetitionGuide` の戻り値、`CompetitionViewingGuide` に渡している markdown）の中に視聴方法セクションがあるため、そこから抽出するのではなく、シンプルに固定文言「DAZN・J SPORTS 等の配信サービス」でよい（大会ごとの正確な配信元データが `competitions` テーブルに構造化されていないため。正確な値を出したい場合は未解決の質問に記載）。

`nextMatchJst`: `matches` から `status === "scheduled"` かつ `kickoffAt` が現在時刻以降で最も早い試合の `kickoffAt` を `formatKickoffJstDate`/`formatKickoffJstTime`（`lib/format/kickoff.ts` の既存関数）で整形する。無ければ `null`。

`<script type="application/ld+json">` を既存の `breadcrumbJsonLd` の隣に追加する。

### 2. 「日本代表の次戦」ブロック

`matches` から日本代表が絡む試合を抽出する:

```ts
const japanMatches = matches.filter(
  (match) =>
    (match.homeTeam.slug === "japan" || match.awayTeam.slug === "japan") &&
    match.status === "scheduled",
);
const nextJapanMatch = japanMatches.sort(
  (a, b) => a.kickoffAt.localeCompare(b.kickoffAt),
)[0] ?? null;
```

`nextJapanMatch` が存在する場合のみ、`StandingsTable` の直下（`feat-season-page-ia.md` で確定した表示順序を維持したまま、その直後）に以下のブロックを挿入する:

```tsx
{nextJapanMatch && (
  <Link
    className="block rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 p-5 transition-colors hover:border-[var(--color-accent)]/60"
    href={`/matches/${nextJapanMatch.id}`}
  >
    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
      日本代表の次戦
    </p>
    <p className="mt-2 text-lg font-bold text-[var(--color-ink)]">
      {nextJapanMatch.homeTeam.name} vs {nextJapanMatch.awayTeam.name}
    </p>
    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
      {formatKickoffJstDate(nextJapanMatch.kickoffAt)}{" "}
      {formatKickoffJstTime(nextJapanMatch.kickoffAt)} JST
    </p>
  </Link>
)}
```

日本代表が出場しない大会（six-nations・premiership・urc・top-14・super-rugby-pacific・rugby-championship・league-one 等）では `japanMatches` が常に空になり、ブロックは自然に非表示になる（大会名のハードコード分岐は行わず、実データ駆動で判定する）。

## LLM 連携

なし。

## 受け入れ条件

1. `/c/pnc/2026` 等、日本代表出場大会のシーズンページ HTML に `"@type":"FAQPage"` を含む `<script type="application/ld+json">` が出力される
2. `/c/six-nations/2026` 等、日本代表が出場しない大会のシーズンページにも `FAQPage` は出力される（FAQ自体は大会共通で出す。「日本代表の次戦」ブロックのみ日本代表出場大会限定）
3. 日本代表の試合が `scheduled` で存在するシーズンページで「日本代表の次戦」ブロックが表示され、`/matches/[id]` へのリンクが正しい
4. 日本代表が出場しないシーズンページ、または日本代表の scheduled 試合が無いシーズンページでは、当該ブロックが DOM に存在しない
5. FAQ の「次の試合はいつですか」の回答が、`matches` 内の直近 scheduled 試合の JST 日時と一致する
6. 既存の `breadcrumbJsonLd` の出力に変更がない
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
8. `tests/app/season-page-ia.test.tsx`（または関連する既存テストファイル）に、FAQ JSON-LD の出力と日本代表次戦ブロックの表示/非表示分岐のテストを追加する

## 未解決の質問

- 視聴方法 FAQ の回答を大会ごとに正確な配信元（DAZN限定か、J SPORTSも含むか等）にするには、`competitions` テーブルまたは `competition_guides` に構造化された視聴方法データが必要。現状は `CompetitionViewingGuide` の markdown 本文に自然文で埋め込まれているのみで、機械的に抽出できない。今回は固定文言で妥協するか、Owner が優先度を判断
- 「日本代表の次戦」ブロックの挿入位置（StandingsTable 直後）が、PR #500 で作成したホームの Matchday board と情報が重複しないか。重複は許容範囲と考えるが、Owner の見た目確認を推奨
