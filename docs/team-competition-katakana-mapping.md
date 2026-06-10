# 海外チーム・大会 カタカナ表記マッピング（2026-06-10）

> `specs/feat-japanese-team-competition-names.md` / `feat-japanese-team-competition-names`（Codex プロンプト）の **データ確定版**。  
> DB から `name_ja` 未設定の海外チーム78件を抽出し、日本語 Wikipedia・J SPORTS・ラグビーリパブリック等の定着表記で確定。  
> Codex はこの `slug → name_ja` を追補マイグレーションに投入する。**⚠ 印は Owner 最終確認推奨**（表記揺れあり）。

## 方針
- **フランス勢はメディア慣用の短縮形**を主表記（例: Stade Toulousain → 「トゥールーズ」）。正式名は備考に併記。試合タイトル・検索の自然さを優先。
- ナショナルチームは日本語国名（試合タイトル「イングランド vs フランス」で自然）。SEO で「◯◯代表」も狙うなら別途エイリアス検討（未解決1）。

---

## ナショナルチーム（25件）

| slug | 英語名 | name_ja | 備考 |
|------|--------|---------|------|
| argentina | Argentina | アルゼンチン | 愛称ロス・プーマス |
| australia | Australia | オーストラリア | 愛称ワラビーズ |
| canada | Canada | カナダ | |
| chile | Chile Cóndores | チリ | 愛称コンドルス |
| spain | Spain | スペイン | |
| fiji | Fiji | フィジー | |
| france | France | フランス | |
| england | England | イングランド | |
| scotland | Scotland | スコットランド | |
| wales | Wales | ウェールズ | |
| georgia | Georgia | ジョージア | |
| hong-kong-china | Hong Kong China | ホンコンチャイナ | Owner 確定 |
| ireland | Ireland | アイルランド | |
| italy | Italy | イタリア | |
| japan | Japan | 日本 | |
| namibia | Namibia | ナミビア | |
| new-zealand | New Zealand | ニュージーランド | 愛称オールブラックス |
| portugal | Portugal | ポルトガル | |
| romania | Romania | ルーマニア | |
| tonga | Tonga | トンガ | |
| uruguay | Uruguay | ウルグアイ | |
| usa | United States | アメリカ | Owner 確定（代表は付けない） |
| samoa | Samoa | サモア | |
| south-africa | South Africa | 南アフリカ | 愛称スプリングボクス |
| zimbabwe | Zimbabwe | ジンバブエ | |

---

## Super Rugby Pacific（12件）

| slug | 英語名 | name_ja | 備考 |
|------|--------|---------|------|
| blues | Blues | ブルーズ | NZ |
| chiefs | Chiefs | チーフス | NZ |
| crusaders | Crusaders | クルセイダーズ | NZ |
| highlanders | Highlanders | ハイランダーズ | NZ |
| hurricanes | Hurricanes | ハリケーンズ | NZ |
| brumbies | Brumbies | ブランビーズ | AUS |
| reds | Queensland Reds | クイーンズランド・レッズ | Owner 確定 |
| waratahs | Waratahs | ワラターズ | AUS |
| force | Western Force | ウェスタン・フォース | AUS（短縮「フォース」） |
| rebels | Melbourne Rebels | メルボルン・レベルズ | AUS |
| fijian-drua | Fijian Drua | フィジアン・ドルア | FJI |
| moana-pasifika | Moana Pasifika | モアナ・パシフィカ | WSM |

---

## Premiership（10件・イングランド）

| slug | 英語名 | name_ja | 備考 |
|------|--------|---------|------|
| bath | Bath Rugby | バース | |
| bristol-bears | Bristol Bears | ブリストル・ベアーズ | |
| exeter-chiefs | Exeter Chiefs | エクセター・チーフス | |
| gloucester | Gloucester Rugby | グロスター | |
| harlequins | Harlequins | ハーレクインズ | |
| leicester-tigers | Leicester Tigers | レスター・タイガース | |
| newcastle-falcons | Newcastle Falcons | ニューカッスル・ファルコンズ | Owner 確定（一旦この表記） |
| northampton-saints | Northampton Saints | ノーザンプトン・セインツ | |
| sale-sharks | Sale Sharks | セール・シャークス | |
| saracens | Saracens | サラセンズ | |

---

## URC（16件）

| slug | 英語名 | name_ja | 備考 |
|------|--------|---------|------|
| leinster | Leinster | レンスター | IRL |
| munster | Munster | マンスター | IRL |
| ulster | Ulster | アルスター | IRL |
| connacht | Connacht | コノート | Owner 確定（どちらでも→コノート採用） |
| cardiff | Cardiff Rugby | カーディフ | WAL |
| dragons | Dragons | ドラゴンズ | WAL |
| ospreys | Ospreys | オスプレイズ | WAL |
| scarlets | Scarlets | スカーレッツ | WAL |
| edinburgh | Edinburgh | エディンバラ | SCO |
| glasgow-warriors | Glasgow Warriors | グラスゴー・ウォリアーズ | SCO |
| benetton | Benetton | ベネトン | ITA（ベネトン・トレヴィーゾ） |
| zebre | Zebre Parma | ゼブレ・パルマ | ITA（短縮「ゼブレ」） |
| bulls | Bulls | ブルズ | ZAF |
| lions | Lions | ライオンズ | ZAF（エミレーツ・ライオンズ） |
| sharks | Sharks | シャークス | ZAF |
| stormers | Stormers | ストーマーズ | ZAF |

---

## Top 14（15件・フランス、主表記＝短縮形）

| slug | 英語名（正式） | name_ja | 正式名（備考） |
|------|--------|---------|---------|
| toulouse | Stade Toulousain | トゥールーズ | スタッド・トゥールーザン |
| bordeaux-begles | Union Bordeaux Bègles | ボルドー | ユニオン・ボルドー・ベグル |
| la-rochelle | Stade Rochelais | ラ・ロシェル | スタッド・ロシュレ |
| clermont | ASM Clermont Auvergne | クレルモン | ASMクレルモン・オーヴェルニュ |
| racing-92 | Racing 92 | ラシン92 | |
| toulon | RC Toulon | トゥーロン | RCトゥーロン |
| stade-francais | Stade Français | スタッド・フランセ | |
| lyon | Lyon OU | リヨン | リヨンOU |
| montpellier | Montpellier Hérault Rugby | モンペリエ | モンペリエ・エロー・ラグビー |
| castres | Castres Olympique | カストル | カストル・オランピック |
| bayonne | Aviron Bayonnais | バイヨンヌ | アビロン・バイヨネ |
| pau | Section Paloise | ポー | セクシオン・パロワーズ |
| perpignan | USA Perpignan | ペルピニャン | |
| vannes | RC Vannes | ヴァンヌ | Owner 確定（どちらでも→ヴァンヌ採用） |
| grenoble | FC Grenoble | グルノーブル | FCグルノーブル |

---

## 大会名（family 単位）

| family | name_ja | 備考 |
|--------|---------|------|
| six-nations | シックスネイションズ | |
| super-rugby-pacific | スーパーラグビー・パシフィック | 短縮「スーパーラグビー」 |
| premiership | プレミアシップ | |
| urc | ユナイテッド・ラグビー・チャンピオンシップ | 略称 URC を併記推奨（検索は URC 優勢） |
| top-14 | トップ14 | |
| rugby-championship | ザ・ラグビーチャンピオンシップ | 短縮「ラグビーチャンピオンシップ」 |
| autumn-nations | オータムネーションズシリーズ | ⚠ 「秋の国際テストマッチ」とも |
| pnc / pacific-nations-cup | パシフィック・ネーションズカップ | |
| rwc | ラグビーワールドカップ | |
| league-one | ジャパンラグビー リーグワン | 既存実装済み |

---

## Owner 確認ポイント（⚠ 計7件）
1. ナショナルチームに「代表」を付けるか（`name_ja=イングランド` vs `イングランド代表`）。SEO エイリアス用途は別途。
2. Queensland Reds: 「レッズ」か「クイーンズランド・レッズ」か。
3. Connacht: 「コノート」か「コナハト」か。
4. Newcastle Falcons: 現クラブ名（改称の有無）を要確認。
5. RC Vannes: 「ヴァンヌ」か「バンヌ」か。
6. URC 大会名: フル表記か「URC」併記か。
7. 香港 / アメリカ等の代表表記ゆれ。

## 出典
- [フランス選手権トップ14 - Wikipedia](https://ja.wikipedia.org/wiki/%E3%83%95%E3%83%A9%E3%83%B3%E3%82%B9%E9%81%B8%E6%89%8B%E6%A8%A9%E3%83%88%E3%83%83%E3%83%9714)
- [スタッド・トゥールーザン - Wikipedia](https://ja.wikipedia.org/wiki/%E3%82%B9%E3%82%BF%E3%83%83%E3%83%89%E3%83%BB%E3%83%88%E3%82%A5%E3%83%BC%E3%83%AB%E3%83%BC%E3%82%B6%E3%83%B3)
- [モンペリエ・エロー・ラグビー - Wikipedia](https://ja.wikipedia.org/wiki/%E3%83%A2%E3%83%B3%E3%83%9A%E3%83%AA%E3%82%A8%E3%83%BB%E3%82%A8%E3%83%AD%E3%83%BC%E3%83%BB%E3%83%A9%E3%82%B0%E3%83%93%E3%83%BC)
- [プレミアシップ・ラグビー - Wikipedia](https://ja.wikipedia.org/wiki/%E3%83%97%E3%83%AC%E3%83%9F%E3%82%A2%E3%82%B7%E3%83%83%E3%83%97%E3%83%BB%E3%83%A9%E3%82%B0%E3%83%93%E3%83%BC)
- [ユナイテッド・ラグビー・チャンピオンシップ - Wikipedia](https://ja.wikipedia.org/wiki/%E3%83%A6%E3%83%8A%E3%82%A4%E3%83%86%E3%83%83%E3%83%89%E3%83%BB%E3%83%A9%E3%82%B0%E3%83%93%E3%83%BC%E3%83%BB%E3%83%81%E3%83%A3%E3%83%B3%E3%83%94%E3%82%AA%E3%83%B3%E3%82%B7%E3%83%83%E3%83%97)
- [ラグビーリパブリック TOP14 記事](https://rugby-rp.com/2024/07/01/abroad/115648) / [J SPORTS TOP14](https://news.jsports.co.jp/rugby/article/20190310220101/)
