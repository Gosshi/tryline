# feat-team-flag-identity: チーム識別（国旗＋short_code）の導入

## 背景

2026-07-15 の iOS デザイン監査後、Owner × GPT-5.6 の壁打ちで「チームを識別する視覚的アンカーがなく文字だけで画面を成立させている」ことが見た目の弱さの核心と特定された。`teams.short_code` は全チームに既存だが API 未露出。国旗は `teams.country` から導出できそうに見えるが、**実測（2026-07-15）で `country='GBR'` が England/Scotland/Wales の代表チーム 3 件とクラブ 16 件（Bath, Cardiff, Edinburgh 等）の計 19 件に割り当たっており、そのまま国旗化すると全 19 チームがユニオンジャックになる**（Cardiff はウェールズ、Edinburgh はスコットランドが正しい）。`country` を流用せず、専用の `flag_code` を新設してチームごとに正しい値を持たせる。

クレスト画像（`teams.logo_url`）は実測で対象チーム全件 null のため本 spec のスコープ外（新規データ収集が必要、別途判断）。

対象リポジトリ: **tryline**（データ・BFF）＋**tryline-mobile**（表示）。

## スコープ

対象（tryline）:
- `teams` に `flag_code` カラム追加（ISO 3166-1 alpha-2、絵文字国旗描画に使う）
- 全チームへの `flag_code` バックフィル: `country` から機械的に導出できるもの（GBR 以外）は自動、**`country='GBR'` の 19 件は手動マッピング**（下記）
- `V1TeamSummary` に `short_code` と `flag_code` を追加（BFF フィールド追加のみ）

対象（tryline-mobile）:
- カレンダー・試合カードの対戦表示: 国旗＋3文字コード（フルネームはアクセシビリティラベルのみ）
- 試合詳細のマストヘッド: 国旗＋コード＋フルネーム（フルネームはスコアの下に配置し、長い名前がスコア帯を押し出さないようにする）
- `reference/api-types.ts` を更新後の `lib/api/v1/types.ts` で同期

対象外:
- クレスト画像（`logo_url`）の収集・表示
- flag_code のクライアント側推測・生成（必ず API から正式値を返す。GPT-5.6 提案どおり）
- 国旗絵文字が正しくレンダリングされない OS バージョンへの独自フォールバック（iOS 標準のフォールバックに委ねる）

## データモデル変更

```sql
alter table teams add column flag_code text;
```

### バックフィル（`country` から自動導出、GBR を除く）

`country` が ISO 3166-1 alpha-3 の場合、対応する alpha-2 に変換して `flag_code` に設定する既存マッピングテーブル or 変換関数を用いる（新規依存追加は不要な規模）。

### 手動マッピング（`country='GBR'` の 19 件、2026-07-15 実測で特定済み）

**決定（2026-07-16、Owner承認）**: England/Wales/Scotland は Unicode Tag Sequence による地域旗の絵文字をそのまま `flag_code` に格納する（未解決の質問1は解決済み）。

| flag_code | 絵文字 | 対象 slug |
|---|---|---|
| `england` | 🏴󠁧󠁢󠁥󠁮󠁧󠁿 | england, bath, bristol-bears, exeter-chiefs, gloucester, harlequins, leicester-tigers, newcastle-falcons, northampton-saints, sale-sharks, saracens（11件） |
| `wales` | 🏴󠁧󠁢󠁷󠁬󠁳󠁿 | wales, cardiff, dragons, ospreys, scarlets（5件） |
| `scotland` | 🏴󠁧󠁢󠁳󠁣󠁴󠁿 | scotland, edinburgh, glasgow-warriors（3件） |

上記以外の国（`country` が GBR でない全チーム）は `flag_code` に ISO 3166-1 alpha-2 由来の通常の国旗絵文字（例: `🇳🇿`, `🇦🇺`）を格納する。`flag_code` カラムには**絵文字そのもの**を保存し、クライアント側での絵文字変換・組み立ては行わない（GPT-5.6 提案どおり、正式値は常に API から返す）。iOS 実機で地域旗絵文字（🏴系）が正しくレンダリングされるかは実装時に確認し、崩れる場合のみ Owner に代替表現を相談する。

## API サーフェス

`lib/api/v1/types.ts` の `V1TeamSummary` にフィールド追加（既存フィールドは変更しない）:

```ts
export type V1TeamSummary = {
  id: string | null;
  name: string;
  short_code: string;
  flag_code: string | null;
  score: number | null;
  slug: string;
};
```

`/api/v1/calendar` と `/api/v1/matches/[id]` のレスポンス組み立てで `teams` の select に `short_code`, `flag_code` を追加する（`lib/db/queries/matches.ts` 等、既存の team 情報組み立て箇所）。

## UI サーフェス

### カレンダー・試合カード

```
🇳🇿 NZL      47–17      ITA 🇮🇹
```

- 国旗＋3文字コードの中央寄せ 2 列、スコア/KO時刻は中央固定幅
- `flag_code` が null の場合は国旗を省略しコードのみ表示（欠損に対して壊れない）
- フルネームは `accessibilityLabel` にのみ含める

### 試合詳細マストヘッド

```
🇳🇿                 🇮🇹
NZL      47–17      ITA
ニュージーランド   イタリア
```

- フルネームはスコアの下に配置（既存の「チーム名折返しでスコアが押し出される」問題の根本対策）
- 帯の配色・赤上罫線など `feat-mobile-editorial-polish` の実装を維持したまま、対戦表示部分のみ差し替える

## LLM 連携

なし。

## 受け入れ条件

### tryline 側

1. `teams` 全件（2026-07-15 実測で country='GBR' の19件を含む）に `flag_code` が入り、England/Wales/Scotland 系がそれぞれ異なる値を持つ（テスト）
2. `country` が GBR 以外のチームは自動導出値と一致する
3. `/api/v1/calendar`・`/api/v1/matches/[id]` のレスポンスに `short_code`・`flag_code` が含まれる（既存フィールドに変化なし）
4. `pnpm test`・`pnpm build` pass

### tryline-mobile 側

5. カレンダー・試合カードが国旗＋コードで対戦を表示し、`flag_code` null 時はコードのみで崩れない（テスト）
6. 試合詳細でフルネームがスコアの下に配置され、長いチーム名でもスコア帯の高さ・位置が変わらない（テスト）
7. アクセシビリティラベルにフルネームが含まれる（テスト）
8. `src/api/types.ts` が更新後の型と一致する
9. CI green

### 共通

10. **Owner 目視**: 実データ（日本×フランス等）でカレンダー・試合詳細のスクリーンショットを確認し、国旗の正確性（特に UK 系クラブ）を検証する

## 未解決の質問

1. 北アイルランド拠点のチームが将来追加された場合の扱いは、追加時に個別対応する
