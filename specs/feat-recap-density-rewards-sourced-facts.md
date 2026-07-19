# recap の information_density 評価を「字数」から「入力事実の活用度」に寄せる

## 背景

Owner から「ニュースサイト等の情報ソースが増えても recap の文字数・深みが増えない」との指摘(2026-07-19)。

**確認済みの事実**(コード確認済み):
- `lib/llm/content-length.ts`(18-27行目)によれば、recap の日本語文字数下限は**意図的に1200字に設定されている**(2026-06-12 Owner決定、コメント引用: 「pressuring the model toward a higher floor invites padding and fabrication. A dense short recap beats an inflated long one」)。プロンプト自体は2,000字以上を「目標」として指示しているが、下限は1200字に抑えられている
- `lib/llm/prompts/qa-content.ts` の `information_density` 採点ルーブリック(130-135行目)は**文字数の閾値のみ**で採点している(5=下限以上+具体性、4=下限以上、3=下限の75%以上、2=下限の50%未満...)。**利用可能な sourced_facts・team_stats・match_events をどれだけ本文に反映したかは一切評価基準に入っていない**
- `lib/llm/prompts/generate-recap.ts`(140行目)の sourced_facts 利用指示は「本文の根拠として**使ってよい**」という許可形の表現に留まり、「できるだけ多く反映する」という積極的な指示になっていない
- 実例: 日本×フランス戦で、sourced_facts を2件→手動追加後も、published recap は1269字(下限1200字のわずか5.75%増)に留まった
- 既存の `fix-qa-gate-density.md`(実装済み、`DENSITY_PUBLISH_MIN=4`)は「publishする閾値」を扱ったのみで、「density スコアの採点基準自体」の変更は明示的にスコープ外としていた。本specはその対象外部分を扱う

## スコープ

対象:
1. `generate-recap.ts` の sourced_facts 利用指示を、「使ってよい」から「入力された sourced_facts のうち、本文の趣旨に沿うものはできるだけ多く反映すること。ただし個々の事実を無理にこじつけて記述しないこと」といった、より積極的な指示に変更する(捏造防止の既存制約は維持したまま、利用促進のトーンを強める)
2. `qa-content.ts` の `information_density` ルーブリックに、字数閾値に加えて「入力された sourced_facts / team_stats のうち本文に反映された件数の割合」を評価軸として追加する。目安:
   - 5: 下限字数以上 **かつ** 利用可能な sourced_facts の大半(目安7割以上)が本文に反映されている
   - 4: 下限字数以上だが sourced_facts の反映が一部に留まる
   - 3以下: 現行のまま(字数不足・水増しの基準は維持)
3. QAプロンプトに、`assembled.sourced_facts` の件数を明示的に渡し(既存の `sourcedFactsBlock` で既に本文には渡っているので、件数のカウント自体は追加不要。ルーブリックの文言変更のみで対応可能な可能性が高い。Codex判断で必要なら件数を別途渡す)

対象外:
- 字数下限(1200字)自体の引き上げ。2026-06-12 の事故を踏まえた決定であり、本specでは変更しない
- `DENSITY_PUBLISH_MIN` の値の変更(`fix-qa-gate-density.md` の管轄)
- English(en)コンテンツのルーブリック変更。日本語recapのみ対象
- preview のルーブリック変更。まずrecapのみで様子を見る

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

`generate-recap.ts`(ナラティブ生成)と `qa-content.ts`(QA)双方のプロンプト文言変更のみ。**追加のLLM呼び出しは発生しない**(既存の生成・QA呼び出し回数は変わらない)。

## 受け入れ条件

1. `qa-content.ts` の `information_density` ルーブリックに、sourced_facts反映度を評価する記述が追加されていることを確認するテスト(プロンプト文字列のアサーション)がある
2. `generate-recap.ts` の sourced_facts 指示ブロックが「使ってよい」から積極的な反映を促す文言に変わっていることを確認するテストがある
3. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` が通る
4. **Owner承認の上での試し焼き**(3〜6件、`content-regen` スキルの手順に従う): sourced_facts が3件以上ある試合を対象に再生成し、文字数・sourced_facts反映件数が変更前より増えていることを目視確認する。全件展開は試し焼きの結果を見てから別途判断する

## 未解決の質問

- ルーブリック変更後、既存の1200字ちょうど付近で安定していたrecapが軒並みretry/rejectに回り、生成コストが増える可能性がある。試し焼きの結果次第で、字数下限や `DENSITY_PUBLISH_MIN` との兼ね合いを再調整する必要が出るかもしれない
