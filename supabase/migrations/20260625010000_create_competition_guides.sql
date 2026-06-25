create table public.competition_guides (
  family text primary key,
  guide_ja text not null,
  updated_at timestamptz not null default now()
);

alter table public.competition_guides enable row level security;

create policy "competition_guides are publicly readable"
  on public.competition_guides for select using (true);

-- 全件 null のため安全に削除
alter table public.competitions drop column if exists viewing_guide_ja;
