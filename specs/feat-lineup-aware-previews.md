# プレビュー/レビューで lineup の実名を活かす（リッチ化）

> 作成: 2026-06-05 / 起票: Track B 調査 → Track A 受け渡し
> 関連: `specs/fix-league-one-playoff-lineups.md`（取込側＝完了）／`specs/fix-content-fabrication.md`（捏造対策＝**壊さない**）／`specs/fix-prompt-player-name-examples.md`（実名例示の削除＝**逆戻りさせない**）

## 背景

PR #369 で lineup 取込が解決し、3決の `match_lineups` は **名前・ポジション・先発/リザーブ（先発30・リザーブ16）まで完備**。`assemble.ts` の `loadProjectedLineup`（`:310-334`）がこれを `projected_lineups` に載せ、`generate-preview.ts:112` が **`JSON.stringify(assembled)` でプロンプトに丸ごと投入**している。つまり**生成モデルは選手名を持っている**。

にもかかわらず、2026-06-05 に3決プレビューを再生成した結果、**本文に選手名がゼロ**（流大・中村亮土も含め一人も登場せず）。QA も「具体的な選手名が不足」とフラグ。

### 確定根因（コード＋実測）
- プロンプトの選手名に関する指示は **否定制約のみ**（`generate-preview.ts:107` / `generate-recap.ts:228`）:
  「projected_lineups にある名前**だけ**使え／無ければ言及するな／創作禁止」。
- **「実在のキープレイヤーを実名で取り上げよ」「マッチアップを名前で作れ」という肯定的指示が無い**。
- `hasLineups` 時の構成指示（`generate-preview.ts:26`）も「キープレイヤー節を入れろ」と明示しておらず、節省略の明示は sparse 側だけ。
- 経緯: 捏造対策（`fix-content-fabrication.md`）と実名例示の削除（`fix-prompt-player-name-examples.md`）で、プロンプトが「名前を使わない」方向に**過剰補正**された。
- 結果、コア問い（数値対決型）に引っ張られ、**名前が手元にあってもモデルは統計の一般論を書く**。

## スコープ

対象:
- `lib/llm/prompts/generate-preview.ts`（`hasLineups` 分岐の構成指示・選手名指示）
- `lib/llm/prompts/generate-recap.ts`（同様）
- 必要なら `lib/llm/stages/generate-narrative.ts`・`lib/llm/prompts/shared-prompt-blocks.ts`

対象外:
- 取込側（解決済）。`assemble.ts` のデータ供給は変更不要（既に名前・is_starter を渡している）。
- カタカナ変換ルール・捏造対策の否定制約は**維持**（弱めない）。

## データモデル変更
なし（`projected_lineups` に name/position/jersey_number/is_starter が既にある）。

## LLM 連携（中核）

`hasLineups === true` のとき、**肯定的に実名を使わせる**指示を追加する。設計の勘所：

1. **キープレイヤー/マッチアップ節を必須化**（hasLineups 時）。
   - キーポジション（9/10/バックスリー＝11,14,15、主将、フッカー2番 等）の**先発実名**を挙げ、対面のマッチアップを最低1つ実名で描く。
   - 先発/リザーブ（is_starter）を使い「先発」「ベンチから」を区別。
2. **実名を最低 N 名（例: 各チーム3名以上）本文に登場**させる。ただし **projected_lineups / match_events に存在する名前のみ**（捏造禁止の否定制約はそのまま）。
3. **playoff/3決の文脈で注目選手を拾う**（例: ベンチ入りのベテラン）。引退等の編集情報は lineup に無いので**断定させない**（名前を挙げる所までが安全。「引退」等は別ソース確定時のみ）。
4. lineup が空のときは現行どおり（名前に触れない・データスパースモード）。

> スレッドを通す要点: 「**実在データの名前は積極利用／存在しない名前は一切創作しない**」。捏造対策は名前の“創作”を禁じるもので、“実在名の利用”まで禁じる意図ではなかった——この区別をプロンプトに明記する。

## UI サーフェス
変更なし。再生成で本文が実名化される。

## 受け入れ条件（Codex が検証可能）

1. 3決 `96863688-cf14-40f8-b3d7-8d485ae5504b` のプレビューを再生成すると、**本文に projected_lineups 由来の実名が各チーム3名以上**登場する（例: 流大・中村亮土を含むサントリーの選手、ワイルドナイツの主将/主力）。
2. **実名マッチアップが最低1つ**（対面ポジションの実名対比）。
3. 登場する選手名は **すべて projected_lineups か match_events に存在**（DB 照合で外部名ゼロ＝捏造なし）。
4. QA の「具体的な選手名が不足」issue が解消（or 大幅減）。本文字数が目標下限以上。
5. **lineup が空の試合は現行どおり**（名前に言及せず・エラーなし）。回帰なし。
6. 既存の他大会プレビュー/レビューでも、lineup がある試合は実名が増える（汎用プロンプト改善のため）。
7. `fix-content-fabrication.md` の捏造ガード（存在しない名前/統計の創作禁止）を弱めない。プロンプトに現役選手名の**ハードコード例示を再導入しない**（`fix-prompt-player-name-examples.md` 順守）。

## 検証手順
1. 3決プレビュー再生成（workflow `cron-ingest-league-one-lineups` を `match_ids=96863688… ingest=false content_type=preview`）。
2. `match_content.content_md` を取得し、(a) 実名が3名以上、(b) 各名前が `match_lineups`/`players` に存在、(c) 外部名ゼロ を SQL/目視で確認。
3. lineup 空の試合（例: 未発表の決勝）で名前に触れず正常終了することを確認。

## 未解決の質問（着手前に Owner 判断）
1. 実名の**最低人数**（各チーム3名で良いか）。多すぎると羅列・列挙感、少なすぎると薄い。
2. **マッチアップの選び方**を固定ルール化するか（9/10/back three 優先など）モデル裁量にするか。
3. 「引退・移籍」等の人間ドラマは lineup に無い。**当面は実名を挙げるまで**に留め、ドラマ付与は将来の選手文脈データレイヤー（別 spec）に委ねる方針でよいか。
