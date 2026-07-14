# カレンダー OG 画像の視覚改善（キックオフ時刻・ブランドカラー）

## 背景

`specs/feat-calendar-og-image.md`（PR #568 でマージ・本番稼働済み）で `/calendar` の動的 OG 画像を実装した。2026-07-14、実際に X の固定ポストで運用を試す過程で、Claude Fable 5 / GPT-5.6 の並行レビューにより2点の改善余地が判明した。

1. **注目試合にキックオフ時刻がない**: 現状「注目: {home} vs {away}（{competition}）」のみで、カレンダーというコンテンツの核心である「いつ見るか」が画像に含まれていない
2. **「◯大会◯試合」の文字色が緑（`#22c55e`）**: この緑は `type=result`/`type=round-scoreboard` で「勝者」を示す意味色として使われているもの（`app/api/og/route.tsx:591,612,640,805,900,980`）。カレンダー画像には勝敗の概念がなく、緑を流用すると意味的に不整合。`app/globals.css:25` の Tryline ブランドアクセントカラー `--color-accent: #c93a40` に統一すべき

これは `specs/feat-calendar-og-image.md` に対する修正であり、`fix-` として起票する（`feat-` 側は実装済みの記録として変更しない）。

## スコープ

対象:
- `app/api/og/route.tsx` の `type=calendar` 分岐（255行目〜）の見た目調整
  - 注目試合の行にキックオフ時刻を追加
  - 「◯大会◯試合」の文字色を `#22c55e` から `#c93a40` に変更
- `lib/seo/og-image.ts` の `createCalendarOgImage`（64行目〜）に `focusKickoffAt`（任意）パラメータを追加
- `app/calendar/page.tsx` の `generateMetadata`（`createCalendarOgImage` 呼び出し箇所、91行目付近）で、注目試合の `kickoffAt` を渡す

対象外:
- レイアウト全体の再設計（見出し「今週の海外ラグビー」の構成、大会横断の中立性を保つ視覚優先順位は `specs/feat-calendar-og-image.md` の「設計判断」節を維持する）
- 背景装飾（カレンダー罫線・グリッド等のテクスチャ追加）。今回はキックオフ時刻とブランドカラーの2点のみ。装飾追加は別途 Owner 判断があれば別 spec で
- `type=result` / `type=competition` / `type=round-scoreboard` の色変更（勝敗を示す既存の緑の意味は維持する）

## データモデル変更

なし。

## API サーフェス

### `lib/seo/og-image.ts` の `createCalendarOgImage` にパラメータ追加

```ts
type CalendarOgImageParams = {
  competitionCount: number;
  focusAway?: string;
  focusCompetition?: string;
  focusHome?: string;
  focusKickoffAt?: string; // 追加: ISO 8601 UTC 文字列
  matchCount: number;
  weekLabel: string;
};
```

`focusKickoffAt` が渡された場合、クエリパラメータ `focus_kickoff` として ISO 文字列のまま `/api/og` に渡す（日時フォーマットは `route.tsx` 側で行う。既存の `week_label` が呼び出し元でフォーマット済み文字列を渡す方式と非対称になるが、キックオフ時刻は `lib/format/kickoff.ts` の既存フォーマッタで edge runtime 上でも計算できるため、route 側で変換して問題ない）。

### `app/api/og/route.tsx` の `type=calendar` 分岐

- `focus_kickoff` クエリパラメータ（ISO文字列）を受け取り、`lib/format/kickoff.ts` の `formatKickoffJstDate` / `formatKickoffJstTime`（または同等の簡潔な組み合わせ、例: `7/18 (土) 17:40 JST`）でフォーマットして注目試合の行に追加表示する
- パースに失敗する値（不正な日付文字列等）の場合は時刻表示を省略し、エラーにしない
- 「◯大会◯試合」のテキスト色（現行 `app/api/og/route.tsx:366` の `color: "#22c55e"`）を `#c93a40` に変更

## UI サーフェス

### 注目試合の行のレイアウト（現行 → 変更後）

現行: 「注目: {home} vs {away}（{competition}）」の1行。

変更後の推奨構成（Codex の裁量で微調整可、ただし情報の優先順位は維持）:
```
注目
{home} vs {away}          {kickoff日時}
```
または既存の1行構成のまま末尾にキックオフ時刻を追加する形でもよい（例: 「注目: {home} vs {away} — 7/18 (土) 17:40 JST」）。大会名（`focusCompetition`）は残す場合、キックオフ時刻より優先度を下げて小さく/末尾に表示する。

視覚的な優先順位（`specs/feat-calendar-og-image.md` から継続）: 見出し「◯大会◯試合」＞ 注目試合の行、は維持する。

## LLM 連携

なし。

## 受け入れ条件

1. `focus_kickoff` パラメータ付きで `/api/og?type=calendar&...&focus_kickoff=2026-07-18T08:40:00.000Z` にアクセスすると、注目試合の行に日本時間のキックオフ日時（日付・曜日・時刻）が表示される
2. `focus_kickoff` を省略した場合、または不正な値の場合、キックオフ時刻を表示せずエラーにならない（既存の `focus_home`/`focus_away` のみの表示にフォールバック）
3. 「◯大会◯試合」の文字色が `#c93a40`（Tryline ブランドアクセント）になっている。`type=result`/`type=round-scoreboard` の勝敗表示色（`#22c55e`）は変更されていない
4. `app/calendar/page.tsx` の `generateMetadata` が、注目試合（`selectCalendarFocusMatchId` で選ばれた試合）の `kickoffAt` を `createCalendarOgImage` に渡している
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
6. 既存テスト（`tests/lib/seo/og-image.test.ts` / `tests/api/og-competition.test.tsx` / `tests/app/calendar-page.test.tsx`）を本変更に合わせて更新し、キックオフ時刻ありなしの両パターンをカバーする
7. 実際に生成された OG 画像（キックオフ時刻ありの通常パターン、キックオフ時刻なし＝注目試合自体がない週）をスクリーンショットで提示し、色・レイアウトが崩れていないことを確認する

## 未解決の質問

- キックオフ時刻の表示形式（`7/18 (土) 17:40 JST` のような簡潔な独自フォーマットを組むか、`lib/format/kickoff.ts` の既存関数をそのまま組み合わせるか）は、画像内の横幅制約を見ながら Codex の裁量に委ねる。新しいフォーマット関数が必要な場合は `lib/format/kickoff.ts` に追加し、`route.tsx` 内にロジックを直書きしない
