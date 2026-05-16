insert into public.teams (slug, name, short_code, country)
values ('chile', 'Chile Cóndores', 'CHI', 'CHL')
on conflict (slug) do nothing;
