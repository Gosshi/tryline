alter table public.competition_guides
  add column if not exists verified_at timestamptz,
  add column if not exists source_url text;

update public.competition_guides
set
  guide_ja = replace(
    guide_ja,
    '参加チームは20カ国で、予選を勝ち抜いたチームが集結します。',
    '大会は24チーム・52試合の形式で行われ、予選を勝ち抜いたチームが世界一を争います。'
  ),
  updated_at = now()
where family = 'rwc'
  and guide_ja like '%20カ国%';

update public.competition_guides
set
  source_url = 'https://www.rugbyworldcup.com/2027/en',
  verified_at = '2026-07-10T00:00:00+09:00',
  updated_at = now()
where family = 'rwc'
  and guide_ja not like '%20カ国%'
  and guide_ja like '%24チーム%'
  and guide_ja like '%52試合%';

-- Owner verification after applying:
-- select count(*) from public.competition_guides
-- where family = 'rwc' and guide_ja like '%20カ国%';
