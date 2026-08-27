PR #738（`codex/feat-discord-fact-entry`）の差し戻しです。**同じブランチに追加コミットしてください。**新しい PR は作らないでください。

実装の大半は正しく、DB スキーマ・署名検証・削除保護は本番データで検算して問題ありませんでした。**直すのは1点だけです。ただしそれは本番で必ず失敗する種類の欠陥です。**

## ブロッカー: モーダルの構造が Discord の仕様に反しています

`app/api/discord/interactions/route.ts` の `buildFactEntryModal` が、確度の String Select（type 3）を **Action Row（type 1）の中**に入れています。

Discord 公式ドキュメント（https://docs.discord.com/developers/interactions/message-components）の記述:

> String Selects are available in messages and modals. They must be placed inside an Action Row in messages and **a Label in modals**.

**モーダル内では Select を Label（type 18）で包む必要があります。** 現状の payload は Discord が 400 で拒否するため、コンテキストメニューを実行しても**モーダルが開きません**。

同じページに次の記述もあります。

> Label is recommended for use over an Action Row in modals. **Action Row with Text Inputs in modals are now deprecated.**

事実入力の Text Input も Action Row 直下なので、**両方 Label 形式に統一してください。**

### 正しい payload

```jsonc
{
  "type": 9,
  "data": {
    "custom_id": "fact-entry:<match_id>:<news_link_id>",
    "title": "事実を追加",
    "components": [
      {
        "type": 18,
        "label": "事実",
        "component": {
          "type": 4,
          "custom_id": "fact",
          "style": 2,
          "required": true
        }
      },
      {
        "type": 18,
        "label": "確度",
        "description": "既定: medium",
        "required": false,
        "component": {
          "type": 3,
          "custom_id": "confidence",
          "options": [
            { "label": "high", "value": "high" },
            { "label": "medium", "value": "medium", "default": true },
            { "label": "low", "value": "low" }
          ]
        }
      }
    ]
  }
}
```

**`label` と `required` は Text Input / Select 自身ではなく Label 側に置きます。** ここが現状と最も違う点です。

## 連動して直す必要があります（ここを忘れると別の形で壊れます）

`findComponentValue`（`route.ts:170-201`）は `record.components`（**複数形**）しか再帰しません。

**Label 形式の modal submit ペイロードは `component`（単数形）でネストして返ってきます。** このままだと送信された値を読めず、`parseModalSubmission` が null を返し、**必ず「入力内容を確認してください。」で失敗します。**

`components`（配列）と `component`（単一オブジェクト）の**両方**を辿るようにしてください。

## テストを実際の形に合わせてください

現在のテストは**自前が返す JSON の形を assert しているだけ**で、その形が Discord にとって妥当かは検証していません。だから CI は通ったのに本番では動きません。

- `tests/api/discord-interactions.test.ts:176-186` — モーダル構造の assert を Label 形式に更新
- 同 `:194-197`, `:234-238` — submit ペイロードのモックを `component`（単数形）ネストに更新
- **`components`（複数形）ネストのケースも1件残してください。** 両方辿れることの証明になります

## spec の修正: 未申告の逸脱を書き足してください

PR 本文に「Intentional deviations: None」とありますが、**spec に無い実装が入っています。**

`openFactEntryModal` と `saveFactEntry` が `news_links` を `matched_match_id` + `source_url` で照合し、一致する行が無ければ拒否しています。spec は「通知メッセージから `match_id` と `source_url` を抽出する」としか書いていません。

**この実装は残してください。正しい判断です。** メッセージ本文の `source_url` をそのまま採用すると、Owner が任意のメッセージを書くだけで任意のドメインを `source_domain` として登録でき、読み取り時 allowlist 例外と組み合わさって**実質的な allowlist バイパス**になります。DB 照合はそれを塞いでいます。

**`specs/feat-discord-fact-entry.md` の「試合と出典の特定」節に、この照合を要件として書き足してください。** 含めること:

- `news_links` を `matched_match_id` + `source_url` で照合し、無ければ拒否する
- **なぜ必要か**（上記の allowlist バイパス防止）
- **副作用**: 通知に載っていない記事からは追加できない。URL が編集・短縮されると照合が外れる

受け入れ条件にも1項目追加してください。

PR 本文の「Intentional deviations」も **None から実際の内容に修正**してください。

## やらないでください

- **署名検証・Owner 照合・環境変数まわりの変更。** 検算済みで正しく動いています
- **`lib/llm/sourced-facts/fetch.ts` の変更。** 削除保護の PostgREST 条件も読み取り例外も、本番スキーマで正しいことを確認済みです
- `lib/llm/sourced-facts/allowlist.ts` / `lib/news-links.ts` の変更
- **`X-Signature-Timestamp` の鮮度検証の追加。** 指摘済みですが upsert が冪等なので実害が無く、今回のスコープ外です
- `kickoff_at` が null の場合の扱いの変更（同上）
- 新規 PR の作成

## 完了の定義

- モーダルが Label（type 18）形式になっている
- `findComponentValue` が `component`（単数形）と `components`（複数形）の**両方**を辿る
- 両方のネスト形でのテストがある
- `specs/feat-discord-fact-entry.md` に `news_links` 照合が要件として書かれ、受け入れ条件が1項目増えている
- `git diff origin/main...HEAD -- lib/llm/sourced-facts/fetch.ts` が**元の PR から変わっていない**
- `git diff origin/main...HEAD -- lib/llm/sourced-facts/allowlist.ts lib/news-links.ts` が**空**
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` が clean

## PR 本文の更新

- 「Intentional deviations」を実態に合わせて修正
- モーダル構造を変更した理由（Discord 仕様）と、参照した公式ドキュメントの URL
- 更新後の `git diff --stat`
