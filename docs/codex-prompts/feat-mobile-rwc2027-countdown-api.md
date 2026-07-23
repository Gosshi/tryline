# Codex プロンプト: feat-mobile-rwc2027-countdown (API段階)

**tryline リポジトリ**で貼る(仕様書: `specs/feat-mobile-rwc2027-countdown.md`)。この後に続くUI段階(`tryline-mobile`向け)より**先に**実装・マージすること。他のspec(related-news / next-read-links)とは独立(順不同・並行可)。

---

`specs/feat-mobile-rwc2027-countdown.md` の「API サーフェス(tryline)」節を実装してください。RWC2027カウントダウン・日本代表ランキング用の軽量エンドポイントを新設します。

コンテキスト:
- 新規: `GET /api/v1/rwc2027-status`
- `competitions`テーブル(`family = 'rwc' and season = '2027'`)の`start_date`列、`teams`テーブル(`slug = 'japan'`相当)の`world_ranking`/`world_ranking_updated_at`列を参照する
- **重要**: 現時点でRWC2027の`start_date`はDB上null(公式日程未確定)。nullを正常なレスポンスとして扱うこと。「日付が取れないのでエラーにする」等はしない

やること:
- `lib/api/v1/types.ts`に`V1Rwc2027StatusData`(`kickoff_date: string | null` / `japan_ranking: number | null` / `japan_ranking_updated_at: string | null`)を追加
- `app/api/v1/rwc2027-status/route.ts`を新規作成し、上記データを返す
- 既存の他エンドポイントと同じ`apiSuccess`/`apiError`レスポンス形式・キャッシュヘッダーの流儀に揃える(`PUBLIC_CACHE_CONTROL`相当)

エッジケース:
- `competitions`に`family = 'rwc' and season = '2027'`のレコードが万一存在しない場合も、エラーにせず`kickoff_date: null`を返す
- 日本代表チームの`slug`は既存の`teams`テーブルのデータで確認してから実装する(決め打ちしない)

完了の定義:
- specs の受け入れ条件 1〜2(tryline側)を満たすテストを追加
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 日本代表チームの`slug`をどう特定したか報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
