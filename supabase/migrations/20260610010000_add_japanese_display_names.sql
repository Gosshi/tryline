ALTER TABLE teams ADD COLUMN IF NOT EXISTS name_ja text;
ALTER TABLE competitions ADD COLUMN IF NOT EXISTS name_ja text;

UPDATE teams
SET name_ja = values.name_ja
FROM (
  VALUES
    ('argentina', 'アルゼンチン'),
    ('australia', 'オーストラリア'),
    ('canada', 'カナダ'),
    ('chile', 'チリ'),
    ('spain', 'スペイン'),
    ('fiji', 'フィジー'),
    ('france', 'フランス'),
    ('england', 'イングランド'),
    ('scotland', 'スコットランド'),
    ('wales', 'ウェールズ'),
    ('georgia', 'ジョージア'),
    ('hong-kong-china', 'ホンコンチャイナ'),
    ('ireland', 'アイルランド'),
    ('italy', 'イタリア'),
    ('japan', '日本'),
    ('namibia', 'ナミビア'),
    ('new-zealand', 'ニュージーランド'),
    ('portugal', 'ポルトガル'),
    ('romania', 'ルーマニア'),
    ('tonga', 'トンガ'),
    ('uruguay', 'ウルグアイ'),
    ('usa', 'アメリカ'),
    ('samoa', 'サモア'),
    ('south-africa', '南アフリカ'),
    ('zimbabwe', 'ジンバブエ'),
    ('blues', 'ブルーズ'),
    ('chiefs', 'チーフス'),
    ('crusaders', 'クルセイダーズ'),
    ('highlanders', 'ハイランダーズ'),
    ('hurricanes', 'ハリケーンズ'),
    ('brumbies', 'ブランビーズ'),
    ('reds', 'クイーンズランド・レッズ'),
    ('waratahs', 'ワラターズ'),
    ('force', 'ウェスタン・フォース'),
    ('rebels', 'メルボルン・レベルズ'),
    ('fijian-drua', 'フィジアン・ドルア'),
    ('moana-pasifika', 'モアナ・パシフィカ'),
    ('bath', 'バース'),
    ('bristol-bears', 'ブリストル・ベアーズ'),
    ('exeter-chiefs', 'エクセター・チーフス'),
    ('gloucester', 'グロスター'),
    ('harlequins', 'ハーレクインズ'),
    ('leicester-tigers', 'レスター・タイガース'),
    ('newcastle-falcons', 'ニューカッスル・ファルコンズ'),
    ('northampton-saints', 'ノーザンプトン・セインツ'),
    ('sale-sharks', 'セール・シャークス'),
    ('saracens', 'サラセンズ'),
    ('leinster', 'レンスター'),
    ('munster', 'マンスター'),
    ('ulster', 'アルスター'),
    ('connacht', 'コノート'),
    ('cardiff', 'カーディフ'),
    ('dragons', 'ドラゴンズ'),
    ('ospreys', 'オスプレイズ'),
    ('scarlets', 'スカーレッツ'),
    ('edinburgh', 'エディンバラ'),
    ('glasgow-warriors', 'グラスゴー・ウォリアーズ'),
    ('benetton', 'ベネトン'),
    ('zebre', 'ゼブレ・パルマ'),
    ('bulls', 'ブルズ'),
    ('lions', 'ライオンズ'),
    ('sharks', 'シャークス'),
    ('stormers', 'ストーマーズ'),
    ('toulouse', 'トゥールーズ'),
    ('bordeaux-begles', 'ボルドー'),
    ('la-rochelle', 'ラ・ロシェル'),
    ('clermont', 'クレルモン'),
    ('racing-92', 'ラシン92'),
    ('toulon', 'トゥーロン'),
    ('stade-francais', 'スタッド・フランセ'),
    ('lyon', 'リヨン'),
    ('montpellier', 'モンペリエ'),
    ('castres', 'カストル'),
    ('bayonne', 'バイヨンヌ'),
    ('pau', 'ポー'),
    ('perpignan', 'ペルピニャン'),
    ('vannes', 'ヴァンヌ'),
    ('grenoble', 'グルノーブル')
) AS values(slug, name_ja)
WHERE teams.slug = values.slug;

UPDATE teams
SET name_ja = name
WHERE name_ja IS NULL
  AND name ~ '[ぁ-んァ-ヶー一-龠]';

UPDATE competitions
SET name_ja = values.name_ja
FROM (
  VALUES
    ('six-nations', 'シックスネイションズ'),
    ('super-rugby-pacific', 'スーパーラグビー・パシフィック'),
    ('premiership', 'プレミアシップ'),
    ('urc', 'ユナイテッド・ラグビー・チャンピオンシップ'),
    ('top-14', 'トップ14'),
    ('rugby-championship', 'ザ・ラグビーチャンピオンシップ'),
    ('autumn-nations', 'オータムネーションズシリーズ'),
    ('pnc', 'パシフィック・ネーションズカップ'),
    ('pacific-nations-cup', 'パシフィック・ネーションズカップ'),
    ('rwc', 'ラグビーワールドカップ'),
    ('league-one', 'ジャパンラグビー リーグワン')
) AS values(family, name_ja)
WHERE competitions.family = values.family;
