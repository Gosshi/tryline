# お気に入りチームの次戦API(モバイル向け)

## 背景

モバイル総合監査(2026-07-25、複数回)で繰り返し挙がった提案:「お気に入りチームの次戦をホーム最上部に表示する」「次戦まで○日」。現状ホーム画面は今週のカレンダーのみを取得しており、お気に入りチームの次戦が今週の範囲外(来週以降)の場合に表示する手段がない。

調査の結果、この機能に必要なクエリは**既に存在する**: `lib/db/queries/matches.ts` の `getNextMatchesForTeams({ afterIso, excludeMatchId, teamIds })` は複数チームIDを受け取り、各チームの直近の未来の試合を返す(`app/api/v1/matches/[id]/route.ts` で試合詳細の `next_team_matches` を作る際に既に使われているのと同じ関数)。新規クエリの実装は不要で、モバイル向けの薄いAPIエンドポイントを1本追加するだけで済む。

## スコープ

対象:
- 新規エンドポイント `GET /api/v1/me/next-matches` を追加する。認証必須(既存の `getUserFromBearer` / `getSupabaseBearerClient` パターンを `app/api/v1/me/route.ts` と同様に使う)
- ユーザーの `favorite_team_slugs`(最大3件、`user_profiles` 経由で取得可能。`app/api/v1/me/route.ts` の `getMobileUserProfile` を参照)をチームIDに解決し、`getNextMatchesForTeams({ afterIso: new Date().toISOString(), teamIds })` を呼び出す
- 結果を `V1NextReadMatch` と同形式にマッピングして返す(`app/api/v1/matches/[id]/route.ts` の該当箇所のマッピングロジックを踏襲する。新規共有ユーティリティ化はCodexの判断に委ねる)
- 複数のお気に入りチームがそれぞれ次戦を持つ場合、**重複除去した上で全件返す**(お気に入りチーム同士の対戦は1試合として1件のみ)。表示上どれを「トップの1件」として使うかはモバイル側の判断に委ねる(このAPIはリストを返すだけ)

対象外:
- お気に入りチーム未設定ユーザー向けのフォールバック内容(空配列を返すのみ。代替コンテンツの提示はモバイル側スコープ)
- キャッシュ戦略の新規設計(`PRIVATE_CACHE_CONTROL` を他の `/api/v1/me/*` エンドポイントと同様に使う。ユーザー依存のため公開キャッシュはしない)
- 過去の試合(結果)を含めること(未来の試合のみ)
- フラグ抑制(`suppressMatchFlags`)以外の新規表示ロジック追加

## データモデル変更

なし。既存の `matches` / `teams` / `user_profiles` テーブルをそのまま利用する。

## API サーフェス

新規: `GET /api/v1/me/next-matches`

- 認証: Bearerトークン必須。未認証は401(`apiError("unauthorized", 401, PRIVATE_CACHE_CONTROL)`、既存パターン踏襲)
- レスポンス: `V1NextMatchesData = { matches: V1NextReadMatch[] }`(`lib/api/v1/types.ts` に追記。`V1NextReadMatch` は既存の型をそのまま再利用、新規フィールド追加は不要)
- お気に入りチームが0件の場合、`{ matches: [] }` を返す(404にしない)
- フラグ表示は `app/api/v1/matches/[id]/route.ts` と同様に `getSingleNationCompetitionIds` を使って単一国代表チーム(招待チーム等)の旗を抑制する既存パターンに従う(直近マージ済みの `feat-team-flag-single-nation-suppression` の実装パターンを踏襲。マージ済みか事前に確認すること)

## UI サーフェス

なし(このspecはAPIのみ。UI側は別spec `feat-mobile-favorite-team-next-match.md` を参照)。

## LLM 連携

なし。

## 受け入れ条件

1. お気に入りチームを1件以上設定したユーザーが `GET /api/v1/me/next-matches` を呼ぶと、そのチームの直近の未来の試合が `V1NextReadMatch` 形式で返る
2. お気に入りチームを2件以上設定していて、それぞれ異なる次戦がある場合、両方が配列に含まれる(重複除去済み)
3. お気に入りチーム同士が対戦する場合、その試合は1件のみ返る(重複しない)
4. お気に入りチーム未設定ユーザーは `{ matches: [] }` を受け取る(エラーにならない)
5. 未認証リクエストは401を返す
6. 単一国代表チーム(招待チーム等)が絡む場合、旗表示が抑制される既存ルールと一致する
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
8. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

- レスポンスの試合数上限(お気に入り3チーム全ての次戦を毎回返すか、直近1件だけに絞るか)はCodexの判断に委ねる。現状は「重複除去した全件」を仕様としているが、実装時に不自然に感じた場合は完了報告で質問すること
