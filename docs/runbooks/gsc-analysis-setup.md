# Runbook — GSC 分析スクリプトのセットアップ（Owner 作業）

`tools/gsc-pull.ts`（仕様: `specs/feat-gsc-analysis-script.md`）を実行できるようにするための一回限りの準備手順。Codex の実装と並行で進められる。所要 15〜20 分程度。

前提: `trylinerugby.com` の Google Search Console プロパティの **オーナー権限**を持っていること（ユーザー追加に必要）。

---

## 1. Google Cloud プロジェクトと API 有効化

1. [Google Cloud Console](https://console.cloud.google.com/) を開く。既存プロジェクトを使うか、新規作成（例 `tryline-gsc`）。
2. **APIとサービス > ライブラリ** で **Google Search Console API**（"Search Console API"）を検索し **有効化**。
   - ⚠️ **Indexing API は有効化しない**（書込経路を作らないため）。

## 2. サービスアカウント作成

1. **APIとサービス > 認証情報 > 認証情報を作成 > サービスアカウント**。
2. 名前（例 `gsc-readonly-puller`）→ 作成。**ロールは付与しない**（GCP IAM ロールは Search Console には不要。アクセスは GSC 側のユーザー追加で与える）。
3. 作成された SA の**メールアドレス**を控える（例 `gsc-readonly-puller@tryline-gsc.iam.gserviceaccount.com`）。

## 3. JSON キー発行（リポジトリ外に保存）

1. SA の詳細 > **キー > 鍵を追加 > 新しい鍵を作成 > JSON**。
2. ダウンロードされた JSON を**リポジトリ外**に保存。例:
   - `~/.config/tryline/gsc-sa-key.json`（推奨。`chmod 600`）
3. ⚠️ このファイルは**絶対にコミットしない**。リポジトリ内に置かない。

## 4. Search Console にサービスアカウントを追加（権限: フル）

1. [Search Console](https://search.google.com/search-console) で `trylinerugby.com` プロパティを開く。
2. **設定 > ユーザーと権限 > ユーザーを追加**。
3. 手順2で控えた **SA のメールアドレス**を貼り、権限を **「フル」** に設定して追加。
   - **なぜフル**: URL Inspection API は "制限付き" だと 403/PERMISSION_DENIED になる。Search Analytics だけなら制限付きで足りるが、本スクリプトは URL Inspection も使うためフルが必要。
   - **安全性**: スクリプトは OAuth スコープ `webmasters.readonly` のみ要求するので、フル権限でも**書込（sitemap 送信・インデックス申請・削除）は実行不可**。GSC 権限は当該プロパティ内に閉じ、本番アプリ/Supabase/Stripe には触れない。

## 5. env ファイル（専用・gitignore）

リポジトリ直下に `.env.gsc.local` を作成（本番 Supabase 等のキーとは混ぜない）:

```
GSC_SITE_URL=https://www.trylinerugby.com/
GOOGLE_APPLICATION_CREDENTIALS=/Users/<you>/.config/tryline/gsc-sa-key.json
```

- `.env.gsc.local` が `.gitignore` 済みであることを確認（spec で追加予定。未追加なら追加）。
- `GSC_SITE_URL` は**実プロパティが URL-prefix 型**のため `https://www.trylinerugby.com/`（末尾スラッシュ込み・`https://www.` 正確に）。SA が実際にアクセスできるプロパティ識別子は Search Console API の `sites.list` で確認できる。将来ドメインプロパティに移行した場合は `sc-domain:trylinerugby.com`。

## 6. 動作確認

スクリプト実装後（Codex 完了後）に実行:

```bash
# Search Analytics のみ（軽い）
node --env-file=.env.gsc.local tools/run-ts.cjs tools/gsc-pull.ts --range 28d

# URL Inspection も込み（クォータ消費あり、まず少件数で）
node --env-file=.env.gsc.local tools/run-ts.cjs tools/gsc-pull.ts --range 28d --inspect players --inspect-limit 5
```

成功すると `tmp/gsc/` に JSON / summary が出力される。出力ファイルを Claude に読ませて分析する。

## トラブルシュート

- **403 / PERMISSION_DENIED（URL Inspection）**: GSC のユーザー権限が「制限付き」のまま。→「フル」に変更。反映に数分かかることがある。
- **403（Search Analytics 含む全般）**: SA メールが GSC プロパティに未追加、またはプロパティ識別子（`GSC_SITE_URL`）の不一致。`sc-domain:` か URL prefix かを確認。
- **API が有効でない（SERVICE_DISABLED）**: GCP で Search Console API を有効化。
- **キーが読めない**: `GOOGLE_APPLICATION_CREDENTIALS` のパス・権限（`chmod 600`）を確認。
- **クォータ超過（URL Inspection: 2000/日・600/分）**: `--inspect-limit` を下げる、対象グループを絞る。

## セキュリティ要点（CLAUDE.md 準拠）

- スコープ `webmasters.readonly` 固定・書込 API なし。
- SA キーはリポジトリ外・`chmod 600`・コミット禁止。
- `.env.gsc.local`・`tmp/gsc/` は gitignore。
- 実行は Owner（外部 API＋認証情報使用）。LLM コストは無し。
- キーを漏らした場合は GCP で当該キーを削除し再発行（GSC のユーザー追加はそのままで可）。

## 関連

- 仕様: `specs/feat-gsc-analysis-script.md`
- Codex プロンプト: `docs/codex-prompts/feat-gsc-analysis-script.md`
