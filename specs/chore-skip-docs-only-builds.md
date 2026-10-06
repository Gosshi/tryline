# 文書だけの変更で Vercel のビルドを走らせない

## 背景

2026-10-04 に Vercel を Pro にした（実行時の CPU が Hobby の上限を超えたため。`project_vercel_pro_cpu`）。その後の CPU 削減の spec を書く前に、2026-10-06 に Claude Code が今月の使用量（10/3〜10/5 の 3 日分）を Vercel のダッシュボードで測った。

| 項目 | 使用量 | 金額 |
|---|---|---|
| **ビルドの CPU 時間（Build CPU Minutes）** | **8 時間** | **$1.78（全体の 62%）** |
| 実行時の CPU（Fluid Active CPU） | 1 時間 | $0.21 |
| 実行時のメモリ | 15.67 GB 時 | $0.17 |
| その他（転送・ISR・観測など） | — | 約 $0.7 |
| 合計（Pro に含まれる $20 から引かれる） | — | $2.85 |

- **実行時の CPU は Pro では費用の問題になっていない**（1 日 20 分ほどで、Hobby のころと同じ。$20 の枠の中で月 $2 程度）。選手ページの再生成を減らす対策は、今は急がない。
- 費用の大半はビルド。3 日間で 60 回ビルドした（本番 37・プレビュー 23）。ビルドは 1 回 1〜2 分だが、Pro の既定の Elastic マシン（4 vCPU 以上）で **CPU 分＝分×vCPU 数**で課金される（$0.0035／CPU 分。Vercel の公式文書 `docs/builds/managing-builds`）。1 回あたり約 8 CPU 分。
- **本番の 37 回のうち 16 回は `docs/` と `specs/` の Markdown だけの変更**だった（Claude Code の spec を main に直接 push する運用、`feedback_docs_only_direct_to_main`）。ほかに `docs/notes/` の画像・HTML・動画だけの変更が 5 回。これらはサイトの中身を何も変えないのに、毎回フルビルドしている。
- 3 日間は刷新で PR が多く例外的だが、spec を直接 push する運用は続くので、文書だけの変更のビルドは構造的に起きる。

## スコープ

対象: `docs/` と `specs/` の中だけが変わったコミットでは、Vercel のビルドを止める（本番・プレビューとも）。

対象外: ビルドマシンの種類・同時ビルドの設定（Owner がダッシュボードで決める。下の「未解決の質問」）、選手ページの再生成の削減、CI（GitHub Actions）の起動条件。

## データモデル変更

なし。

## API サーフェス

なし。

## 変更内容

### 1. ビルドを止める判定（`vercel.json` の `ignoreCommand`）

- `vercel.json` に `ignoreCommand` を足し、判定のスクリプト `scripts/vercel-ignore-build.sh` を呼ぶ（判定を 1 行の文字列に詰め込まず、テストできるファイルにする）。
- Vercel の決まり: **終了コード 0 ＝ビルドしない、1 ＝ビルドする**（普通のコマンドと逆。Vercel の公式文書 `docs/project-configuration/project-settings` の Ignored Build Step）。
- 判定:
  - 比べる元: Vercel のシステム環境変数 `VERCEL_GIT_PREVIOUS_SHA`（そのブランチで最後に成功したデプロイの SHA）。**着手前に Vercel の公式文書（System Environment Variables）で、この変数が Ignored Build Step で使えることと中身を確かめ、PR 本文に引用する。**
  - `git diff --quiet "$VERCEL_GIT_PREVIOUS_SHA" HEAD -- . ':(exclude)docs' ':(exclude)specs'` が「差分なし」なら 0（ビルドしない）。
  - **安全側に倒す**: 変数が空・その SHA が手元の履歴に無い（浅い clone）・`git` が失敗した、のどれでも **1（ビルドする）** を返す。止めすぎてサイトが古いままになる方が、ビルドしすぎるより悪い。
  - `HEAD^` と比べない理由: 1 回の push に複数のコミットがあると、最後のコミットだけを見て、前のコミットのコードの変更を見落とす。
- ビルドを止めたときと続けるときに、理由を 1 行ずつ標準出力に出す（ビルドのログで確かめられるように）。例: `skip: only docs/ and specs/ changed since <sha>` / `build: <理由>`。

### 2. ビルドが `docs/` と `specs/` を読んでいないことの確認

- 2026-10-06 に Claude Code が `app` `lib` `components` `next.config.*` で `docs/` と `specs/` の参照を検索し、0 件だった。Codex も同じ検索をして PR 本文に貼る（`public/` は対象外にしない。紹介動画は `public/videos/` にある）。

## LLM 連携

なし。

## 受け入れ条件

1. 判定のスクリプトのテスト（一時的な git リポジトリを作るテスト。vitest で `child_process` から実行してよい）:
   - `docs/a.md` だけ変更 → 0。
   - `specs/b.md` だけ変更 → 0。
   - `docs/notes/x.png` だけ変更 → 0。
   - `app/page.tsx` を変更 → 1。
   - `docs/a.md` と `lib/x.ts` を変更 → 1。
   - 2 つのコミットを 1 回で比べ、1 つ目が `lib/x.ts`・2 つ目が `docs/a.md` → 1（`HEAD^` を使うと 0 になってしまうケース）。
   - `VERCEL_GIT_PREVIOUS_SHA` が空 → 1。
   - `VERCEL_GIT_PREVIOUS_SHA` が存在しない SHA → 1。
2. 「壊して落ちる」確認（コミットしない）: 比べる元を `HEAD^` に替えると 1 の 6 つ目のテストが落ちる。空の変数で 0 を返すようにすると 7 つ目が落ちる。出力を PR 本文に貼る。
3. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate`）。
4. この PR 自体はコードを変えるのでビルドされる。PR 本文に、その Vercel のビルドのログの判定の行（`build: ...`）を貼る。

## 実行範囲（本番操作）

なし。マージ後、Claude Code が次の文書だけのコミットを main に push し、Vercel のデプロイが「Canceled」になり、ログに `skip:` が出ることを確かめる。コードの変更を含む次のマージで、本番がビルドされることも確かめる。

## 未解決の質問（Owner がダッシュボードで決める。コードの変更とは別）

1. **同時ビルドの設定**: 今は「Run all builds immediately」（待たずに全部すぐビルドする）。費用はビルドの分数で決まるので、待たせても安くはならない。**変えない**ことを Claude Code は推奨する。
2. **ビルドマシン**: 今は Elastic（4〜30 vCPU を自動）。CPU 分の単価はマシンによらず同じなので、Basic（2 vCPU）にしてもビルドが遅くなるだけで、費用はほぼ変わらない見込み。**変えない**ことを推奨する。

## 実施記録

- 2026-10-06: PR #923 をマージ（`581da12`）。マージの本番ビルドは成功。この追記のコミット（文書だけ）でビルドが止まるかを確認する。
