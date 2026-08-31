`/specs/fix-competition-hub-family-title-ctr.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 状況

**検索順位は取れています。落としているのはクリック率で、原因はタイトルが英語であることです。**

GSC 実測（2026-07-28〜08-24、`--dims page`）:

| URL | 表示 | クリック | CTR | 順位 |
|---|---:|---:|---:|---:|
| `/c/pnc/2026`（シーズン） | 79 | 6 | **7.6%** | 9.5 |
| `/c/pnc`（ファミリー） | 88 | 1 | **1.1%** | 10.4 |
| `/c/premiership`（ファミリー） | 107 | 2 | **1.9%** | 9.7 |

**同一大会・同じ順位帯で CTR が7倍違います。** 本番の実タイトルを見ると理由は明白です。

```
/c/premiership          Premiership 順位表・日程・日本での視聴方法 | Tryline
/c/premiership/2026-27  プレミアシップ 2026-27 日程・見どころ | Tryline
```

**ファミリーページだけ大会名が英語です。** meta description は両方とも日本語なので、**タイトルだけの問題**です。

## 原因

同じ「ファミリーの表示名」にマップが**2つ**あります。

- `lib/format/competition.ts:67-82` `FAMILY_DISPLAY_NAMES` … **14件中11件が英語**
- `lib/format/japanese-names.ts:82-95` `JAPANESE_COMPETITION_NAMES_BY_FAMILY` … 全件日本語

ファミリーページ（`app/c/[competition]/page.tsx:53`）は `formatFamilyName()` を呼び、これが**英語側**を見ています。シーズンページは `getCompetitionDisplayName` 経由で日本語側を見ています。

## 直すのは1関数だけです

`formatFamilyName` の解決順序を日本語マップ優先にします。具体形は spec の「実装方針」にあります。そのまま使って構いません。

**`app/` 配下は1ファイルも変更しないでください。** 戻り値が変わるだけで、呼び出し元15箇所すべてが正しくなります。

## 必ず踏む落とし穴（ここが本題）

**2つのマップは収録キーが一致していません。**

| family | 英語マップ | 日本語マップ |
|---|---|---|
| `lipovitan-challenge-cup` | リポビタンDチャレンジカップ | **無し** |
| `puma-trophy` | プーマ・トロフィー | **無し** |

この2つは**英語マップ側に日本語で入っています**。日本語マップへ単純に差し替えると、フォールバックが効かず `Lipovitan Challenge Cup` / `Puma Trophy` に退行します。

そのため:

- **`FAMILY_DISPLAY_NAMES` を削除しないでください。** この2件の唯一の供給源です
- 解決順序は **日本語マップ → `FAMILY_DISPLAY_NAMES` → タイトルケース** の3段にします
- 受け入れ条件6・7がこの退行を検出します

**`JAPANESE_COMPETITION_NAMES_BY_FAMILY` に2件を追加して解決しないでください。** このマップは `getCompetitionDisplayName` が `competitions.name_ja` のフォールバックに使う別責務のもので、取り込み側の定数と対応関係があります（DB を直しても取り込みで戻る経緯あり）。**今回はファミリー表示名の解決順序だけを変えます。**

2つのマップの統合もしないでください。責務が違います。

## 表示が変わることの確認

日本語名は英語名より長いものがあります（`URC` → `ユナイテッド・ラグビー・チャンピオンシップ` は23文字）。

**トップページの大会カード（`app/page.tsx:419,462,465`）と OG 画像（`createCompetitionOgImage` の `familyName`）で、折り返し・はみ出しが起きないか確認してください。** レイアウト崩れがあれば PR に明記してください（修正するかは別判断）。

## 既存テストは書き換えが必要です

`tests/format/competition.test.ts` は現在**英語を期待**しています（`"Pacific Nations Cup"` / `"Rugby World Cup"` 等）。これは仕様変更なので、**新しい期待値へ更新してください**。期待値を日本語に直すのが正しい対応です。

あわせて `lipovitan-challenge-cup` と `puma-trophy` のケースを**必ず残してください**（既存テストにあります。消さないこと）。

## 完了の定義

- spec の受け入れ条件1〜12をすべて満たす
- `app/` 配下の変更が**ゼロ**であること（`git diff --stat` で示せること）
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る

## PR に書いてほしいこと

1. `lipovitan-challenge-cup` と `puma-trophy` が日本語のままであることを、**どのテストが保証しているか**ケース名で示してください。ここが唯一の退行リスクです
2. 変更ファイル一覧に `app/` が含まれていないこと
