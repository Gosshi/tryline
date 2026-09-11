仕様書 `specs/fix-metadata-and-confirm-link-overclaim.md` を実装してください。**先に全文を読んでください。**

GPT-6 再レビュー 2026-09-11 の **F1 / F2** です。**どちらも「検証していないことを断定している」型**で、**2026-09-10〜11 に私がレビューして通した PR（#796 / #807）の欠陥**です。

## F1 — 確認済みリンクを再度開くと「無効」になる

`app/api/newsletter/confirm/route.ts`（実コード確認）。

```
:31   .eq("confirmation_token", token)        ← 検索キー
:43   if (subscriber.status === "confirmed")  ← already-confirmed へ
:65   confirmation_token: null,               ← 成功時に null にする
```

**初回成功で token が null になるため、同じリンクを再度開くと該当行が見つからず `invalid-link` へ行きます。`:43` は通常の確認済みユーザーには到達不能です。**

既存テストは「confirmed なのに同じ token で検索できる行」を直接返しており、**実際の前後関係を検証していません。**

**方針は決定済みです（2026-09-11）。`:65` の `confirmation_token: null` をやめ、`status` だけで判定してください。**

根拠: ルートは検索後に必ず `status` を見て分岐するため、確認済みトークンは無害です（`status !== "pending"` の行に確認処理は走りません）。新しいハッシュ列を足すのは監査が避けよと書いている方向です。**マイグレーションは不要**で、列は既に nullable です。

**`app/api/newsletter/unsubscribe/route.ts:29` の `confirmation_token: null` は維持してください**（解除時はリンクを完全に無効化してよい状態です）。

## F2 — 取得済み件数を「全 N 試合」と断定する

`app/c/[competition]/[season]/page.tsx:432`。

```ts
return `${competitionTitle}は${participants}が参加する全${activeMatches.length}試合。${dateRange}の${...}を掲載。`;
```

**`activeMatches.length` は取得済み件数であって大会全体の試合数ではありません。**

**同じページの本文は既に網羅性を判定しています。**

```
:47    import { hasIncompleteSchedule }
:724   const incompleteScheduleCoverage = hasIncompleteSchedule({...})
```

つまり **metadata が「全 N 試合」と言う裏で、本文が「N 節が欠けています」と言う**状態が起きえます。

再現条件: 全 18 節の大会で第 1 節の 1 試合だけ取得済み、順位表に 1 チームだけ → 本文ヘルパーは 17 節不足を返すが、metadata は「チーム A が参加する全 1 試合」。**日程にいる B が description に出ません。**

**参加チームの仕様を訂正します。** 現在は「順位表優先、無ければ日程」ですが、**順位表と日程の和集合**にしてください。順位表に 1 チームでもあれば日程を捨てる挙動をやめます。

判定には `hasIncompleteSchedule` を使ってください。**同じページが本文で使っているものと同じ根拠を使い、metadata と本文が食い違わないようにしてください。** 開催期間も同様で、取得済みの `kickoff_at` の最小・最大は「大会の開催期間」ではありません。

## やってはいけないこと

- **再購読を自動で行うこと。** `status === "unsubscribed"` は現行どおり `unsubscribed-link` へ
- **識別のために秘密トークンの保管を増やすこと**（新しいハッシュ列の追加等）
- **`lib/format/schedule-coverage.ts` を変えること。** 読むだけです
- **`generateMetadata` に新しい DB クエリを足すこと。** 既存の `matches` / `standings` で足ります
- **チーム数の閾値（4）と文字数上限（72）を変えること**
- 画面本文・レイアウトを変えること
- DB への `UPDATE` / `INSERT` / マイグレーション

## 完了の定義

受け入れ条件 1〜13 を満たすこと。特に:

- **確認成功 → 同じリンク再訪、の順で実ルートを 2 回呼び、2 回目が `already-confirmed`**（条件 1）。**状態を保持する DB モックを使い、1 回目の UPDATE を 2 回目の検索に反映させてください**
- 取得済み 1 試合・全 18 節で**「全 1 試合」と断定しない**（条件 4）
- **順位表に A だけ・日程に A 対 B で、description に B が含まれる**（条件 6）
- **完全に取り込まれた大会では現行表現が維持される**（条件 7）
- 閾値 4 / 上限 72 に差分が無い（条件 8）

**PR 本文に、変更後の description の全文を 2 パターン（完全取得 / 部分取得）と文字数を記載してください。部分ではなく全文です。**

テストは `tests/api/` と `tests/app/`（`exclude` 非該当。確認済み）。

git worktree で `origin/main` から切ってください（`docs/runbooks/codex-worktree.md`）。

**既に確認済みの購読者（1 件）は token が既に null なので、再訪しても `already-confirmed` になりません。** 本 spec 以降に確認した人だけが対象です。

仕様と現状が食い違うと判断したら、実装を止めて指摘してください。
