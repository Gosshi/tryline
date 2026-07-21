`/specs/feat-match-stories-post-match-news.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `feat-match-stories-news-items.md`（Phase 1、マージ済み）の「未解決の質問」で保留されていた「試合後ニュース（Phase 2）」に相当する
- 2026-07-21の実コード検証で、`lib/llm/sourced-facts/fetch.ts` の recap用検索プロンプトは既にPOTM・負傷・カード/出場停止・監督コメントを検索対象にしているが `fact_ja` 生成指示がなく、`app/api/v1/stories/route.ts` の `buildNewsItems()` は `preview/shared` のみを対象にしていることを確認済み
- mobile側 (`tryline-mobile/src/stories/storyModel.ts`) の spoiler guard判定は `contains_result` フィールドを汎用的に見る実装のため、iOS側の追加実装は原則不要と判断済み

やること:
- `lib/llm/sourced-facts/fetch.ts` の `buildSearchPrompt()` で `contentType === "recap"` の `contentTypeRules` に、preview分岐と同様の `fact_ja` 生成指示（80〜160字の自然な日本語ニュース調の言い換え、内容の追加・推測禁止）を追加する
- `app/api/v1/stories/route.ts` の `buildNewsItems()`（または試合後版として新設する関数）で `contentType === "recap"` の事実も対象に含める:
  - `fetchedAt < kickoffAt` の制約は外す
  - `confidence === "high"` の閾値を維持（Phase 1と同じ）
  - 日本語判定条件・同一 `source_domain` 重複排除・1試合あたり上限3件のロジックはPhase 1のものを再利用する
  - 生成する item は `contains_result: true`
- items の並び順を「preview → 試合前news(`contains_result: false`) → result → recap → 試合後news(`contains_result: true`)」に更新する
- 1試合あたりのitems上限を現行6から9に引き上げる

処理すべきエッジケース:
- recap facts が0件（該当試合にPOTM等の情報がない）場合、試合後newsは0件のまま既存のitemsのみ返す
- `confidence` が `high` 未満の recap事実は除外する
- 同一試合で試合前newsと試合後newsが両方存在する場合、順序が正しく preview→試合前news→result→recap→試合後news になることを確認する

完了の定義:
- specの受け入れ条件1〜10を満たす（10番目のOwner目視確認は、実装後に実データのスクリーンショット・確認手順を報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- カテゴリ別の確度基準（出場停止=公式ソース必須等）は導入しない。confidenceの単一閾値のみで判定する
- 既存95件の recap sourced facts（`fact_ja` null）のバックフィルは行わない。新規取得分から反映される設計でよい
- iOS側のコード変更は原則行わない。ただし実装完了後、実際にmobileでrecap由来news itemがspoiler guard対象ユーザーに正しくブラー表示されるかを確認し、もし個別実装が必要だと分かった場合は完了報告に明記する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 実際のrecap sourced factからnews itemが生成される例（対戦カード・fact_ja・contains_result値）を報告に含める
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
