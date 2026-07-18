# fix-home-page-test-relative-dates: home-page テストの日付ハードコードを恒久修正する

対象リポジトリ: **tryline**。テストのみの変更（プロダクトコード変更なし）。

## 背景

`tests/app/home-page.test.tsx > HomePage > renders the matchday board from current week matches` が、フィクスチャの `kickoffAt` に**絶対日付をハードコード**しているため（現在は `2026-07-18T09:00:00.000Z` 等）、実時刻がその週を過ぎるたびに「今週の試合」フィルタから外れて失敗する。

- 2026-07-13: PR #550/#551 の CI がこの1件で赤くなり、都度「クリーン main でも落ちるか」の検証をしてからマージする運用コストが発生
- 2026-07-13: PR #553 で Codex が日付を1週間ずらす一時パッチ（`2026-07-11`→`2026-07-18`）を適用
- 2026-07-18: 予告どおり再発（PR #591 の CI が同じ1件で fail、検証の上マージ）

**都度1週間ずらすモグラ叩きをやめ、テスト内の「現在時刻」を固定する。**

## スコープ

対象:
- `tests/app/home-page.test.tsx`（該当テストと、同ファイル内で同じ理由により壊れうる日付依存フィクスチャ）

対象外:
- プロダクトコード（`app/page.tsx`・週レンジ計算等）の変更
- 他のテストファイル（同種の日付ハードコードが他にあれば完了報告で列挙するに留め、修正しない）

## 変更内容

**方針: fake timers で「現在時刻」をフィクスチャに合わせて固定する**（相対日付計算でフィクスチャを動かす方式より、アサーション文字列が固定文字列のまま読めるこちらを採る）。

- `beforeEach` で `vi.useFakeTimers()` + `vi.setSystemTime(new Date("2026-07-17T03:00:00.000Z"))`（フィクスチャの週内の任意時刻）、`afterEach` で `vi.useRealTimers()`
- リポジトリ内の既存パターンに合わせる: `tests/api/mobile-api-v1-stories.test.ts` が同じ構成（`vi.setSystemTime` で JST 週境界テストを安定化）を既に採用している
- 既存のフィクスチャ日付・アサーション文字列（`"2026-07-18 (土) 19:30 JST"` 等）は変更不要
- fake timers 導入で同ファイル内の他テストが副作用を受けないこと（タイマー依存のレンダリングがあれば `shouldAdvanceTime` 等で調整）

## 受け入れ条件

1. 該当テストが、実行日の実日付に関係なく通る（検証: `vi.setSystemTime` を使わない一時変更で落ち、使うと通ることをローカルで確認。または CI 実行日と無関係であることをコードレビューで確認できる構造にする）
2. `tests/app/home-page.test.tsx` の全テストが通る
3. プロダクトコードの変更が diff に含まれない
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る（この修正のマージで CI validate が完全グリーンに戻る）

## 未解決の質問

- なし
