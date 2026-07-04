# プレビュー生成: ラインアップ不在時の選手名捏造をコードレベルでブロック

## 背景

2026-07-04、日本 vs イタリア（Nations Championship 2026 第1節、`match_id = f56e9ee9-14be-49e3-b47d-c51a29c07593`）のプレビューを検品した際、実在しない選手名3名（例: 「山澤拓也（フライハーフ）」「中野将伍（センター）」「藤原信（スクラムハーフ）」）が「キープレイヤーとマッチアップ」セクションに掲載されていることを確認した。JRFU 公式の試合登録メンバー23名（先発15名＋リザーブ8名）のいずれにも該当しない架空の人物名だった。

**本番データで確認した根本原因**: この試合の `match_lineups` は0件（空）。`lib/llm/prompts/generate-preview.ts` にはラインアップが空の場合の禁止指示が**既に存在する**:

```
223行目: "選手名は入力データ（projected_lineups・match_events・sourced_facts）に含まれるものだけを
使用すること。データに存在しない選手名を推測・創作してはならない。ラインアップが空の場合は
選手名に言及せず、チームの戦術・スコア・展開の描写に集中すること。"
```

さらに `isDataSparse` 時の構成指示（108-114行目）も「キープレイヤーセクションは省略すること（ラインアップデータなし）」と明記している。**それでも LLM はこの指示を無視し、キープレイヤーセクションを生成し、架空の選手名を記載した。**

つまりこれは prompt テキストによる指示だけでは防げないケースであり、`fix-sourced-facts-zero-fabrication`（#404, D010系）と同様に **コードレベルの決定的ガードが必要**。既存の `lib/content/fabrication-guard.ts` の `containsUnsupportedStatistic` は統計値（%・ポゼッション等のキーワード）のみを検出対象にしており、選手名は最初から検出範囲外。

**このバグはこの試合固有ではない**: ラインアップ・試合イベントの両方が薄い試合全般（新設大会の初戦、下部大会、イベント取り込みが間に合っていない試合等）で同様の捏造が起こりうる構造的ギャップ。

## スコープ

対象:
- `lib/content/fabrication-guard.ts`: `containsUnsupportedStatistic` と並ぶ新しい決定的ガード関数を追加（例: `containsUngroundedPlayerReference`）
- `lib/llm/stages/qa.ts`: `applyDeterministicQaGuards` に新ガードを組み込む（`hasEvents` と同様のパターンで `hasLineups` 相当のフラグ、または groundedな選手名リストを受け渡す）
- `lib/llm/stages/generate-narrative.ts` 等、QAステージ呼び出し元で `hasLineups` / 許容選手名リストを渡す配線
- 対応するテスト（`tests/llm/stages/qa.test.ts`、`tests/content/fabrication-guard.test.ts` 等、既存テストファイルの慣例に合わせる）

対象外:
- 汎用的な日本語人名 NER（固有名詞抽出）の実装（過検知リスクが高い。今回は「ラインアップ・イベント双方が空のときにキープレイヤー的セクション/人名パターンが出力されたら reject」という限定的・決定的な条件に絞る）
- 統計値ガード（`containsUnsupportedStatistic`）自体の拡張（別スコープ）
- 既存の published content（この試合含む）の再生成・unpublish（別途 Owner 判断。下記「今回発覚した個別対応」参照）
- `sourced_facts` ロジック自体の変更

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

- 変更は生成後の決定的（deterministic）QA ガードのみで、生成プロンプト自体は変更しない想定。ただし実装上どうしても prompt 側の調整が必要と Codex が判断した場合は `PROMPT_VERSION` をバンプすること
- コスト影響: 追加の LLM 呼び出しはなし（既存の QA レスポンスに対する後処理チェックのみ）。ただし reject → retry が増える試合では生成コストが増える可能性がある

## 実装方針（提案。詳細実装は Codex 判断）

`fabrication-guard.ts` に以下のような決定的ガードを追加する:

```typescript
// 例: ラインアップが空の場合に「キープレイヤー」的な見出し＋人名パターンが
// 出力されていないかを検出する。既存の containsUnsupportedStatistic と同じ
// 「決定的コードチェック」パターンに揃える。
export const UNGROUNDED_PLAYER_REFERENCE_ISSUE =
  "ラインアップ不在にもかかわらず選手個別言及を含む";

const KEY_PLAYER_SECTION_PATTERN =
  /キープレイヤー|注目選手|注目のマッチアップ|スタメン|先発.*(フライハーフ|センター|スクラムハーフ|プロップ|フッカー|ロック|フランカー|ナンバー8|ウイング|フルバック)/;

export function containsUngroundedPlayerReference(
  text: string,
  hasLineups: boolean,
  hasEvents: boolean,
): boolean {
  if (hasLineups || hasEvents) {
    return false; // 実データがあれば選手名言及は許容（既存仕様通り）
  }

  return KEY_PLAYER_SECTION_PATTERN.test(text);
}
```

`qa.ts` の `applyDeterministicQaGuards` に `containsUnsupportedStatistic` と同じ扱いで組み込み、検出時は `factual_grounding` を1に落とし `issues` に追加、`isFactualGroundingHardBlock` 経由で retry/reject に流す（既存の統計値ガードと同一の下流ロジックをそのまま再利用できる設計にすること）。

正確な正規表現・閾値は Codex が既存テストパターン（`fabrication-guard.test.ts` 等）を見て精度調整すること。誤検知（正当な戦術描写がブロックされる）を避けつつ、今回のような「キープレイヤーセクション＋架空人名」の再発を防ぐことが目的。

## 受け入れ条件

1. `hasLineups = false, hasEvents = false` の入力に対し、「キープレイヤー」等の見出しを含む生成テキストで新ガードが発火し `factual_grounding` が1に低下、`retry`（2回目以降は `reject`）判定になることを単体テストで確認
2. `hasLineups = true` または `hasEvents = true` の場合は同じテキストパターンでもガードが発火しない（誤検知しない）ことを単体テストで確認
3. 今回の実際の捏造テキスト（本 spec 記載の3選手名を含む文面の再現データ）に対してガードが発火することを回帰テストとして追加する
4. `pnpm test` 全体が通る
5. TypeScript strict エラーなし

## 今回発覚した個別対応（spec範囲外・Owner判断事項）

- 現在 published 状態にある該当試合（`f56e9ee9-14be-49e3-b47d-c51a29c07593`）のプレビューは、本ガード実装前に手動で unpublish するか再生成するかを Owner が判断すること（本 spec のスコープ外。対応する場合は `content-regen` 運用に従い試し焼き必須）
- イタリア側の選手名（レオナルド・マリン等）も同様に未照合。捏造の可能性が高いため同様に扱うこと

## 未解決の質問

- 正規表現ベースの検出で十分な精度が出るか、実装・テスト時に Codex が判断すること。精度が出ない場合は代替アプローチ（例: 生成前にセクション構成をJSON形式で強制し、`hasLineups=false` のときは "keyPlayerSection" フィールド自体を出力させない構造化出力への切り替え）を Owner に提案すること
