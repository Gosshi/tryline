# feat-mobile-onboarding-team-quiz-content: 代表チーム診断オンボーディング(Stage C-2: 実コンテンツ)

対象リポジトリ: **tryline-mobile** のみ。**`feat-mobile-onboarding-team-quiz-engine`(Stage C-1、PR #33 でマージ済み)の後続spec**。Stage C-1 で実装済みの診断エンジン(`src/onboarding/teamQuiz.ts`)・UI(`app/onboarding/quiz.tsx`)にダミーデータの代わりに実際の設問・選択肢・配点・チーム紹介を投入する。

## 背景

Stage C-1 では診断の仕組みのみを実装し、設問文言・配点・推薦理由はダミーだった。本specはその「中身」を確定させる。Owner が実際の5問構成(プレースタイル/立場/雰囲気/観戦体験/価値観の5軸)を設計し、以下をClaude Codeとの壁打ちで決定した:

1. **推薦理由の方式**: チームごとの固定文ではなく、ユーザー自身の回答(Q5「価値観」+ Q1「プレースタイル」の2問)から動的に組み立てる文章にする。チームに関する事実主張をしないため、ラグビー知識の正確性リスクが低い
2. **タイブレーク**: Stage C-1 で実装済みの「固定配列順での決定的タイブレーク」は変更しない
3. **配点数値**: Owner が示した「チームと回答の対応関係」の定性的なマッピング表をもとに、Claude Code が一次案(具体的な点数)を作成し、本spec内に記載した。**2026-07-24 に Owner が下記「実際の設問・選択肢・配点」の内容をレビュー・承認済み**。Codex はそのまま実装してよい

## スコープ

対象:
1. `src/onboarding/teamQuiz.ts` の `QUIZ_QUESTIONS` を、下記「設問・選択肢・配点」の実データに差し替える(現在の `dummy-1`〜`dummy-5` を置き換え)
2. `Question.options[]` に `trait?: string` フィールドを追加する。実データを持つのは `play-style`(Q1)と `value`(Q5)の選択肢のみでよい(他の設問の選択肢は `trait` を省略してよい)
3. `TeamProfile` 型から `recommendationReason` フィールドを削除する。代わりに `teamQuiz.ts` に `composeRecommendationReason(answers, questions?)` 関数を追加し、Q5(`value`)の回答の `trait` を主軸に、Q1(`play-style`)の回答の `trait` を補足として1〜2文に組み立てる(具体的な組み立て方は下記「推薦理由の組み立て」参照)
4. `TEAM_PROFILES` の12チームの `shortDescription`(チーム紹介)を実際の内容に差し替える(下記「チーム紹介」参照。Codexの仮テキストで進めてよく、最終文言はOwnerが別途差し替える)
5. `app/onboarding/quiz.tsx` の結果画面を更新する:
   - 69行目 `{bestMatch.recommendationReason}` → `{composeRecommendationReason(answers)}` に変更(ベストマッチのみ表示、回答ベースの1本の文章)
   - 86行目 `{team.recommendationReason}`(次点候補ごとのループ内)は削除する。次点候補にはチーム名・チーム紹介・ボタン類のみを表示する(推薦理由はベストマッチの上部に1回だけ表示するため)
6. 既存のユニットテスト `__tests__/onboarding-team-quiz.test.tsx` を実データ・新しい型に合わせて全面的に更新する

対象外:
- タイブレークロジック(`rankTeams` の並び替え部分)の変更。Stage C-1 の実装のまま
- 診断UIのレイアウト・スタイル変更(Stage C-1 のまま)
- 12チーム以外への対応拡大
- チーム紹介(shortDescription)の文言最終確定は対象外(下記参照、Codexの仮テキストで進めてよい)

## データモデル変更 / API サーフェス

なし(クライアント側の静的データ・型定義のみ)。

## 実際の設問・選択肢・配点(2026-07-24 Owner承認済み)

チームID(`TeamProfile.id`、Stage C-1 で既に固定済み、変更しない): `rsa`(南アフリカ) `nzl`(ニュージーランド) `ire`(アイルランド) `fra`(フランス) `eng`(イングランド) `sco`(スコットランド) `arg`(アルゼンチン) `aus`(オーストラリア) `fij`(フィジー) `jpn`(日本) `wal`(ウェールズ) `ita`(イタリア)

配点方式: 最も相性が強い=3点、次に相性が強い=2点、補助候補=1点(Owner確定: 全問同じ配点、Q5を重み付けしない)。「まだよく分からない」「強さより相性」の2つの中立選択肢は意図的に0点(スコアなし)とする。

### Q1 (`id: "play-style"`) 試合で一番ワクワクするのは？

| 選択肢 | ラベル | 配点 | trait |
|---|---|---|---|
| a | 激しいぶつかり合いで相手を圧倒する | rsa:3, wal:2, eng:2, arg:1 | 力と力がぶつかり合う迫力を求める |
| b | 素早いパス回しからトライを奪う | nzl:3, aus:2, sco:2, jpn:1, ita:1 | 素早いパス回しから生まれるトライを楽しみたい |
| c | 緻密な戦術で相手を崩す | ire:3, eng:2, jpn:1 | 緻密な戦術で試合が動く瞬間に惹かれる |
| d | 予想外のプレーで流れを変える | fra:3, fij:3, arg:2, ita:1 | 予想外のプレーで流れが変わる瞬間が好き |
| e | まだよく分からない | (なし、0点) | (trait なし) |

### Q2 (`id: "team-status"`) どんな立場のチームを応援したい？

| 選択肢 | ラベル | 配点 |
|---|---|---|
| a | 常に優勝を狙う絶対的な強豪 | rsa:3, nzl:3, ire:2 |
| b | 強豪を追いかける有力な挑戦者 | fra:3, sco:2, jpn:2, ita:1 |
| c | 大会で番狂わせを起こす伏兵 | arg:3, fij:3, jpn:2, ita:1 |
| d | 苦しい時期から復活を目指す名門 | eng:3, aus:3, wal:2 |
| e | 強さよりも自分との相性で選びたい | (なし、0点) |

### Q3 (`id: "atmosphere"`) チームにどんな雰囲気を求める？

| 選択肢 | ラベル | 配点 |
|---|---|---|
| a | 冷静で隙がなく、勝負に徹する | rsa:3, ire:2, eng:2 |
| b | 情熱的で感情を前面に出す | arg:3, wal:2, fra:2, sco:1, ita:1 |
| c | 自由で華やか、見ていて楽しい | nzl:3, fij:3, aus:2 |
| d | 規律とチームワークを大切にする | jpn:3, eng:2, ire:1 |
| e | 泥臭く最後まで諦めない | arg:3, wal:3, fij:1 |

### Q4 (`id: "match-type"`) どんな試合をもっと見たい？

| 選択肢 | ラベル | 配点 |
|---|---|---|
| a | 強豪同士のハイレベルな接戦 | ire:3, rsa:2, nzl:2 |
| b | トライが多く動きの激しい試合 | fra:3, nzl:2, aus:2, sco:1, fij:1 |
| c | 激しい守備とセットプレーの攻防 | rsa:3, eng:2, ire:1 |
| d | 大逆転やジャイアントキリング | arg:3, jpn:2, ita:2 |
| e | 歴史あるライバル同士の対決 | wal:3, eng:2, sco:1 |

### Q5 (`id: "value"`) 応援するチームを決めるうえで一番大切なのは？

| 選択肢 | ラベル | 配点 | trait |
|---|---|---|---|
| a | 勝つ可能性が高いこと | rsa:3, ire:3, nzl:2 | 勝つ可能性の高さを大切にする |
| b | 試合内容が面白いこと | nzl:3, fra:3, fij:2, aus:2, sco:1 | 試合内容の面白さを一番大事にする |
| c | 選手やチームに物語があること | arg:3, wal:2, ita:2, aus:1 | 選手やチームの物語に心を動かされる |
| d | 伝統やライバル関係があること | eng:3, wal:2, sco:1 | 伝統やライバル関係に惹かれる |
| e | 日本代表との対戦や関わりが多いこと | jpn:3, rsa:1, ire:1 | 日本代表との関わりを大切にする |

## チーム紹介(shortDescription、Codex仮テキストで進める)

こちらは配点・trait表と異なりOwner承認の対象外。各チームの一般的な特徴(スタイル・伝統・近年の実績など)を1〜2文で紹介する客観的な内容とし、Stage C-1同様「対象外チームへの逃げ道」文言は変更しない。**Codex は12チーム分のプレースホルダーではない仮テキストを用意してよいが、事実に踏み込む記述(戦績の具体的な数値など)は避け、Owner レビューで差し替え前提であることをPR本文に明記すること**。

## 推薦理由の組み立て(`composeRecommendationReason`)

```ts
function composeRecommendationReason(answers: Record<string, string>, questions = QUIZ_QUESTIONS): string {
  const valueOption = findAnsweredOption(questions, "value", answers);
  const playStyleOption = findAnsweredOption(questions, "play-style", answers);

  if (!valueOption?.trait) {
    return "あなたの好みに合いそうな代表チームです。"; // Q5は常に回答必須のため通常到達しないフォールバック
  }
  if (!playStyleOption?.trait) {
    // Q1で「まだよく分からない」を選んだ場合
    return `あなたは、${valueOption.trait}人です。`;
  }
  return `あなたは、${valueOption.trait}人です。プレーの面では、${playStyleOption.trait}タイプです。`;
}
```

`findAnsweredOption(questions, questionId, answers)` は該当 `questionId` の設問を探し、`answers[questionId]` に一致する選択肢を返すヘルパー(実装詳細はCodexの裁量)。

## UI サーフェス

- `app/onboarding/quiz.tsx` の結果画面レイアウトは変更しない。表示するテキストの出所のみ変更する(上記スコープ5番参照)
- 次点候補(runnersUp)は「チーム名・チーム紹介・チームページボタン・このチームを選ぶボタン」のみになり、推薦理由テキストは表示しない

## 受け入れ条件

1. 実際の5問(`play-style`, `team-status`, `atmosphere`, `match-type`, `value`)が本文言で順に表示され、回答が進むことを確認するテスト
2. 上記配点表どおりにスコアリングされ、特定の回答パターンで期待通りの上位1〜3チームが算出されることを確認するテスト(最低2パターン: 上記スペックの「南アフリカになる回答」「フィジーになる回答」相当の組み合わせ)
3. Stage C-1 で実装済みの固定配列順タイブレークが変更されていないことを確認する回帰テスト
4. `composeRecommendationReason` が Q5+Q1 の `trait` から正しく文章を組み立てることを確認するテスト。Q1で「まだよく分からない」(trait なし)を選んだ場合はQ5のみの1文になることを確認するテスト
5. 結果画面のベストマッチには推薦理由(`composeRecommendationReason`の出力)が1回だけ表示され、次点候補には推薦理由が表示されないことを確認するテスト
6. `TeamProfile` 型に `recommendationReason` フィールドが存在しないことを確認する(型チェックまたはgrep)
7. 「戻る」「最初からやり直す」「診断をスキップして一覧から選ぶ」「結果からの選択でpendingFavoritesStoreへ保存」「チームページリンク(`webSlug`ベース)」「対象外チームへの逃げ道文言」がStage C-1と同じ挙動のまま壊れていないことを確認する回帰テスト
8. TypeScript strict・lint・test green
9. **Owner 目視**: 実機または iOS Simulator で5問回答→結果画面まで確認する。配点・traitは承認済みだが、**実機で通して見たときにチーム紹介(shortDescription)の仮テキストに明らかな違和感があれば、その場で調整する**

## 未解決の質問

- チーム紹介(shortDescription)の最終文言はOwnerの裁量。Codexは仮テキストで実装を進めてよく、Ownerが別途差し替える
