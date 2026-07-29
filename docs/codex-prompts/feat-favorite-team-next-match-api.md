# Codex プロンプト: feat-favorite-team-next-match-api

**tryline リポジトリ**で貼る(仕様書: `specs/feat-favorite-team-next-match-api.md`)。この後 tryline-mobile 側の `feat-mobile-favorite-team-next-match` に着手するので、先にこちらをマージすること。

---

`specs/feat-favorite-team-next-match-api.md` の仕様を実装してください。ユーザーのお気に入りチームの直近の次戦を返す新規モバイル向けAPIエンドポイントを追加します。

コンテキスト:
- 対象ファイル(新規): `app/api/v1/me/next-matches/route.ts`
- 対象ファイル(変更): `lib/api/v1/types.ts`(`V1NextMatchesData` 型追加)
- 参照パターン: `app/api/v1/me/route.ts`(認証・`getMobileUserProfile`)、`app/api/v1/matches/[id]/route.ts`(`getNextMatchesForTeams` の呼び方、`V1NextReadMatch` へのマッピング、`getSingleNationCompetitionIds` によるフラグ抑制)
- 新規クエリ実装は不要。`lib/db/queries/matches.ts` の `getNextMatchesForTeams({ afterIso, teamIds })` を再利用する
- CLAUDE.mdを読む

やること:
1. `GET /api/v1/me/next-matches` を新規実装。Bearer認証必須(`getUserFromBearer`/`getSupabaseBearerClient`)、未認証は401
2. `getMobileUserProfile` でユーザーの `favoriteTeamSlugs` を取得し、`teams` テーブルでIDに解決
3. お気に入りチームが0件なら `{ matches: [] }` を返す(エラーにしない)
4. `getNextMatchesForTeams({ afterIso: new Date().toISOString(), teamIds })` を呼び出し、結果を重複除去(同一試合が複数チーム経由で返ってきた場合は1件に)した上で `V1NextReadMatch[]` にマッピングする(`app/api/v1/matches/[id]/route.ts` のマッピングロジックを踏襲)
5. `getSingleNationCompetitionIds` を使い、単一国代表チーム絡みの試合は既存パターン同様に旗表示を抑制する
6. `lib/api/v1/types.ts` に `V1NextMatchesData = { matches: V1NextReadMatch[] }` を追加

エッジケース:
- お気に入りチーム2件がそれぞれ別の次戦を持つ場合、両方が返る
- お気に入りチーム同士が対戦する場合、1件のみ返る(重複除去)
- お気に入り0件は空配列(404ではない)
- 未認証は401

やらないこと:
- UI側実装(tryline-mobile側の別specで対応)
- お気に入り未設定時の代替コンテンツ(空配列を返すのみ)
- 過去の試合(結果)を含めること

完了の定義:
- specs の受け入れ条件 1〜7 を満たす(8はOwner承認後の本番デプロイなのでCodexの完了報告には含めない)
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- レスポンスの試合数上限について、仕様書「未解決の質問」に沿って実装時の判断を報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
