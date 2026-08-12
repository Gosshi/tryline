`specs/feat-stories-carry-over-recent-recap.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 背景: `app/api/v1/stories/route.ts` は `from`/`to` 未指定のとき `getCurrentJstWeekRangeUtc()`（62〜71行）で JST 月曜〜日曜に限定するため、**週をまたぐと直前の試合のレビューが既定フィードから消える**。2026-08-11 実測で、8/8 日本×オーストラリアの `recap` は存在するのに今週のフィードには出なかった
- **これはバグではなく仕様。** ホームの週送りで「前週」を押せば見られる（`app/(tabs)/index.tsx:33` が選択中の週で `trylineApi.stories(range)` を呼ぶ）。**既定表示から消えることだけを直す**

参考にする既存パターン:
- **既定範囲の解決**: 同ファイル 62〜71行の `from === null && to === null` の分岐。繰り越しはこの経路に入ったときだけ有効にする
- **試合の取得と絞り込み**: 同ファイル 332〜333行の `getMatchesInRange(range.startUtcIso, range.endUtcIso)` → `.filter(isStoryCandidate).slice(0, MATCH_LIMIT)`
- **ストーリー組み立て**: 同ファイル 335〜348行。**繰り越す試合も必ずこの同じ経路を通す**こと（`recap` だけを抜き出す別経路を作らない）
- **JST の日付計算**: 同ファイル 37〜38行の `DAY_MS` / `JST_OFFSET_MS`、および `lib/format/week.ts`

エッジケース:
- **`from`/`to` を明示指定したリクエストでは繰り越しを一切行わない。** ここに入れると週送りが「その週だけ」を返さなくなり、UI の意味が壊れる
- **今週に `recap` が1件でもあれば繰り越さない。** 情報量を無駄に増やさないため
- 直前7日間に該当が無ければ、レスポンスは現行と完全に同一であること
- 繰り越すのは**最大1試合**。複数該当するときはキックオフが最も新しいものを選ぶ
- 繰り越した試合は `data.matches` の**末尾**に置く。今週のぶんより前に出さない
- **`data.week` の `from` / `to` / `label` は今週のまま変えない**
- `MATCH_LIMIT = 12`（39行）との関係を決める。**繰り越しの1件を上限の外に加算する（最大13件）か、今週ぶんを11件に抑えて合計12件に収めるか**を選び、**選んだ理由を PR 説明に書く**
- 追加の `getMatchesInRange` 呼び出しは、繰り越し条件を満たすときだけ実行する。無条件に毎回呼ばない

やらないこと:
- `V1MatchStories` / `V1StoryItem` / `V1StoriesData` への**フィールド追加**（API コントラクト変更は行わない。`reference/api-types.ts` の同期が発生してしまう）
- `tryline-mobile` 側のファイル変更（週送り・`weekLabel`・`seenStore` はそのまま）
- Web 側 UI の変更
- ストーリー生成ロジック・OG 画像の変更（どちらも正常動作を確認済み）
- `getCurrentJstWeekRangeUtc` 自体の変更（他からも使われている）
- `docs/decisions.md` / `specs/*.md` / `CLAUDE.md` / `AGENTS.md` の変更（AGENTS.md:180-181 で禁止）

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- テストを追加する。最低限、次の5ケース
  1. 今週に `recap` 無し・直前7日に `recap` あり → 末尾に1件だけ追加される
  2. 直前7日に複数該当 → キックオフが最も新しい1件が選ばれる
  3. 今週に `recap` あり → 繰り越しが発生しない
  4. 直前7日に該当なし → レスポンスが現行と同一
  5. **`from`/`to` 明示指定 → 繰り越しが発生しない**
- `data.week` が変化しないことも検証する
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **`MATCH_LIMIT` との関係でどちらを選んだか、その理由**を報告する
- spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する（「CI green」だけの報告は不可）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
