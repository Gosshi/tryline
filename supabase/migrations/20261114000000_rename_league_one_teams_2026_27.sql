-- Preserve team identity and historical match references across the rename.
UPDATE public.teams
SET name = '栃木ホンダヒート',
    name_ja = '栃木ホンダヒート',
    english_name = 'Tochigi Honda Heat'
WHERE slug = 'honda-heat';

UPDATE public.teams
SET name = '東芝ブレイブルーパス武蔵',
    name_ja = '東芝ブレイブルーパス武蔵',
    english_name = 'Toshiba Brave Lupus Musashi'
WHERE slug = 'toshiba-brave-lupus';
