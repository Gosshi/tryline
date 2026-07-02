# fix-rwc2027-hub-page-gate

## 背景

2026-07-01の集客分析（`docs/growth-audit-2026-07-01.md`）で、GSCに「ラグビーワールドカップ 2027 日程」等の実検索需要が存在するのに `/c/rwc/2027` の平均順位が29〜58位と低いことが判明していた。

原因を調査したところ、**データは完全に揃っているのに UI のガード条件でページ全体が「Coming Soon」表示に置き換えられている**ことが分かった。

- `competition_pools` テーブル: RWC 2027 の24チーム分のプール割当が全件登録済み（24行）
- `competition_standings` テーブル: 同じく24チーム分の順位表行が登録済み（24行）
- `matches` テーブル: プールステージ36試合の日程が確定済み

つまりデータエンジニアリングは不要で、**表示条件を直すだけ**で「組み合わせ（プール分け）」「日程」という検索需要にそのまま応えられる状態にある。

## 根本原因

`app/c/rwc/2027/page.tsx:94-103`:

```typescript
const allScheduled =
  matches.length > 0 && matches.every((match) => match.status !== "finished");

if (allScheduled) {
  return (
    <main className="min-h-screen bg-slate-50">
      <ComingSoonState matchCount={matches.length} />
    </main>
  );
}
```

「finished（消化済み）の試合が1件でもないと、ページ全体を `ComingSoonState` に差し替える」という条件になっている。RWC 2027 の開幕は2027年10月のため、**この条件は開幕まで15ヶ月以上ずっと真になり続け、その間ページは常にComing Soon表示のまま**になる。

一方、その直前で取得している `poolStandings`（プール順位表・チーム名込み）と `matches`（全36試合の日程）は完全なデータであり、`allScheduled` 判定さえ通らなければ通常のレンダリングパス（プール順位表 + `SeasonMatchGroups` による日程表示）にそのまま流れて正しく表示される。この通常パスは他の大会（Six Nations 等の未消化ラウンド）でも共通して使われている実績のあるコンポーネントであり、開幕前の試合を表示すること自体に技術的な問題はない。

## スコープ

**対象:** `app/c/rwc/2027/page.tsx` のみ

**対象外:**
- `app/c/rwc/2027/bracket/page.tsx`（ノックアウトブラケットは `round >= 5` のデータが実際に存在しないため、現状の「準備中」表示のままでよい。ノックアウト組み合わせが決まった時点で自然に表示される設計なので変更不要）
- `lib/db/queries/standings.ts` / `lib/db/queries/matches.ts`（データ取得ロジックは変更不要）
- データ投入・マイグレーション

## データモデル変更

なし。

## 実装詳細

### `allScheduled` によるページ全体差し替えをやめ、軽量な「開幕前」バナーに変える

**変更前（L94-103）:**
```typescript
const allScheduled =
  matches.length > 0 && matches.every((match) => match.status !== "finished");

if (allScheduled) {
  return (
    <main className="min-h-screen bg-slate-50">
      <ComingSoonState matchCount={matches.length} />
    </main>
  );
}
```

**変更後:** `matches.length === 0` の場合のみ（＝本当にデータが無い場合のみ）Coming Soon 相当を出す。試合データが1件でもあれば、プール順位表・日程を常に表示する。開幕前かどうかは、通常レンダリングパスの中に軽量な案内バナーとして出す。

```typescript
if (matches.length === 0) {
  return (
    <main className="min-h-screen bg-slate-50">
      <PendingState />
    </main>
  );
}

const tournamentStarted = matches.some(
  (match) => match.status === "finished" || match.status === "live",
);
```

`ComingSoonState` コンポーネント（L45-76）はこの用途では使わなくなるため、代わりにヘッダー直下へ挿入する軽量バナーを追加する:

```typescript
function PreTournamentBanner({ matchCount }: { matchCount: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-rule)] bg-white px-6 py-4 text-sm text-[var(--color-ink-muted)]">
      2027年10〜11月、オーストラリア開催。全{matchCount}試合のスケジュールが確定しています。開幕後、試合結果・日本語レビューを順次公開します。
    </div>
  );
}
```

`return` 文の JSX 内、`<header>` の直後・`poolStandings` セクションの前に `{!tournamentStarted && <PreTournamentBanner matchCount={matches.length} />}` を挿入する。

`ComingSoonState` 関数自体は未使用になるため削除してよい（`PendingState` は `matches.length === 0` かつ `competition` が存在しない場合の両方で引き続き使うため残す）。

### メタデータ

`metadata`（L13-17）は変更不要。既に「日程・出場国・日本語ガイド」を含む適切なタイトル/descriptionになっている。

## 受け入れ条件

1. TypeScript ビルドが通る
2. `matches.length > 0` であれば、試合が1件も消化されていない状態でも `/c/rwc/2027` にプール順位表（6プール×4チーム）と全36試合の日程が表示される
3. 開幕前（`tournamentStarted === false`）は `PreTournamentBanner` が表示され、開幕後は表示されない
4. `matches.length === 0`（データ未投入）の場合のみ従来通り `PendingState` が表示される
5. 既存のテスト（あれば `tests/app/*rwc*` 等）を更新・追加すること。無ければ最低限「試合はあるが全て scheduled」というケースでプール順位表と日程が描画されることを検証するテストを追加する
6. `/c/rwc/2027/bracket` は変更しない（対象外）

## 未解決の質問

- `PreTournamentBanner` の文言・デザインは仮置き。Owner が確認の上、必要なら調整してよい
- RWC2027コンテンツのさらなる強化（観戦ガイド記事、チームページの拡充等）は本specの対象外。本specはSEO上最もレバレッジが高い「既存データを隠しているガードを外す」対応に絞った。追加の拡充は別specとして起票する
