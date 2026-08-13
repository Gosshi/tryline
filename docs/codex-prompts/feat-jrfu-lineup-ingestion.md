`specs/feat-jrfu-lineup-ingestion.md` の仕様を実装してください。**spec は 2026-08-13 に全面改稿されています。マージ済みの PR #690 とは方針が変わっているので、必ず `git pull` して読み直してください。**

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 背景: PR #690（マージ済み）は本番で `{"error":"Failed to ingest lineups"}` を返した。直接原因は `players.slug` の NOT NULL 違反だが、**それを直すとより深刻な問題が出る**ことが本番実測で判明した

**方針変更の理由（実測値）**:

```
日本代表の players 81名
  name が非ASCII（漢字・カタカナ）    0名   ← 全員ローマ字表記（Haruto Kida 等）
  name_ja あり                       11名
```

`ensurePlayerIds` は `players.name` の完全一致で探すため、JRFU の `木田晴斗` は `Haruto Kida` と一致しない。**日本23名＋豪州23名の計46名が新規作成され、既存選手と重複する。** `slug` の NOT NULL 違反は結果的にこれを止めていた。

**Owner 判断: JRFU 経路で `players` を新規作成しない。`match_lineups` にも書かない。**

**代わりに `match_sourced_facts` へ入れる。** `generate-preview.ts:223` は選手名の出所として `sourced_facts` を認めており、第1戦（8/8）では実際に `rugby-japan.jp` 由来・`confidence='high'` の先発情報が入って機能していた。この経路なら名寄せが不要になる。

参考にする既存パターン:
- **URL 解決は PR #690 の実装を流用する。再実装しないこと。** `lib/scrapers/jrfu-lineups.ts` の `buildJrfuBraveBlossomsMatchUrl` / `findJrfuMatchUrl` / `parseJrfuMatchLineupHtml`。**実ページで動作確認済み**（ランディングに完全一致のアンカー `試合登録メンバー/試合記録はこちら` と `/match/30035` があることを 2026-08-13 に実測）
- **保存先**: `lib/llm/sourced-facts/fetch.ts`。`match_sourced_facts` に `fact` / `fact_ja` / `source_url` / `source_domain` / `confidence` / `metadata` を持つ
- **呼び出し口**: `app/api/cron/fetch-sourced-facts/route.ts`（`content_type` と `force` を受ける）
- **許可ドメイン**: `lib/llm/sourced-facts/allowlist.ts`（`rugby-japan.jp` は登録済み）

エッジケース:
- **fact の生成に LLM を使わない。** パース結果から決定的に文字列を組み立てる。捏造の余地を無くすためと、追加の LLM コストを出さないため。例: `"日本代表の先発は1 岡部崇人、2 江良颯、…、15 松永拓朗。"`
- **既存の LLM 検索経路は残す。** 決め打ち取得を「足す」だけ。置き換えない
- **同じ試合で2回実行しても決め打ち分が重複しないこと。** 再実行は日常的に起きる。`force` の挙動と矛盾させない
- **未発表・ページ不在・パース失敗のいずれでも `fetch-sourced-facts` 全体を失敗させない。** 警告ログを出して続行し、既存の検索結果は保存する
- **`www` を付ける。** `rugby-japan.jp` 直は証明書エラー
- **PR #690 で入れた `ingest-lineups` の日本代表分岐を撤去し、Wikipedia 経路に戻す。** ただし `lib/scrapers/jrfu-lineups.ts` の URL 解決とパースは残す（本 spec で使う）

やらないこと:
- `players` / `match_lineups` への書き込み（**Owner が明示的に除外**）
- Wikipedia 経由の既存取り込みの変更
- プレビュー／レビューのプロンプト変更
- 日本代表以外の試合
- 既存の LLM 検索経路そのものの変更
- `docs/decisions.md` / `specs/*.md` / `CLAUDE.md` / `AGENTS.md` の変更

完了の定義:
- spec の受け入れ条件1〜10をすべて満たす
- テストを追加する。最低限、次の6ケース。**フィクスチャは PR #690 で追加済みの実ページ HTML を使う**（`tests/fixtures/jrfu-match-30035-lineups.html`）
  1. 決め打ち取得の fact が `source_domain='rugby-japan.jp'` / `confidence='high'` で保存される
  2. fact に両チームの先発15名・リザーブ8名の氏名と背番号が含まれる
  3. **2回実行しても決め打ち分が重複しない**
  4. パース失敗時に全体が失敗せず、既存の検索結果が保存される
  5. **日本代表以外の試合では決め打ち取得が走らない**
  6. **`players` / `match_lineups` への書き込みが発生しない**
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **PR #690 で入れた `match_lineups` 経路を撤去したことを明示する**
- **保存される fact の実際の文面をそのまま貼る**（両チーム分）
- spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する（「CI green」だけの報告は不可）
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
