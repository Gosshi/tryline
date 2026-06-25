# サービス接続リファレンス

引き継ぎ・新セッション冒頭用の接続情報まとめ。シークレット値は記載しない。

---

## Supabase

| 項目 | 値 |
|------|-----|
| プロジェクト ID | `rtoljbvqvbxcgpesohpt` |
| リージョン | ap-northeast-1 (Tokyo) |
| Production URL | `https://rtoljbvqvbxcgpesohpt.supabase.co` |
| MCP サーバー | `plugin:supabase` |

**Claude Code での利用方法**
- `mcp__plugin_supabase_supabase__execute_sql` で本番 DB を直接クエリ可
- 書き込み・DDL は Owner 承認後のみ実行
- ローカル開発: `supabase start`（`.env.local` に接続文字列あり）

**主要テーブル**（参考）
```
matches, competitions, teams, match_events, match_reviews,
match_previews, match_chat_messages, competition_standings,
profiles, subscriptions
```

---

## Google Analytics 4 (GA4)

| 項目 | 値 |
|------|-----|
| プロパティ名 | Tryline |
| プロパティ ID | `properties/538067713` |
| アカウント ID | `accounts/395100409` |
| アカウントオーナー | Gota Nakanishi |
| MCP サーバー名 | `analytics` |

**MCP 接続情報**
- パッケージ: `analytics-mcp 0.6.0`（pipx でインストール）
- 実行バイナリ: `/Users/gota/.local/bin/analytics-mcp`
- SA キーパス: `~/.config/tryline/ga-sa.json`（chmod 600、絶対にコミット禁止）
- Python: Python 3.13 固定（Python 3.14 は `platform.mac_ver()` バグあり、動かない）

**注意**: GA Data API は Google Cloud Console で有効化済み（`stable-matter-499910-e4` プロジェクト）

---

## Google Cloud Platform (GCP)

| 項目 | 値 |
|------|-----|
| プロジェクト ID | `stable-matter-499910-e4` |
| SA キーファイル | `~/.config/tryline/ga-sa.json` |
| SA の用途 | GA4 MCP 認証のみ |

**SA キーの注意**
- リポジトリ外のホームディレクトリ（`~/.config/tryline/`）に配置
- 漏洩した場合は GCP コンソールでキー削除・再生成

---

## GitHub Actions Cron

ファイル: `.github/workflows/cron-*.yml`（`vercel.json` は空 `{}`、cron は GHA で管理）

### `cron-ingest-live-competitions.yml`

| 項目 | 値 |
|------|-----|
| スケジュール | `0 2 * * *` UTC = **毎日 11:00 JST** |
| エンドポイント | `https://tryline-six.vercel.app/api/cron/ingest-live-competitions` |
| 認証 | `secrets.CRON_SECRET` |
| 手動実行 | `gh workflow run cron-ingest-live-competitions.yml` |

**既知の問題**: 1 日 1 回（11:00 JST）のため土曜夜 KO の試合が当日中に取り込まれない。
再設計の詳細は `docs/next-session-cron-redesign.md` 参照。

### `cron-orchestrate.yml`

| 項目 | 値 |
|------|-----|
| スケジュール① | `0 12 * * *` UTC = **毎日 21:00 JST**（recap/preview 生成） |
| スケジュール② | `0 15 * * 6,0` UTC = **土日 00:00 JST** |
| エンドポイント | `https://tryline-six.vercel.app/api/cron/orchestrate` |
| 認証 | `secrets.CRON_SECRET` |
| 手動実行 | `gh workflow run cron-orchestrate.yml` |

---

## Vercel

| 項目 | 値 |
|------|-----|
| 本番 URL | `https://tryline-six.vercel.app` |
| フレームワーク | Next.js 15 (App Router) |
| Cron 設定 | GitHub Actions（vercel.json は使っていない） |

---

## X (Twitter)

| 項目 | 値 |
|------|-----|
| アカウント | `@tryline_rugbyjp` |
| 投稿運用 | Owner 手動（API 連携なし） |

---

## 手動オペレーション チートシート

```bash
# ingest だけ手動で走らせる（土曜夜KO後など）
gh workflow run cron-ingest-live-competitions.yml

# orchestrate（recap生成）を手動で走らせる
gh workflow run cron-orchestrate.yml

# standings dry-run
pnpm tsx scripts/backfill-standings.ts --family=urc --season=2025-26 --dry-run

# standings 本番取り込み（Owner 実行）
pnpm tsx scripts/backfill-standings.ts --family=urc --season=2025-26 --confirm-owner-approved
```

---

## セッション開始前チェックリスト

- [ ] Supabase MCP: プロジェクト ID `rtoljbvqvbxcgpesohpt`
- [ ] GA4 MCP: SA キー `~/.config/tryline/ga-sa.json` が存在するか確認
- [ ] 直近の cron ログ: GitHub Actions > `cron-ingest-live-competitions` で確認
- [ ] 引き継ぎドキュメント: `docs/next-session-cron-redesign.md`（cron 再設計）

---

*最終更新: 2026-06-21*
