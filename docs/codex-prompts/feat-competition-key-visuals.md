`/specs/feat-competition-key-visuals.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイルは `app/c/[competition]/page.tsx` のみ
- **画像生成 API は絶対に呼び出さないこと。** 画像そのものは Owner が別途用意する。あなたの仕事はコード側の切り替え（Unsplash URL → ローカルパス）のみ
- 着手前に、`public/visuals/` に画像がすでに配置されているか Owner に確認すること。配置されていない場合は spec の「アセット未配置時のフォールバック」に従うこと

入出力の例:
- 変更前: `COMPETITION_HERO_IMAGES.premiership` が `https://images.unsplash.com/photo-1574629810360-...` を指す
- 変更後: `COMPETITION_HERO_IMAGES.premiership` が `/visuals/premiership.jpg` を指す

処理すべきエッジケース:
- `public/visuals/{family}.jpg` が存在しない大会がある場合、壊れた画像リンクにならないようにすること（spec の「アセット未配置時のフォールバック」参照）
- `next.config.ts` に Unsplash 用の `images.remotePatterns` 設定がある場合、他の用途で使われていないか確認してから削除の要否を判断すること
- 画像の `alt` 属性、オーバーレイ、テキスト配置は一切変更しないこと

完了の定義:
- `COMPETITION_HERO_IMAGES` と `DEFAULT_COMPETITION_HERO` がローカルパス（または spec のフォールバック方針）を指している
- 全大会ページ（最低3件、うち画像が配置されているものと配置されていないものを両方含める）でヒーロー画像の表示をスクリーンショット確認する
- `pnpm tsc --noEmit` / `pnpm build` が通る

要件:
- 受け入れ条件セクションのすべてを実装する
- 「スコープ対象外」（画像生成そのもの、ホーム/OGへの流用、シーズンページへの追加）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- どの大会にローカル画像が配置されていて、どの大会がフォールバックのままかを一覧化する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
