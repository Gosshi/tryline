`/specs/fix-matchup-title-ja-connector.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `app/matches/[id]/page.tsx`（84行目付近、`generateMetadata` 内の `title` 生成）と `app/h2h/[pair]/page.tsx`（68・126・139・211行目、title・見出し・JSON-LDの`name`）
- 実測根拠: GSCで「スコットランド 対 ポルトガル」というクエリが82インプレッション・平均順位6.2位・クリック0件。現在のタイトルは "vs" を使っているが、実際の検索クエリは "対" を使う。この字面の不一致がCTRを下げている疑い

入出力の例:
- 変更前: `title: "スコットランド vs ポルトガル | Tryline"`
- 変更後: `title: "スコットランド 対 ポルトガル | Tryline"`

処理すべきエッジケース:
- `app/matches/[id]/page.tsx` と `app/h2h/[pair]/page.tsx` 以外にも同様の "vs" 連結パターンが無いか、`grep -rn '"\${.*}\s*vs\s*\${' app/` 等で横断検索し、見つかった箇所は同様に修正する
- OGP画像（`createMatchOgImage` 等、`@vercel/og` で描画される画像内テキスト）は対象外。HTML上のテキスト（title/description/見出し/JSON-LD）のみを変更する

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 既存のスナップショットテスト等でタイトル文字列を検証しているものがあれば更新する

要件:
- スコープ対象外（チーム名日本語化ロジック自体の変更、OGP画像内テキスト、英語ロケールの表記）は変更しない
- 横断検索で他に見つからなかった場合は「無かった」と完了報告に明記する
- 未解決の質問（OGP画像内の"VS"表記の扱い）は、迷う場合は現状維持（画像は変更しない）を選び、完了報告で選択肢を提示する

完了時:
- 実装内容、変更ファイルを要約する
- 横断検索で新たに見つかった箇所があれば列挙する
- 仕様書からの逸脱があれば理由を明示する
