# Codex プロンプト: feat-ios-app-mvp

2 リポジトリにまたがるため 2 部構成。**プロンプト A（tryline）→ マージ → プロンプト B（tryline-mobile）** の順で貼る。

## Owner の事前作業（プロンプト B の前に）

```bash
git clone git@github.com:Gosshi/tryline-mobile.git ~/Documents/src/tryline-mobile
```

---

## プロンプト A（tryline リポジトリで貼る）

`/specs/feat-ios-app-mvp.md` の「tryline 側」部分のみを実装してください: `DELETE /api/v1/me`（アカウント削除エンドポイント）。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 既存の `app/api/v1/me/route.ts` に `DELETE` エクスポートを追加する（新規ファイル不要）
- Bearer 認証は `lib/auth/bearer.ts` の `getUserFromBearer`、共通エンベロープは `lib/api/v1/response.ts` を再利用
- auth ユーザー削除は service role クライアントで `supabase.auth.admin.deleteUser(userId)`（service role クライアントの生成は `app/api/stripe/webhook/route.ts` のパターン参照）

エッジケース:
- Bearer なし / 不正 → 401
- `deleteUser` が失敗（Supabase エラー）→ 500 でエンベロープの error にメッセージ、セッションは壊さない
- `stripe_subscription_id` が非 null のユーザー → 削除は実行するがサーバーログに warn（仕様書の注意参照）

完了の定義: 受け入れ条件 1〜3 のテスト追加、`pnpm test`・`pnpm build` pass、既存 GET /api/v1/me に diff なし。仕様書との食い違いがあれば停止して Owner に確認。

---

## プロンプト B（tryline-mobile リポジトリで貼る。A のマージ後）

`~/Documents/src/tryline` の `/specs/feat-ios-app-mvp.md` の仕様で、この空リポジトリに iOS アプリ v1 を実装してください。仕様書の「tryline 側」セクション（DELETE /api/v1/me）は実装済みです。

最初にやること（リポジトリ初期化）:
1. `create-expo-app`（TypeScript テンプレート）で雛形生成、expo-router 導入、TypeScript strict
2. `AGENTS.md` を新規作成: tryline の `AGENTS.md` を読み、モバイル向けに調整（Supabase 直書き禁止・機密ファイル禁止・実装停止ルールは維持。Next.js 固有の記述は除去）
3. GitHub Actions CI（lint / tsc --noEmit / jest-expo）
4. `eas.json`（development / preview / production）

実装の参照先:
- API コントラクト: tryline の `lib/api/v1/types.ts` を `src/api/types.ts` にコピー（改変しない。乖離時は tryline が正）
- デザイントークン: tryline の `app/globals.css` から `--color-accent` / `--color-paper` / `--color-ink` / `--color-ink-muted` の実値を `src/theme/tokens.ts` に転記
- ペイウォール文言・挙動: 仕様書「画面仕様 2」の審査ルールを一字一句守る（**購入導線・価格・pricing リンクの追加は禁止**。「便利だから」で追加しない）

入出力の具体例:
- カレンダー API: `GET https://www.trylinerugby.com/api/v1/calendar?from=2026-07-13&to=2026-07-19` → `{ success, data: { matches: [...] }, error }`。`kickoff_utc` は端末タイムゾーンで表示
- ネタバレ防止 ON のスコア表示: `24-17` → `●–●`、タップで開示（メモリのみ、再起動で再マスク）

エッジケース:
- API がエンベロープで `success: false` → ユーザー向けエラーメッセージ（日本語）＋リトライ導線。生のエラー文字列を画面に出さない
- カレンダーが 0 試合の週 → 空状態 UI（「今週は試合がありません」＋週ナビ）
- OTP: 誤コード → 日本語エラー、再送ボタン（Supabase のレート制限エラーもハンドリング）
- セッション期限切れ → supabase-js の自動リフレッシュに任せ、失敗時は未ログイン状態に落とす（クラッシュさせない）
- 未終了試合（score null）→ ネタバレ防止のマスク対象外（スコアがそもそも無い）
- アカウント削除 API が失敗 → セッションを破棄せずエラー表示

要件:
- 受け入れ条件 4〜14 をすべて実装し、対応するテストを書く（jest-expo + React Native Testing Library）
- 「スコープ対象外」は実装しない（push 通知・IAP・AI チャット・ダークモード・Android 提出はやらない）
- 仕様書の「未解決の質問」2・3（Supabase の identity linking / OTP メールテンプレート）は実装中に確認し、問題があれば停止して Owner に報告
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、実装を進めずその場で停止して Owner に確認する

完了の定義:
- `npx expo start` で iOS シミュレータ起動、4 画面遷移がクラッシュなし
- CI green（lint / tsc / test）
- **4 画面のスクリーンショット（iPhone 15 相当）を提出**（受け入れ条件 14 の Owner 目視評価用）
- 実装内容・変更ファイルの要約、仕様書からの逸脱（あれば理由）、未解決の質問を報告する

---

## 委譲後の流れ（Owner 向けメモ）

1. プロンプト A → tryline に PR → Claude Code の `codex-review` → マージ（DB 変更なし、デプロイ確認のみ）
2. リポジトリ clone（上記コマンド）→ プロンプト B → tryline-mobile に PR → `codex-review`（ペイウォールの購入導線不存在とスクリーンショットを重点確認）
3. マージ後、Owner が eas build → TestFlight で実機確認
4. 次の spec: push 通知（APNs / 試合前通知 / Universal Links）
