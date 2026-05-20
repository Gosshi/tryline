# PR #91 — RWC 2027 ページ Coming Soon 表示に切り替え

## 背景

PR #86 で rwc-2027 の competition レコードと全52試合のスケジュールが DB に投入された。
しかしページを開くと、空のプール順位表と大量の「キックオフ予定」試合カードが
アコーディオン50件以上並んでおり、スカスカで信頼感を損なう。

2027年10月の開幕まで得点・レビューが存在しないため、
フルページを表示するより「スケジュール確定済み・随時更新」メッセージの方が好印象。

## スコープ

対象:
- `app/c/rwc/2027/page.tsx`

対象外:
- DB データ・試合レコード — 変更不要（データは残す）
- `app/c/rwc/2027/bracket/page.tsx` — 変更不要

---

## 変更仕様

### 「Coming Soon」表示への切り替え条件

`competition` レコードが存在し、かつ以下の両方を満たす場合に
`<ComingSoonState />` を表示する:

- `matches.length > 0`（スケジュールは投入済み）
- すべての試合が `status !== 'finished'`（まだ結果がない）

```ts
const allScheduled =
  matches.length > 0 &&
  matches.every((m) => m.status !== "finished");
```

### `ComingSoonState` コンポーネント

既存の `PendingState`（competition が null の場合）とは別に、
「スケジュール確定・開幕待ち」用のコンポーネントを追加する:

```tsx
function ComingSoonState({ matchCount }: { matchCount: number }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">
        Coming Soon
      </p>
      <h1 className="mt-4 font-serif text-4xl font-bold text-[var(--color-ink)]">
        Rugby World Cup 2027
      </h1>
      <p className="mt-6 text-base leading-relaxed text-[var(--color-ink-muted)]">
        2027年10〜11月、オーストラリア開催。
        <br />
        全{matchCount}試合のスケジュールが確定しています。
        <br />
        開幕後、試合結果・AI日本語レビューを随時公開予定。
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link
          className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-4"
          href="/c/rwc/2027/bracket"
        >
          ノックアウトブラケットを見る →
        </Link>
        <Link
          className="text-sm text-[var(--color-ink-muted)] underline underline-offset-4"
          href="/"
        >
          トップへ戻る
        </Link>
      </div>
    </div>
  );
}
```

### ページの分岐ロジック

`export default async function RWC2027Page()` を以下の構造に変更する:

```tsx
const competition = await getCompetitionBySlug("rwc-2027");

if (!competition) {
  return <main className="min-h-screen bg-slate-50"><PendingState /></main>;
}

const [poolStandings, matches] = await Promise.all([
  getPoolStandingsForCompetition("rwc-2027"),
  listMatchesForCompetition("rwc-2027"),
]);

const allScheduled =
  matches.length > 0 && matches.every((m) => m.status !== "finished");

if (allScheduled) {
  return <main className="min-h-screen bg-slate-50"><ComingSoonState matchCount={matches.length} /></main>;
}

// 開幕後のみ到達。既存の試合一覧 JSX をそのまま使う
const contentStatusMap = await getContentStatusMap(
  matches.map((match) => match.id),
);
const groupedMatches = groupMatchesByRound(matches);
// ... 既存の return JSX
```

### `MatchListItem` の `status` フィールド確認

`listMatchesForCompetition` が返す `MatchListItem` 型に `status` が含まれているか確認する。
含まれていない場合は `lib/db/queries/matches.ts` の select に `status` を追加する。

---

## 完了の定義

- [ ] `/c/rwc/2027` を開くと Coming Soon ページが表示される（空カードが消える）
- [ ] 「ノックアウトブラケットを見る」リンクが機能する
- [ ] 試合に1件でも `status = 'finished'` が存在したら通常の試合一覧に切り替わる
- [ ] TypeScript エラーなし・`pnpm build` 通過
