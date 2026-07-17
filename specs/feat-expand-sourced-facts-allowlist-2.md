# sourced_factsの許可ドメインリストを拡張する（第2弾）

## 背景

2026-07-17、`docs/notes/news-digest-2026-07-17.md`の`--dry-run`実行（`scripts/import-news-digest-facts.ts`）で、抽出された12件の事実のうち4件が既存の許可ドメインリスト（`lib/llm/sourced-facts/allowlist.ts`の`SOURCED_FACT_ALLOWED_DOMAINS`）に無いドメインを理由に除外された。

除外された事実には、イタリア代表グザラダ監督のWorld Rugby新設「審判批判制裁プロセス」初適用による2試合出場停止処分（オーストラリア vs イタリア戦にとって最も独自性の高い情報）が含まれており、この1件が除外されたことで当該試合はプレビュー再生成の対象から完全に外れた。

除外理由となったドメインは以下の4件:

- `nbcsports.com`（NBC Sports、米大手スポーツメディア。既存許可リストの`espn.com`・`skysports.com`と同格）
- `sports.yahoo.com`（Yahoo Sports、米大手スポーツメディア。同上）
- `onrugby.it`（イタリア語ラグビー専門メディア。既存許可リストの`rugby-rp.com`（日本語ラグビー専門メディア）と同種）
- `news.yahoo.co.jp`（Yahoo!ニュース。今回の出典は日本の著名ラグビー記者による個人コラムだが、ドメイン自体は汎用ニュースポータルであり、`rugby-rp.com`のようなラグビー専門メディアとは性質がやや異なる。Owner承認のもと追加する）

`feat-expand-sourced-facts-allowlist.md`（2026-07-11、PR済み）と同一パターンの追加。

## スコープ

対象:
- `lib/llm/sourced-facts/allowlist.ts`の`MEDIA_DOMAINS`に以下4件を追加する: `nbcsports.com`・`sports.yahoo.com`・`onrugby.it`・`news.yahoo.co.jp`
- 追加後、既存のテスト（`isAllowedSourcedFactDomain`関連）に、これら4ドメインが許可される旨のテストケースを追加する

対象外:
- 上記以外の新規ドメインの追加（`citizen.co.za`・`itv.com`・`americasrugbynews.com`は今回のOwner指示に含まれないため対象外）
- ダイジェストインポートスクリプトの再実行（Owner側で別途手動実行する）
- `sourced_facts`の検索意図（`buildSearchPrompt`）の変更

## 受け入れ条件

1. `isAllowedSourcedFactDomain("nbcsports.com")`・`isAllowedSourcedFactDomain("sports.yahoo.com")`・`isAllowedSourcedFactDomain("onrugby.it")`・`isAllowedSourcedFactDomain("news.yahoo.co.jp")`が全て`true`を返す
2. 既存の許可ドメイン・非許可ドメインの判定に回帰がない（既存テストが全てパスする）
3. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
4. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

- なし（既存パターンへの追加のみのシンプルな変更）
