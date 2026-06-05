# Codex プロンプト: プレビュー/レビューで lineup の実名を活かす

> 仕様: `specs/feat-lineup-aware-previews.md`（権威。根因・受け入れ条件はそちら）
> 本ファイルは Owner が Codex に渡す作業指示。spec の内容は繰り返さない。
> 経緯（重複しない既存）: `fix-content-fabrication.md`（捏造抑制＝壊さない）／`fix-prompt-player-name-examples.md`（実名例示削除＝戻さない）／`docs/codex-prompts/improve-content-prompts.md`（字数・QA＝別論点）。

---

## タスク

lineup データ（`projected_lineups`）が**揃っていてプロンプトにも渡っているのに、本文に選手名が出ない**。`specs/feat-lineup-aware-previews.md` に基づき、**hasLineups 時に実在の選手名を本文へ積極的に登場させる**ようプロンプトを修正する。捏造ガードは弱めない。

## 確認すべき現状（根因の現物）

- `lib/llm/prompts/generate-preview.ts`
  - `:21-23` `hasLineups` 判定、`:26` hasLineups 時の構成指示（キープレイヤー節を明示していない）。
  - `:107` 選手名は**否定制約のみ**（存在する名前だけ・無ければ触れるな・創作禁止）。
  - `:112` `JSON.stringify(assembled)` で `projected_lineups`（name/position/jersey_number/is_starter）がプロンプトに入っている＝**データはある**。
- `lib/llm/prompts/generate-recap.ts:228` も同じ否定制約。
- 供給側 `lib/llm/stages/assemble.ts:310-334` `loadProjectedLineup` は名前・position・is_starter を載せている＝**変更不要**。

## 直すこと（要点）

1. **hasLineups === true のとき、肯定指示を追加**：
   - 「キープレイヤー/注目マッチアップ」を**必須セクション**にする（`:26` の hasLineups 構成指示にキープレイヤー節を明記）。
   - キーポジション（9/10/11・14・15/主将/2番）の**先発実名**を挙げ、対面マッチアップを最低1つ実名で描く。
   - `is_starter` を使い「先発」「ベンチから」を区別。
2. **各チーム最低3名の実名を本文に登場**させる。ただし **projected_lineups / match_events に存在する名前のみ**（`:107` の否定制約は残す＝創作禁止）。
3. **generate-recap.ts も同様に対応**（finished の lineup・match_events の実名を活用）。
4. lineup が空のときは現行どおり（名前に触れない・dataSparseBlock）。回帰させない。
5. プロンプトに**現役選手名のハードコード例示を入れない**（`fix-prompt-player-name-examples.md` 順守）。汎用ルールで書く。

> スレッドを通す一文をプロンプトに足すイメージ:「入力データ（projected_lineups・match_events）に**存在する**選手名は積極的に本文へ登場させ、特にキーポジションの対面を実名で描くこと。ただし入力に**存在しない**名前は一切創作しないこと。」

## 入力 → 期待出力（3決 96863688 で検証）

- 入力: `projected_lineups.home`（東京サントリー・先発15＋リザーブ8、流大#21/中村亮土#22 はリザーブ）、`away`（埼玉ワイルドナイツ・先発15＋リザーブ8）。
- 期待: プレビュー本文に**両チーム計6名以上の実名**＋**実名マッチアップ1つ以上**。流大・中村亮土は「ベンチ」として触れられ得る。**外部名（入力に無い名前）はゼロ**。

## エッジケース

- 外国人選手のカタカナ＋中点（既存 `nameStyleInstruction` 準拠。league-one は日本語表記）。
- is_starter が混在（先発/リザーブ）を取り違えない。
- match_events 由来の名前（得点者など）も実在名として利用可。
- lineup 空（決勝が未発表など）→ 名前ゼロで正常（現行維持）。

## 完了の定義（Done）

- [ ] spec「受け入れ条件」1〜7 を満たす。
- [ ] 変更: `generate-preview.ts` / `generate-recap.ts`（必要なら `shared-prompt-blocks.ts`）。`PROMPT_VERSION` を上げる。
- [ ] テスト: hasLineups 時にキープレイヤー指示が含まれること、lineup 空時に名前指示が出ないこと（プロンプト文字列の単体テスト）。
- [ ] `npm run typecheck`/`lint`/既存テスト green。
- [ ] 捏造ガード（存在しない名前の禁止）と例示ハードコード禁止を維持していることを PR 説明に明記。

## 検証コマンド（Codex が PR に記載・Owner が実行）

```
# マージ＆デプロイ後、3決プレビューだけ再生成（lineupは取込済）
gh workflow run cron-ingest-league-one-lineups.yml \
  -f match_ids=96863688-cf14-40f8-b3d7-8d485ae5504b -f ingest=false -f content_type=preview
# 確認: match_content.content_md に実名3+/チーム、外部名ゼロ（match_lineups/players と照合）
```

## 注意（CLAUDE.md 準拠）
- 本番再生成は Owner 承認後に Owner 実行。Codex は production キーで自動実行しない。
- 未キャッシュ LLM 呼び出しのコストに留意（1試合 数十円）。
