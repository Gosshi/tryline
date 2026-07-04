# プレビュー生成: 未確定ラインアップの選手名が生データダンプ経由で漏れる問題を修正

## 背景

`specs/fix-projected-lineup-fallback-fabrication.md`（PR #465、マージ済み）で `hasLineups` を「確定lineupか、`players` キャップ数順フォールバックか」で正しく区別するようにした。この修正後に該当試合（日本 vs イタリア、`match_id = f56e9ee9-14be-49e3-b47d-c51a29c07593`）のプレビューを再生成・検品したところ、「キープレイヤーとマッチアップ」セクション自体は正しく省略されるようになったが、**本文の別セクションに1件、未確定の選手名が残った**:

> 「イタリアのスクラムハーフ、アレッサンドロ・ガルビジがどのように試合を組み立てるかにも注目です。」

「アレッサンドロ・ガルビジ」はイタリアの `players` フォールバックリスト（`confirmed: false`）に含まれる実在選手だが、今日の登録メンバーとして確定していない。

**根本原因**: `lib/llm/prompts/generate-preview.ts` 230行目付近、`` `試合データ: ${JSON.stringify(assembled)}` `` が `assembled` オブジェクト**全体**をそのままプロンプトに埋め込んでいる。この中には `projected_lineups.home`/`away`（未確定のフォールバック選手リストを含む）がそのまま入っている。

`lineupUsageBlock`（158-167行目、`hasLineups` が true のときのみ含まれる指示文）は「選手名を積極的に使え」という**指示文のみ**で、実際の選手データは含んでいない。実際の選手名データはこの生JSONダンプからしかモデルに渡らない。そのため PR #465 で `hasLineups=false`（構成分岐・`lineupUsageBlock` 省略）にしても、**未確定の選手リスト自体は依然としてプロンプトに丸ごと見えている**。既存の禁止指示（222-223行目「選手名は入力データに含まれるものだけを使用すること...ラインアップが空の場合は選手名に言及しない」）はテキストによる指示のみであり、今回もモデルはこれを無視した。

**教訓**: 本日この会話で3回連続、「データ自体はモデルに見えているが、テキスト指示だけで使わせないようにする」という設計が破られた（#464のキープレイヤーセクション、#465直後の本件）。テキスト指示ではなく、**未確定データをプロンプトから物理的に除去/マスクする**ことが必要。

## スコープ

対象:
- `lib/llm/prompts/generate-preview.ts`: 230行目付近の `JSON.stringify(assembled)` に渡す前に、`projected_lineups.home`/`away` のうち `confirmed` が `false` のサイドを空配列（または選手名を含まない形）に置き換えるサニタイズ処理を追加する
- 同様のロジックが `lib/llm/prompts/generate-recap.ts` にもあれば同じ対応をする（recap 側でも同じ `assembled` 全体ダンプパターンが使われているか確認し、あれば同様に修正すること）
- 対応するテスト（`tests/llm/prompts/generate-preview.test.ts` 等）

対象外:
- `lineupUsageBlock` 自体のロジック変更（`hasLineups` に基づく分岐は PR #465 で正しく動作している）
- `assembled` オブジェクトの他のフィールド（`sourced_facts`・`recent_form`・`key_stats` 等）のサニタイズ（今回の漏れと無関係）
- 該当試合のプレビュー再生成の実行（本 spec 実装後、Owner の承認を得て別途実行する）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

- `generate-preview.ts`: `PROMPT_VERSION` をバンプすること（例: `preview@3.8.0`）
- `generate-recap.ts` も変更する場合は同様に `PROMPT_VERSION` をバンプすること
- コスト影響: なし（プロンプトのトークン数はむしろ微減する）

## 実装方針（提案。詳細実装は Codex 判断）

`JSON.stringify(assembled)` に渡す直前に、home/away それぞれ `confirmed` が false の場合は `projected_lineups` の該当サイドを空配列に置き換えたコピーを作る（イミュータブルに、`assembled` 自体は書き換えない）。例:

```typescript
const sanitizedAssembled = {
  ...assembled,
  projected_lineups: {
    ...assembled.projected_lineups,
    home: assembled.projected_lineups.confirmed?.home
      ? assembled.projected_lineups.home
      : [],
    away: assembled.projected_lineups.confirmed?.away
      ? assembled.projected_lineups.away
      : [],
  },
};
// ...
`試合データ: ${JSON.stringify(sanitizedAssembled)}`,
```

確定lineupがある側の選手名はダンプに残るため、`hasLineups=true` の通常ケース（`lineupUsageBlock` が実名を使えと指示するケース）は今まで通り機能する。未確定側だけが空になり、モデルの目に入らなくなる。

## 受け入れ条件

1. 本 spec 記載の実際の失敗ケース（away側が `confirmed: false` でフォールバック選手リストを持つ）を再現するテストで、生成されるプロンプト文字列に「アレッサンドロ・ガルビジ」「Alessandro Garbisi」等、未確定側の選手名が一切含まれないことを確認する
2. `confirmed: true` の通常ケースでは、従来通りプロンプトに実名が含まれることを確認する（既存テストが壊れないこと）
3. `pnpm test` 全体が通る
4. TypeScript strict エラーなし

## 今回発覚した個別対応（spec範囲外・Owner判断事項）

- 本 spec の実装・マージ後、該当試合（日本vsイタリア、`f56e9ee9-14be-49e3-b47d-c51a29c07593`）のプレビューを再度試し焼き→検品してから published にするか Owner が判断すること。現在は draft 化済み

## 未解決の質問

- `generate-recap.ts` が同じ `JSON.stringify(assembled)` 全体ダンプパターンを使っているか未確認。Codex が実装時に確認し、使っていれば同様に対応すること
