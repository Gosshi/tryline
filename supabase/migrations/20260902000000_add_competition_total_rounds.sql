alter table public.competitions add column total_rounds integer;

update public.competitions
set total_rounds = 26
where family = 'top-14' and season = '2026-27';

update public.competitions
set total_rounds = 18
where family = 'urc' and season = '2026-27';

update public.competitions
set total_rounds = 18
where family = 'premiership' and season = '2026-27';
