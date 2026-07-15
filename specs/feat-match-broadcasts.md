# feat-match-broadcasts: 視聴方法の構造化と「試合ページへの送客」化

## 背景

`feat-web-broadcast-links`（2026-07-15 マージ、PR #576）は単一 URL（`matches.broadcast_jp_url`）の外部リンク表示だったが、Owner 判断で方針を転換する（2026-07-15）:

1. **視聴方法の情報は Tryline の試合ページ自体に載せる**。JRFU 等の集約ページへ送客するのは差別化価値の外注になる。外部に出すのは実際に視聴が始まる放送局・配信サービスの公式ページだけ
2. 実データは 1 試合に複数の視聴先がある（例: 7/18 日本×フランス = WOWOW プライム / J SPORTS 4 / WOWOW オンデマンド / J SPORTS オンデマンドの 4 件）。単一 URL では表現できない

本 spec は `match_broadcasts` テーブルを新設し、試合詳細ページに「視聴方法」セクションを設ける。**PR #576 の単一 URL 表示 UI は本 spec で置き換える**（supersede。`broadcast_jp_url` カラム自体は残すが Web UI からの参照を外す）。通知・X・note からの導線はすべて Tryline の試合ページに集まり、そこから公式視聴先へ出て行く構造になる。

対象リポジトリ: **tryline**（テーブル・投入スクリプト・Web UI・BFF 拡張）＋ **tryline-mobile**（視聴方法リスト表示）。7/18 日本×フランスまでに tryline 側を本番投入するのが目標。

## スコープ

対象（tryline）:
- テーブル `match_broadcasts`
- 投入用 CLI スクリプト `tools/upsert-match-broadcasts.ts`（Owner の週次運用ツール）
- 試合詳細ページ「視聴方法」セクション（PR #576 の単一 URL ボタンを置換）
- カレンダーの「視聴」リンクを**外部→試合詳細ページの視聴方法セクションへのサイト内リンク**に変更
- BFF 拡張: `/api/v1/matches/[id]` に `broadcasts` 配列、`/api/v1/calendar` に `has_broadcasts` フラグを**追加**（既存フィールドの削除・変更はしない。v1 契約はフィールド追加のみ可）

対象（tryline-mobile）:
- 試合詳細の単一「視聴する」ボタンを「視聴方法」リスト（サービス名つき外部リンク）に置換。`broadcasts` が空で `broadcast_jp_url` が非 null の場合のみ旧ボタンを fallback 表示

対象外:
- データの自動取得・スクレイピング（投入は手動運用。自動化は需要とコストを見て別 spec）
- `broadcast_jp_url` カラムの削除（BFF v1 契約に含まれるため残置。非推奨扱い）
- 通知文言の変更（通知は従来どおり試合ページを開くだけで、視聴方法はそこにある）
- 過去試合への遡及データ投入

## データモデル変更

```sql
create table match_broadcasts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  service_name text not null,
  url text not null,
  kind text not null check (kind in ('tv', 'streaming')),
  display_order integer not null default 0,
  verified_at timestamptz not null default now(),
  source_url text,
  created_at timestamptz not null default now(),
  unique (match_id, service_name)
);
create index match_broadcasts_match_id_idx on match_broadcasts (match_id);
```

権限: RLS 有効化＋**公開読み取り・サーバー専用書き込み**。

```sql
alter table match_broadcasts enable row level security;
create policy "public read" on match_broadcasts for select using (true);
revoke all on match_broadcasts from anon, authenticated;
grant select on match_broadcasts to anon, authenticated;
```

（試合ページの RSC は anon クライアント経由で読むため SELECT は必要。書き込みは service role のみ — entitlement 事故の教訓）

## API サーフェス

### 投入スクリプト `tools/upsert-match-broadcasts.ts`

- 実行方法は既存の本番スクリプト規約に従う: `node --env-file=.env.production.local tools/run-ts.cjs tools/upsert-match-broadcasts.ts <json ファイルパス>`
- 入力 JSON 例:

```json
{
  "match_id": "b986f44f-4d3e-4642-a4b9-db8af6324722",
  "source_url": "https://www.rugby-japan.jp/match/29967",
  "broadcasts": [
    { "service_name": "WOWOW プライム", "url": "https://...", "kind": "tv" },
    { "service_name": "J SPORTS 4", "url": "https://...", "kind": "tv" },
    { "service_name": "WOWOW オンデマンド", "url": "https://...", "kind": "streaming" },
    { "service_name": "J SPORTS オンデマンド", "url": "https://...", "kind": "streaming" }
  ]
}
```

- `(match_id, service_name)` で upsert（再実行冪等）。`display_order` は配列順を採用。実行前に対象試合のカード名・日時を表示して確認プロンプトを出し、実行後に件数を表示する
- match_id が存在しない場合はエラーで何も書かない

### BFF 拡張（追加のみ）

- `GET /api/v1/matches/[id]`: `broadcasts: { service_name, url, kind }[]`（display_order 順）を追加
- `GET /api/v1/calendar`: 各試合に `has_broadcasts: boolean` を追加
- 既存フィールド（`broadcast_jp_url` 含む）は変更しない

## UI サーフェス

### Web 試合詳細（`components/match-header.tsx` 周辺）

- PR #576 で入れた単一「視聴する」ボタンを削除し、「視聴方法」セクションに置換。位置はスコアボード直下、`id="broadcasts"` のアンカーを付ける
- 各行: kind バッジ（`tv` → 「放送」、`streaming` → 「配信」）＋サービス名＋外部リンク（`target="_blank" rel="noopener noreferrer"`）
- セクション末尾に小さく「確認日: M/D」（`verified_at` の最大値）を表示。**出典（`source_url`）は表示しない**（内部管理用）
- 0 件の試合ではセクションごと非表示（プレースホルダなし）
- スタイルは `app/globals.css` のトークンで既存試合ページに揃える（PR #576 のピル型リンクの見た目を踏襲してよい）

### Web カレンダー（`components/calendar/week-schedule.tsx`）

- PR #576 の外部リンクを、`has_broadcasts` 相当（該当試合に match_broadcasts が 1 件以上）のときの**サイト内リンク `/matches/<id>#broadcasts`** に変更。文言は「視聴」のまま
- `broadcast_jp_url` のみの試合は表示しない（新テーブルを唯一のソースにする）

### アプリ試合詳細（tryline-mobile）

- `broadcasts` 配列が非空: サービス名つきリストを表示、タップで `Linking.openURL`。kind バッジも Web と同等
- `broadcasts` が空かつ `broadcast_jp_url` 非 null: 既存の単一「視聴する」ボタンを fallback 表示（後方互換）
- 両方なし: 何も表示しない

## LLM 連携

なし。視聴先データは公式ページから人間が確認して投入する（LLM による補完・生成は禁止 — 誤った視聴情報は捏造 recap と同種の信頼毀損）。

## 受け入れ条件

### tryline 側

1. `match_broadcasts` に anon で SELECT でき、anon / authenticated で INSERT / UPDATE / DELETE が拒否される（テスト）
2. 投入スクリプト: 上記 JSON 例で 4 行入り、**同じ JSON の再実行で行数が増えない**。存在しない match_id はエラーで 0 行
3. 試合詳細: broadcasts が 1 件以上の試合で「視聴方法」セクション（`id="broadcasts"`）が描画され、各リンクが `rel="noopener noreferrer"` 付き。0 件では DOM に存在しない（テスト）
4. カレンダー: broadcasts がある試合の行に `/matches/<id>#broadcasts` へのサイト内リンクが表示され、`broadcast_jp_url` のみの試合には表示されない（テスト）
5. BFF: `/api/v1/matches/[id]` の `broadcasts` が display_order 順で返り、`/api/v1/calendar` の `has_broadcasts` が正しい。**既存フィールドのスナップショットに変化がない**（追加のみの検証）
6. `pnpm test`・`pnpm build` pass
7. **Owner 目視**: 日本×フランスへ実データ投入後、本番の試合詳細・カレンダー（モバイル幅）で確認

### tryline-mobile 側

8. broadcasts 非空でリスト表示・タップで `Linking.openURL`（テスト）。空＋`broadcast_jp_url` 非 null で旧ボタン、両方なしで非表示（テスト）
9. `src/api/types.ts` を tryline の `lib/api/v1/types.ts` 最新版で更新
10. CI green

## 未解決の質問

1. kind の 2 区分（tv / streaming）で足りるか — 「地上波無料」等の細分化は運用しながら判断（check 制約の変更は軽い）
