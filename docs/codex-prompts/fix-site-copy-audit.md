`/specs/fix-site-copy-audit.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- サイト内に機械翻訳調・内部用語が漏れた文言が複数箇所見つかっている（spec本文に確認済み8箇所を列挙済み）

やること:
- spec本文「確認済み」の8箇所（`favorite-teams-banner.tsx` / `app/page.tsx` 2箇所 / `app/pricing/page.tsx` 2箇所 / `match-chat.tsx` / `team-stats-panel.tsx` / `app/h2h/[pair]/page.tsx`）を、specに示した方向性で自然な日本語に修正する
- 加えて `app/` `components/` 配下を横断検索し、同種の機械翻訳調・内部用語（テーブル名等）・英語混在文言が他にあれば修正対象に含めてよい（見つからなければ8箇所のみで完了扱いとする）

処理すべきエッジケース:
- `app/pricing/page.tsx` の「何でも聞ける AI チャット」は、単なる言い回し修正ではなく、groundingの範囲（sourced_facts / match_events に基づくデータ）を超えない表現に変えることが必須
- 修正によって機能・遷移先・対象範囲の意味が変わらないこと

完了の定義:
- specs の受け入れ条件1〜5を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- LLM生成コンテンツ（recap/preview本文）のプロンプト・文体は変更しない
- コピー全体のトーン統一など、本specで指定した箇所を超える大規模な書き換えはしない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 修正した全箇所の「修正前→修正後」の文言一覧を報告する
- 8箇所以外に追加で見つけた箇所があれば併せて報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
