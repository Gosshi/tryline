# 公開済みコンテンツのエンティティグラウンディング監査（フェーズ2）

> 前提: `specs/feat-entity-grounding-gate.md`（PR #467、マージ・本番反映済み）で導入したエンティティ照合ゲート（`verifyNarrativeEntities`・`buildAllowedPersonEntities`）を再利用する
> 設計文書: `docs/design-content-grounding-architecture-2026-07-04.md` §5「フェーズ2」

## 背景

2026-07-04、Nations Championship 2026 開幕日インシデントを受けて、生成後のエンティティ照合ゲート（フェーズ1）を実装・本番投入した。この照合は**今後生成される**コンテンツにのみ適用され、既存の公開済みコンテンツは無検証のまま残っている。

本番確認済み（2026-07-04）: `match_content` の `published` 件数は **preview 71件・recap 828件、合計899件**。同一の生成コード・同一のプロンプトが全大会・全期間で稼働してきたため、確定ラインアップ・イベントデータが薄い試合（新設大会の初戦、下部大会、イベント取り込みが間に合っていない試合等）で同種の人名捏造が既に公開されている事前確率は高い。

監査コストはフェーズ1のゲートを再利用して1記事$0.001未満、899件でも**1ドル未満**。放置コストは「間違いを書かないこと」を差別化価値とするプロダクトにとって非対称に大きい（設計文書§5、`project_ai_labeling` メモ「敵はAIでなく間違い」とも整合）。

**重要な制約（設計文書§5より）**: これは**現在のデータ**での監査であり、生成時点の再現ではない。生成時点では確定ラインアップが無く捏造だった記事が、現在は確定ラインアップが投入されて許可リストに載っている、というケース（見逃し方向）が起こり得る。これは許容する。逆に「今も薄いデータのまま」の試合は確実に捕捉できる。

## スコープ

対象:
- `tools/audit-entity-grounding.ts`（新規）: 公開済み `match_content`（preview・recap 両方）を対象に、現在のデータで `buildAllowedPersonEntities` ＋ `verifyNarrativeEntities` を実行し、未グラウンディングの人名言及があれば報告する**読み取り専用**スクリプト
- 出力レポート（ファイル書き出し。`tools/gsc-pull.ts` が `tmp/gsc/` に書き出す慣例に合わせ、`tmp/entity-audit/` 等に JSON または Markdown で出力）

対象外:
- 監査で見つかった違反記事の自動 unpublish・自動再生成（本specでは実行しない。レポートを見て Owner が個別に `content-regen` 運用で対応する）
- 生成時点のデータを復元しての監査（対象外と明記。現在データでの監査のみ）
- `match_content` 以外のコンテンツ（存在しない）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

- 既存の `verifyNarrativeEntities`（`lib/llm/stages/verify-entities.ts`）をそのまま呼び出す。新しいプロンプト・モデルは追加しない
- 許可済みエンティティ集合の構築は、既存の `assembleMatchContentInput(matchId, ...)` を呼び出して得た `AssembledContentInput` から `buildAllowedPersonEntities` で構築する（`assembleMatchContentInput` は他の用途向けフィールドも計算するが、監査目的では無視してよい。新しい軽量版クエリを書く必要はない）
- コスト: 899件 × $0.001未満 ＝ **1ドル未満**。実行前に件数×単価の見積もりを表示し、`--confirm-owner-approved` 相当のフラグなしでは実行しない（既存の `regenerate-overseas-content.ts` の dry-run 規約に倣う）
- 同時実行数を制御すること（899件を無制限 `Promise.all` で投げるとレート制限に当たる可能性がある。5〜10件程度の同時実行数に制限する簡易な並行実行制御を入れること）

## 実装方針（提案）

1. `match_content` から `status = 'published'` の全行（`id, match_id, content_type, content_md`）を取得
2. 各行について `assembleMatchContentInput(match_id, contentType, language)` を呼び出し、`buildAllowedPersonEntities(assembled)` で許可リストを構築
3. `verifyNarrativeEntities({ narrative: content_md, allowedEntities, sourcedFacts: assembled.sourced_facts })` を実行
4. `ungroundedSurfaces` が非空の行を「違反」としてレポートに集計（`match_id`・`content_type`・違反サーフェス一覧・記事URL）
5. レポートをファイルに書き出す（コンソールにも要約件数を出力: 総件数・違反件数・違反率）
6. 個別の照合呼び出しが失敗した場合はスキップして「調査不能」として別途記録する（監査自体を止めない。ただし本番のコンテンツ生成パイプラインとは異なり、この監査ステージ自体は「fail-closed」の対象ではない＝失敗した行はunpublishせず、単に「要再調査」としてレポートするだけ）

## 受け入れ条件

1. dry-run（デフォルト）実行時、対象件数・想定コストを表示し、実際の照合は実行しない
2. `--confirm-owner-approved` 相当のフラグ指定時のみ実際に899件（または `--limit` で絞った件数）を照合する
3. 違反が見つかった記事の一覧（match_id・content_type・違反サーフェス）がファイルに出力される
4. スクリプト実行が `match_content` テーブルに一切書き込みを行わないこと（読み取り専用であることをテストまたはコードレビューで確認できる形にする）
5. `--content-type preview` / `--content-type recap` でフィルタできること（既存 `regenerate-overseas-content.ts` の引数規約に合わせる）
6. `--limit N` で対象件数を絞れること（動作確認・試し実行用）
7. `pnpm test` 全体が通る（新規ロジックに対する単体テストを含む）
8. TypeScript strict エラーなし

## 未解決の質問

- レポートの出力形式（JSON / Markdown / CSV）はどれが最も Owner がレビューしやすいか。Codex の判断でよいが、`match_id` から記事URL（`https://www.trylinerugby.com/matches/{match_id}`）を組み立てて含めること
- 同時実行数の具体的な値（5〜10件程度と記載したが、既存コードに並行実行数を制御する共通ユーティリティがあれば流用し、無ければシンプルな実装でよい）
