# fix-metadata-and-confirm-link-overclaim

> GPT-6 再レビュー 2026-09-11 の **F1 / F2**（ともに P2）。**どちらも「検証していないことを断定している」型**である。F1 は「無効です」と言い切り、F2 は「全 N 試合」と言い切る。**いずれも 2026-09-10〜11 に Claude がレビューして通した PR（#796 / #807）の欠陥である。**

## 背景

### F1 — 確認済みリンクを再度開くと「無効」になる

`app/api/newsletter/confirm/route.ts` の検索キーと更新内容が噛み合っていない（2026-09-11 実コード確認）。

```
:31   .eq("confirmation_token", token)        ← 検索キー
:43   if (subscriber.status === "confirmed")  ← already-confirmed へ
:65   confirmation_token: null,               ← 成功時に null にする
```

**初回成功で `confirmation_token` が null になるため、同じメールリンクを再度開くと該当行が見つからない。** `!subscriber` の分岐に落ち、`invalid-link` へ行く。**`:43` の `already-confirmed` は、通常の確認済みユーザーには到達不能である。**

`fix-newsletter-result-page-accuracy` の目的（再クリックした読者に「手続き済み」と伝える）が未達。**既存テストは「confirmed なのに同じ token で検索できる行」を直接返しており、実際の前後関係を検証していない。**

**Claude のレビュー時の見落とし**: 分岐が存在することは確認したが、**到達可能かを確認していない。**

### F2 — 取得済み件数を「全 N 試合」と断定する

`app/c/[competition]/[season]/page.tsx:432`（2026-09-11 実コード確認）。

```ts
return `${competitionTitle}は${participants}が参加する全${activeMatches.length}試合。${dateRange}の${...}を掲載。`;
```

**`activeMatches.length` は取得済みの件数であって、大会全体の試合数ではない。**

**同じページの本文は、既に網羅性を判定している。**

```
app/c/[competition]/[season]/page.tsx:47   import { hasIncompleteSchedule }
                                    :724   const incompleteScheduleCoverage = hasIncompleteSchedule({...})
```

`hasIncompleteSchedule` は `{ missingRounds, missingFixtures }` を返し（`lib/format/schedule-coverage.ts:13-18`）、**節の欠落を画面に表示している。** つまり **metadata が「全 N 試合」と言っている裏で、本文は「N 節が欠けています」と言う**状態が起きうる。

再現条件（GPT-6）: 全 18 節の大会で第 1 節の 1 試合だけ取得済み、順位表に 1 チームだけ → 本文ヘルパーは 17 節不足を返すが、metadata は「チーム A が参加する全 1 試合」を返す。**日程にいるチーム B が description に出ない。**

**Claude のレビュー時の見落とし**: 4 大会について件数が DB と一致することは検算した。しかし **「DB の取得済み件数 ＝ 大会全体の試合数」ではない**ことに繋げていない。検算した 4 大会がたまたま完全に取り込まれていただけである。

### 参加チームの扱いが仕様と衝突する

`lib/format/competition-metadata.ts` は「順位表優先、無ければ日程」で参加チームを決める。**順位表に 1 チームでもあれば、日程にしかいないチームが落ちる。**

これは `fix-competition-hub-metadata-team-names.md` の現仕様である。**本 spec で訂正する。**

## スコープ

対象:
- F1: 確認済みリンクの再訪で「手続き済み」を返せるようにする
- F2: 取得済み件数を大会全体として断定しない
- F2: 参加チームを**順位表と日程の和集合**で保持する（現仕様の「順位表優先」を訂正）
- テスト

対象外:
- **再購読を自動で行うこと**。本人の明示操作に限る
- **識別のために秘密トークンの保管を増やすこと**（新しいハッシュ列の追加等）
- **`hasIncompleteSchedule` の判定ロジック**（`lib/format/schedule-coverage.ts`）。読むだけ
- **`generateMetadata` への新しい DB クエリ追加**。既存の `matches` / `standings` で足りる
- 取り込み自体の改善
- DB への `UPDATE` / `INSERT`

## データモデル変更

### F1: `confirmation_token` を成功時に null にしない（2026-09-11 決定）

**`:65` の `confirmation_token: null` をやめ、`status` だけで状態を判定する。**

**この判断の根拠**:
- **確認済みトークンは無害である。** ルートは検索後に必ず `status` を見て分岐する（`:43` / `:47` / `:51`）。`status !== "pending"` の行に対して確認処理は走らない
- **新しい列を足さない。** 識別のためだけにハッシュ列を増やすのは、監査が明示的に避けよと書いている方向である
- `app/api/newsletter/unsubscribe/route.ts:29` は解除時に `confirmation_token: null` にしている。**解除時の null 化は維持する**（リンクを完全に無効化してよい状態のため）

**マイグレーションは不要。** 列は既に nullable である（`lib/db/types.ts:132`）。

## API サーフェス

`app/api/newsletter/confirm/route.ts` のリダイレクト先。**新しいルートは作らない。**

## UI サーフェス

`app/c/[competition]/[season]/page.tsx` の `<title>` と `<meta name="description">`。**画面本文・レイアウトは変えない。**

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. F1

成功後に同じリンクを開いたら `already-confirmed` へ行くようにする。

**`status === "unsubscribed"` の扱いは現行どおり**（`unsubscribed-link` へ、再購読しない）。

### 2. F2 — 件数の表現

**完全性が確認できないなら、大会全体として断定しない。** 「掲載中 N 試合」「確認できた日程」等、**取得済みであることが読み取れる表現**にする。

判定には `hasIncompleteSchedule` の結果を使う。**同じページが本文で使っているものと同じ根拠を使うこと。** metadata と本文が食い違う状態を作らない。

**開催期間も同様。** 取得済みの `kickoff_at` の最小・最大は「大会の開催期間」ではない。

### 3. F2 — 参加チーム

**順位表と日程の和集合を使う。** 順位表に 1 チームでもあれば日程を捨てる、という現在の挙動をやめる。

**新しい DB クエリは足さない。** `generateMetadata` は既に `matches` と `standings` の両方を読んでいる。

**チーム数の閾値（現在 4）と文字数上限（現在 72）は維持する。** 和集合にしたことで閾値を超える大会が増えるが、その場合は現行どおり列挙しない。

## 受け入れ条件

1. **確認成功 → 同じリンクを再度開く、の順で実ルートを 2 回呼び、2 回目が `already-confirmed` になる**ことを検証するテストがある。**状態を保持する DB モックを使い、1 回目の UPDATE の結果を 2 回目の検索に反映させること**
2. `status === "unsubscribed"` の行で**再購読が起きない**ことを検証するテストがある
3. `app/api/newsletter/unsubscribe/route.ts` の `confirmation_token: null` に差分が無い
4. **取得済み 1 試合・全 18 節の大会で、description が「全 1 試合」と断定しない**ことを検証するテストがある
5. **同じ条件で、`hasIncompleteSchedule` が欠落を返すとき description の表現が変わる**ことを検証するテストがある
6. **順位表に A だけ・日程に A 対 B のとき、description に B が含まれる**ことを検証するテストがある
7. 完全に取り込まれた大会では、**現行の「全 N 試合」表現が維持される**ことを検証するテストがある
8. **チーム数の閾値（4）と文字数上限（72）に差分が無い**
9. **`generateMetadata` に新しい DB クエリが追加されていない**
10. **`lib/format/schedule-coverage.ts` に差分が無い**
11. 画面本文・レイアウトに差分が無い
12. DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない
13. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**PR 本文に、変更後の description の全文を 2 パターン（完全に取り込まれた大会 / 部分取得の大会）記載すること。文字数も併記する。部分ではなく全文。**

**テストの置き場所**: `tests/api/` と `tests/app/`（`exclude` 非該当。確認済み）。

## 未解決の質問

なし。**`confirmation_token` を保持する方針は 2026-09-11 に決定済み。**

**本 spec で解決しないと明示するもの**:

- **既に確認済みの購読者（1 件）は、token が既に null なので再訪しても `already-confirmed` にならない。** 本 spec 以降に確認した人だけが対象
- **どの大会が現在部分取得かは未確認。** 本 spec は表現を直すだけで、取り込みは改善しない
