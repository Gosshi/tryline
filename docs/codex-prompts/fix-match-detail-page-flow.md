`/specs/fix-match-detail-page-flow.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `app/matches/[id]/page.tsx`（321〜468行目付近、`MatchContentSection`→`MatchLineupsSection`→`StandingsTable`→`PremiumMatchChat`の順序）と `components/standings-table.tsx` を読んで現状の実装を理解すること
- 「両チームの次戦」の取得は、既存の `lib/db/queries/matches.ts` に類似のクエリ（次節の試合取得）があるか確認し、無ければ軽量なクエリを追加してよい
- 「このチームを追う」導線は `feat-favorite-team-follow-engagement.md` が実装済みであればそのコンポーネントを再利用する。未実装の場合は、シンプルなリンク（チームページへの遷移）に留めてよい
- 「同節の他レビュー2件」は、`matches.external_ids.wikipedia_round`（または既存の節判定ロジック、`lib/db/queries/matches.ts` の `getRoundFromExternalIds` 相当）で同じ節の試合を絞り込み、レビュー公開済みのものを優先する。同節に十分な件数が無ければ同大会の直近公開レビューにフォールバックしてよい

入出力の例:
- Nations Championship 2026（12チーム）の試合ページ → 順位表は該当2チームのみ初期表示、「全順位表を見る」ボタンで展開。ページ末尾に両チームの次戦・このチームを追う・同節の他レビュー2件・`/calendar` へのリンクを含む「次に見る」ブロック
- Six Nations（6チーム）等の少チーム大会 → 抜粋表示の必要性は薄いが、一貫性のため同じ仕組みでよい（チーム数が少なければ実質的に大きな違いは出ない）

処理すべきエッジケース:
- プレーオフ・決勝等、順位表自体が存在しない大会の試合ページでは、この抜粋表示ロジック自体が発火しない（既存の順位表なし分岐を維持する）
- SSR時点で全データを保持する実装（例: 全データをHTMLに埋め込み、CSSやJSで表示件数を絞る）にするか、サーバー側で絞り込んで返すが`<details>`要素等でクローラーにも読める形にするかはCodexの判断に委ねるが、SEOへの影響が出ないことを検証すること
- 同節の他レビューが1件も見つからない場合は、その項目のみ非表示にする（空欄や「なし」の表示にしない）

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（StandingsTableのデータ取得ロジック変更、AIチャット機能の変更）は実装しない
- ネタバレ防止トグルの追加は `feat-spoiler-guard-ui.md` が未実装なら見送り、完了報告にその旨を明記する

完了時:
- 実装内容、変更・新規ファイルを要約する
- 順位表の抜粋表示をSSR/SEOの観点でどう実装したか説明する
- 仕様書からの逸脱があれば理由を明示する
