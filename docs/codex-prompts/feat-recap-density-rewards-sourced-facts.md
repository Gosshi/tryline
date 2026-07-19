`/specs/feat-recap-density-rewards-sourced-facts.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- recapの`information_density`評価が文字数閾値のみで決まっており(`lib/llm/prompts/qa-content.ts` 130-135行目)、利用可能な`sourced_facts`をどれだけ本文に反映したかが評価に一切入っていない。そのため、sourced_factsが増えても文字数・深みが増えないという問題が起きている
- `generate-recap.ts`(140行目)のsourced_facts利用指示も「使ってよい」という許可形の弱い表現
- 字数下限(1200字、`lib/llm/content-length.ts`)自体は2026-06-12のOwner決定(過去の捏造・大量draft化事故を踏まえた意図的な下限)であり変更しない。今回は「下限を超えた後の質」の評価軸を変える

やること:
1. `lib/llm/prompts/generate-recap.ts`のsourced_facts利用指示(140行目付近)を、「使ってよい」から「本文の趣旨に沿うものはできるだけ多く反映すること。ただし個々の事実を無理にこじつけて記述しないこと」のような積極的な指示に変更する。捏造防止の既存制約(sourced_factsに無い事実を創作しない等)はそのまま維持する
2. `lib/llm/prompts/qa-content.ts`の`information_density`ルーブリック(130-135行目)に、字数閾値に加えて sourced_facts の反映度を評価軸として追加する。具体的な文言・実装方法(件数を明示的にプロンプトへ渡す必要があるか等)はCodex判断でよいが、「5点は下限字数以上かつsourced_factsの大半を反映」という水準感は仕様書の記載に沿うこと

処理すべきエッジケース:
- sourced_factsが0件の試合では、この新しい評価軸が不当にスコアを下げないこと(反映すべき事実が無いのだから、従来通り字数のみで評価してよい)
- 既存の「水増し・言い換えでdensityを下げる」ルールは維持する
- English(en)コンテンツ・previewコンテンツには変更を加えない

完了の定義:
- specs の受け入れ条件1〜3を満たす(4はOwner承認の上での試し焼きのためスコープ外。Codexはコード変更とユニットテストまで)
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` clean
- 変更ファイル一覧を報告する(想定: `lib/llm/prompts/generate-recap.ts`、`lib/llm/prompts/qa-content.ts`、関連テスト)

要件:
- 「対象外」(字数下限の変更、`DENSITY_PUBLISH_MIN`の変更、en/previewのルーブリック変更)は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
