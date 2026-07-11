# sourced_factsの許可ドメインリストを拡張する

## 背景

2026-07-11、`scripts/import-news-digest-facts.ts`（PR #543/#544）の実運用（`docs/notes/news-digest-2026-07-10.md`の`--dry-run`実行）で、抽出された11件の事実のうち10件が既存の許可ドメインリスト（`lib/llm/sourced-facts/allowlist.ts`の`SOURCED_FACT_ALLOWED_DOMAINS`）に無いドメインを理由に除外された。

実際に除外された事実には、南アフリカのシヤ・コリシ/エベン・エツェベツ欠場、アイルランドの大幅ローテーション（先発15人中10人が前節メンバー外）、イングランドのヘンリー・スレイド76キャップ復帰など、価値の高い情報が含まれていた。除外理由となったドメインは以下の7件:

- `rugby-japan.jp`（日本ラグビーフットボール協会=JRFU公式）
- `rugby.com.au`（ラグビーオーストラリア公式）
- `allblacks.com`（ニュージーランドラグビー協会公式）
- `englandrugby.com`（RFU=イングランドラグビー協会公式）
- `espn.com`（国際スポーツメディア）
- `skysports.com`（英国スポーツメディア）
- `rugby-rp.com`（ラグビーリパブリック、日本語ラグビー専門メディア）

既存の許可リストには既に各大会公式サイト（`sixnationsrugby.com`・`premiershiprugby.com`・`unitedrugby.com`・`rugbychampionship.com`等）や国際メディア（`bbc.com`・`rugbypass.com`・`planetrugby.com`）が含まれており、上記7件も同種（各国代表チーム協会の公式サイト、または確立されたスポーツメディア）としてカテゴリ的に一貫性がある。

Owner承認のもと、許可リストへの追加を進める。

## スコープ

対象:
- `lib/llm/sourced-facts/allowlist.ts`の`OFFICIAL_DOMAINS`に以下4件を追加する: `rugby-japan.jp`・`rugby.com.au`・`allblacks.com`・`englandrugby.com`
- 同ファイルの`MEDIA_DOMAINS`に以下3件を追加する: `espn.com`・`skysports.com`・`rugby-rp.com`
- 追加後、既存のテスト（`isAllowedSourcedFactDomain`関連）に、これら7ドメインが許可される旨のテストケースを追加する

対象外:
- 上記以外の新規ドメインの追加（今回除外リストに実際に登場した7件に限定する）
- ダイジェストインポートスクリプトの再実行（Owner側で別途手動実行する）
- `sourced_facts`の検索意図（`buildSearchPrompt`）の変更

## 受け入れ条件

1. `isAllowedSourcedFactDomain("rugby-japan.jp")`・`isAllowedSourcedFactDomain("rugby.com.au")`・`isAllowedSourcedFactDomain("allblacks.com")`・`isAllowedSourcedFactDomain("englandrugby.com")`・`isAllowedSourcedFactDomain("espn.com")`・`isAllowedSourcedFactDomain("skysports.com")`・`isAllowedSourcedFactDomain("rugby-rp.com")`が全て`true`を返す
2. 既存の許可ドメイン・非許可ドメインの判定に回帰がない（既存テストが全てパスする）
3. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
4. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

- なし（既存パターンへの追加のみのシンプルな変更）
