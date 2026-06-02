# Codex プロンプト: 再生成スクリプトに match-id 指定を追加（捏造記事ピンポイント再生成）

`specs/fix-content-fabrication.md` の既存資産是正を、**捏造を含む記事だけ**に絞って実行できるようにします。現状 `scripts/regenerate-overseas-content.ts` は「大会・プロンプト版」単位でしか対象を選べず、捏造記事だけ（旧版に散在＋現行版4.4.0に1件）をピンポイント再生成できません。**match-id 指定**を追加してください。

## 背景（why）
- 本番 GSC/Supabase 実測: 公開中 ja recap の **113件が「成功率」等のデータ非存在統計を捏造**。版別: recap@1.6.0/1.7.0/1.8.0/2.0.0/2.1.0（旧版）＋ **recap@4.4.0 が1件（match `8bf38c7c-0c06-4a81-b659-9c35c22da6bb`、リーグワンの旧SAMPLE、生成2026-05-24＝ガード稼働前のレガシー）**。
- 版で切ると同版のクリーン記事まで巻き込み、薄い試合が no-recap に転ぶリスクがある。良記事に触れず捏造だけ直したい。
- **現行版(4.4.0)スキップ**（L196付近）があるため、8bf38c7c は現状どの経路でも上書きできない。match-id 指定時はこのスキップを無効化して解決する。

## 変更内容
`scripts/regenerate-overseas-content.ts` に以下を追加:

1. **`--match-ids-file <path>`**（推奨・主経路）: 改行区切りの match_id ファイルを読み、その recap だけを対象にする。空行・前後空白・重複は無視。
   - 補助で `--match-ids <id1,id2,...>`（カンマ区切り）も受けてよい（少数用）。両方指定時はマージ。
2. **match-id 指定時の挙動**:
   - 対象は指定 match_id の `content_type=recap` 行のみ（`listExistingContent` 相当の `.in("status", EXISTING_CONTENT_STATUSES)` に `.in("match_id", ids)` を足す）。
   - **family フィルタ（L191付近）と現行版スキップ（L196付近）を無効化**（指定された以上、現行版でも family 対象外でも再生成する）。`--from-version` は無視。
   - 指定 match_id に該当する recap 行が無い場合は warn してスキップ（エラーで全体を止めない）。存在しない match_id も同様に warn。
3. **既存のゲートは維持**: `--dry-run` でコスト見積もり（指定件数ベース）を出す、`--confirm-owner-approved` 無しでは実行しない。
4. **ログ**: 各 match の `promptVersion -> currentVersion` と status（published / draft / skipped / failed）を従来どおり出力。最後に published / それ以外の件数サマリ。

## 参考にする既存パターン
- 引数パース `parseArgs`（L91付近）に `matchIds: string[]` を追加。
- 対象選択ループ（L190-212）: `params.matchIds.length > 0` の分岐を先頭に置き、family/currentVersion/fromVersion のスキップを通さず targets を構築。
- 既存の `estimateRegenerationCost` / `--dry-run` / `--confirm-owner-approved` / `generateContent(matchId, "recap")` をそのまま利用。

## 必ず処理すべきエッジケース
1. 指定 match_id が**現行版(4.4.0)**でも再生成する（8bf38c7c が直ること＝受け入れの肝）。
2. 指定 match_id が family 未対応（リーグワン等）でも再生成する（generateContent は family 非依存）。
3. ファイル内の空行・重複・前後空白・BOM を無視。`--match-ids-file` と `--match-ids` 併用はマージ＆重複除去。
4. 該当 recap 行が無い / 試合が存在しない match_id → warn してスキップ、全体は継続。
5. `--match-ids*` 未指定時は**従来挙動を完全維持**（family/版ベース、現行版スキップあり）。回帰させない。
6. `--dry-run` は指定件数と見積もりコストを出し、生成は実行しない。

## テスト
- `tests/scripts/regenerate-overseas-content.test.ts` に追加:
  - `--match-ids-file` のパース（空行・重複除去）。
  - match-id 指定時に**現行版もtargetに含まれる**（スキップされない）こと。
  - match-id 指定時に family フィルタが無視されること。
  - 未指定時の従来挙動が変わらないこと（既存テスト緑のまま）。

## 完了の定義
- `--match-ids-file` / `--match-ids` が動作し、指定 match の recap を現行版でも再生成する。
- `--dry-run` / `--confirm-owner-approved` ゲート維持。
- `pnpm typecheck` / `pnpm build` / `pnpm test`（全件）グリーン。
- 変更ファイル・使い方例・残課題を末尾に要約。

## 完了時に報告してほしいこと
- 使い方の実例（`--match-ids-file ./fabricated-ids.txt --dry-run` → 件数・コスト、その後 `--confirm-owner-approved`）。
- 現行版スキップ無効化の実装箇所。

---

## 改修後の Owner 運用（参考・このプロンプトの実行対象外）
1. 捏造 match_id をファイルに出力（Supabase SQL エディタ、データ非存在マーカーの和集合。generic % は誤検出のため除外）:
   ```sql
   select distinct match_id
   from match_content
   where content_type='recap' and status='published' and language='ja'
     and (content_md like '%成功率%' or content_md like '%テリトリー%'
          or content_md like '%支配率%' or content_md like '%ポゼッション%'
          or content_md like '%ランメートル%' or content_md like '%ラインブレイク%');
   ```
   結果を `fabricated-ids.txt`（1行1 match_id）に保存。
2. `! npx tsx scripts/regenerate-overseas-content.ts --content-type recap --match-ids-file ./fabricated-ids.txt --dry-run`（件数・コスト確認）
3. `! npx tsx scripts/regenerate-overseas-content.ts --content-type recap --match-ids-file ./fabricated-ids.txt --confirm-owner-approved`
4. 検証: 成功率カウントが **0** に。`8bf38c7c` の recap が捏造を含まないこと（or データ薄なら no-recap）。
