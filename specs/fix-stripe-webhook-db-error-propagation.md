# fix-stripe-webhook-db-error-propagation

## 背景

`app/api/stripe/webhook/route.ts` は、**DB 書き込みの結果を一切検査せずに Stripe へ `200 "ok"` を返している**（2026-09-05 コード確認）。

```
await supabase.from("user_profiles").upsert({ ... });   // L78 付近、戻り値を捨てている
...
return new Response("ok");                              // L104
```

Supabase JS クライアントは**例外を投げず `{ data, error }` を返す**。したがって書き込みが失敗しても `await` は正常に完了し、ハンドラは 200 を返す。

**Stripe は 2xx を受け取った webhook を再送しない。** 結果として次が起きる。

| 事象 | 結果 |
|---|---|
| `customer.subscription.created` の upsert が失敗 | **課金は成立しているのに Premium 権限が付かない。Stripe は再送しないので永久に復旧しない** |
| `customer.subscription.deleted` の update が失敗 | **解約済みのユーザーに Premium が残り続ける** |

`subscription.metadata?.userId` が無い場合も L68 で `"ok"` を返して黙って捨てている。**メタデータの付与漏れが起きても検知できない。**

現時点で有料購読者は実質ゼロのため実害は顕在化していないが、**課金を開始した直後に起きると発見が難しい**（GA4 の `purchase` イベントは 28 日間 0 件で、この経路を監視する手段が無い）。

RevenueCat 側 `app/api/revenuecat/webhook/route.ts` にも同じ構造が無いかを併せて確認する。

## スコープ

対象:
- `app/api/stripe/webhook/route.ts`: DB 書き込みの `error` を検査し、失敗時に非 2xx を返して Stripe に再送させる
- `userId` 欠落時に ops 通知を出す
- `app/api/revenuecat/webhook/route.ts`: 同種の握り潰しがあれば同じ方針で直す

対象外:
- **署名検証の変更**（L53-61 の `constructEvent` と 400 応答は現状維持）
- 冪等性キー・イベント重複排除の新設は対象外。同一内容のupsert再適用と、異なるイベントの順不同は別問題であり、upsertだけで全再送が安全とは主張しない。順序逆転による権限上書きは別途Ownerへ報告する。
- 決済フロー・価格・トライアル条件（`fix-billing-terms-consistency.md`）
- Stripe / RevenueCat の本番設定変更（Owner の作業）
- `user_profiles` のスキーマ変更

## データモデル変更

なし。

## API サーフェス

`POST /api/stripe/webhook` の応答を変える。

| 状況 | 現在 | 変更後 |
|---|---|---|
| 署名不正 | 400 | 400（変更なし） |
| DB 書き込み成功 | 200 `"ok"` | 200 `"ok"`（変更なし） |
| **DB 書き込み失敗** | **200 `"ok"`** | **5xx**（Stripe が再送する） |
| `userId` 欠落 | 200 `"ok"` | 200 `"ok"` ＋ **ops 通知**（再送しても直らないため 200 のままにする） |
| 未対応の `event.type` | 200 `"ok"` | 200 `"ok"`（変更なし） |

対応対象のsubscriptionイベントでuserIdが欠落する場合は、event.id付きの永続的な運用ログと通知試行を残して200とする。通知の失敗も監視可能なログに残す。未対応event.typeはuserId検査より前に200とし、不要な欠落通知を出さない。Ownerがevent.idから調査・修復する運用を受け入れ条件に含める。

## UI サーフェス

なし。

## LLM 連携

なし（コスト影響ゼロ）。

## 変更詳細

`upsert` と `update` の戻り値から `error` を取り出し、非 null なら:

1. ログにはevent.id・event.type・検証済みuserIdと安全なエラー分類コードを残す。Supabaseのmessage/details/hintやイベント本文は記録しない。
2. `lib/llm/notify.ts` の既存 ops 通知パターンで Discord へ送る。**`userId` と `event.id` を含める**（件数だけの通知にしない）
3. 5xx を返す

**エラー内容に個人情報・決済情報を含めないこと。** `userId`（UUID）と `event.id`（Stripe のイベント ID）までとし、メールアドレス・カード情報・`customer` の詳細は出さない。

## 受け入れ条件

1. `upsert` が `{ error }` を返すケースで、ハンドラが **5xx を返す**ことを検証するテストがある
2. `update`（`customer.subscription.deleted`）が `{ error }` を返すケースで 5xx を返すことを検証するテストがある
3. DB 書き込みが成功するケースで従来どおり 200 `"ok"` を返すことを検証するテストがある
4. `userId` が無いイベントで **200 を返し、かつ ops 通知が呼ばれる**ことを検証するテストがある（5xx を返さない）
5. 署名不正で 400 を返す既存挙動が壊れていない
6. 未対応の `event.type` で 200 を返す既存挙動が壊れていない
7. Discord 通知に `userId` と `event.id` が含まれ、**メールアドレス・カード情報・`customer` の詳細が含まれない**
8. `app/api/revenuecat/webhook/route.ts` を確認し、同種の握り潰しがあれば同じ方針で修正されている。無ければ「確認済み・該当なし」を PR 本文に書く
9. `pnpm test` と `pnpm typecheck` が green
10. **本番の Stripe 設定・価格・Webhook エンドポイント登録を変更しない**（コード差分のみ）

## 未解決の質問

**本 spec で解決しないと明示するもの**（`fix-billing-terms-consistency.md` と合わせても、契約から権限までの全面保証にはならない）:

- **再送の順序逆転**: Stripe の再送順序は保証されない。古い `subscription.updated` が新しい `deleted` の後に届くと権限が復活しうる。**本 spec は error 伝播のみを直す**（順序制御は F#44 の別 spec）
- **ゼロ行更新**: `update` が 0 行に一致しても `error` は返らない。`userId` に対応する行が無い場合を成功として扱ってよいかは未確定
- **`userId` 欠落からの復旧**: 通知は出すが、後から権限を付ける経路は本 spec に含まれない

**テストキーのみを使うこと。** `sk_live_` から始まる本番キーを扱ってはならない（CLAUDE.md セキュリティ規定）。ローカル検証は Stripe CLI のテストモードか、Supabase クライアントをモックしたユニットテストで行う。
