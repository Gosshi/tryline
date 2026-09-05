仕様書 `specs/fix-stripe-webhook-db-error-propagation.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**課金は成立しているのに Premium 権限が付かず、しかも復旧しない経路があります。**

`app/api/stripe/webhook/route.ts` は DB 書き込みの結果を検査せずに Stripe へ 200 を返しています。

```
await supabase.from("user_profiles").upsert({ ... });   // 戻り値を捨てている
...
return new Response("ok");
```

**Supabase JS は例外を投げず `{ data, error }` を返します。** 書き込みが失敗しても `await` は正常に完了し、200 が返ります。**Stripe は 2xx を受け取った webhook を再送しません。**

`customer.subscription.deleted` 側も同じで、解約済みユーザーに Premium が残り続けます。

## 触るファイル

```
app/api/stripe/webhook/route.ts
app/api/revenuecat/webhook/route.ts   （同種の握り潰しがあれば）
```

## 応答の設計を間違えないでください

| 状況 | 返すもの |
|---|---|
| DB 書き込み失敗 | **5xx**（Stripe に再送させる） |
| `userId` 欠落 | **200 ＋ ops 通知**（再送しても直らないので 5xx にしない） |
| 署名不正 | 400（現状維持） |
| 未対応の event.type | 200（現状維持） |

**`userId` 欠落で 5xx を返さないでください。** メタデータが無いイベントは何度再送しても成立せず、Stripe の再送上限まで無駄に叩き続けます。

## 通知に入れてはいけないもの

**メールアドレス・カード情報・`customer` の詳細を出さないでください。** `userId`（UUID）と `event.id` までです。

## 絶対に守ること

**`sk_live_` から始まる本番キーを扱わないでください**（CLAUDE.md のセキュリティ規定）。ローカル検証は Stripe CLI のテストモードか、Supabase クライアントをモックしたユニットテストで行ってください。

**本番の Stripe 設定・価格・Webhook 登録を変更しないでください。** コード差分だけです。

**冪等性キーや重複排除を新設しないでください。** upsert は既に冪等で、再送で壊れません。
