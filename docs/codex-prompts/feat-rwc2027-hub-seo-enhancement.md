`specs/feat-rwc2027-hub-seo-enhancement.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 参考パターンは `app/c/[competition]/[season]/page.tsx` の以下の箇所を使う（他の大会ハブが既に使っている実装をそのままRWC2027ページに配線するだけの作業）:
  - FAQPage JSON-LD生成: `seasonFaqs`/`seasonFaqJsonLd`（481〜515行目付近）
  - 大会ガイド表示: `getCompetitionGuide` の呼び出しと `CompetitionViewingGuide` コンポーネントの使い方
  - JST日時整形: `lib/format/kickoff.ts` の `formatKickoffJstDate`/`formatKickoffJstTime`
- 変更対象は `app/c/rwc/2027/page.tsx` のみ。同ページは既に `listMatchesForCompetition("rwc-2027")` を呼んでおり、その戻り値（`MatchListItem[]`）には `venue` フィールドが含まれている（DB実測: 全36試合に投入済み、8会場）。新規クエリやDB投入は不要

エッジケース:
- `getCompetitionGuide("rwc")` が将来的にnullを返すケース（データ削除等）でもページがクラッシュしないこと（`CompetitionViewingGuide`コンポーネント自体が`markdown`nullの場合に何も描画しない設計なので、そのまま渡せばよい）
- 開催都市一覧は `venue` の重複を排除して表示する（同じ会場が複数試合で使われるため）
- 「日本代表の次の試合」FAQで、日本戦が既に全て終了している場合や日本のプール組み合わせが未確定の場合の文言（既存の汎用テンプレートの同種FAQ、または`listFamilies`/ホームページのnext-kickoffロジックで同様のフォールバック文言があれば踏襲する）

やらないこと:
- `competition_guides`・`matches.venue`データの追加・修正
- `app/c/rwc/2027/bracket/page.tsx` の変更
- 汎用テンプレート `app/c/[competition]/[season]/page.tsx` 自体の変更
- FAQPageの画面上のアコーディオン等UI表示（構造化データの埋め込みのみでよい）
- 開催都市のアクセス方法・座席数等の詳細情報

完了の定義:
- specの受け入れ条件1〜6を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- 「日本代表の次の試合」FAQのロジックをどう実装したか（既存関数の再利用か、新規実装か）を報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
