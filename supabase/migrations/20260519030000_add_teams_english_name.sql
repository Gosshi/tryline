ALTER TABLE teams ADD COLUMN english_name text;

UPDATE teams SET english_name = 'Kubota Spears Funabashi Tokyo-Bay'                WHERE name = 'クボタスピアーズ船橋・東京ベイ';
UPDATE teams SET english_name = 'Kobelco Kobe Steelers'                            WHERE name = 'コベルコ神戸スティーラーズ';
UPDATE teams SET english_name = 'Toyota Verblitz'                                  WHERE name = 'トヨタヴェルブリッツ';
UPDATE teams SET english_name = 'Ricoh Black Rams Tokyo'                           WHERE name = 'リコーブラックラムズ東京';
UPDATE teams SET english_name = 'Mitsubishi Heavy Industries Sagamihara Dynaboars' WHERE name = '三菱重工相模原ダイナボアーズ';
UPDATE teams SET english_name = 'Mie Honda Heat'                                   WHERE name = '三重ホンダヒート';
UPDATE teams SET english_name = 'Saitama Panasonic Wild Knights'                   WHERE name = '埼玉パナソニックワイルドナイツ';
UPDATE teams SET english_name = 'Tokyo Suntory Sungoliath'                         WHERE name = '東京サントリーサンゴリアス';
UPDATE teams SET english_name = 'Toshiba Brave Lupus Tokyo'                        WHERE name = '東芝ブレイブルーパス東京';
UPDATE teams SET english_name = 'Yokohama Canon Eagles'                            WHERE name = '横浜キヤノンイーグルス';
UPDATE teams SET english_name = 'Urayasu D-Rocks'                                  WHERE name = '浦安D-Rocks';
UPDATE teams SET english_name = 'Shizuoka Blue Revs'                               WHERE name = '静岡ブルーレヴズ';
