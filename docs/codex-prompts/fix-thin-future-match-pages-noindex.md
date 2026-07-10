`/specs/fix-thin-future-match-pages-noindex.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `app/matches/[id]/page.tsx` の `generateMetadata` 関数（66行目付近）を読み、既存のメタデータ生成ロジックを理解すること
- 過去の類似対応 `specs/fix-index-bloat-players-teams.md`（選手ページのnoindex制御）があれば、実装パターンの参考にしてよい
- `match_content` の有無判定は `lib/db/queries/match-content.ts` の既存クエリ（`getContentStatusForMatches` 等）を再利用すること

入出力の例:
- RWC 2027の試合（キックオフ2027年、`match_content` 0件）→ `generateMetadata` が `robots: { index: false, follow: true }` を返す
- 今週開催のNations Championship試合（`match_content` あり）→ 通常通りインデックス可能

処理すべきエッジケース:
- キックオフ直前でまだプレビューが生成されていない試合（生成が遅延しているだけのケース）にnoindexを誤って適用しない。7日以上先の試合のみを対象にする
- 終了済み試合でrecapが未生成のもの（別の問題、`content-qa`スキル等で扱う対象）には本specのnoindexロジックを適用しない

完了の定義:
- specs の受け入れ条件 1〜4 をすべて満たす（受け入れ条件5の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（終了済み試合への適用、日数閾値以外の判定基準の追加）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更ファイルを要約する
- 実際に本番相当のRWC 2027試合データで動作確認した結果を報告する
- 仕様書からの逸脱があれば理由を明示する
