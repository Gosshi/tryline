create table public.youtube_videos (
  video_id text primary key,
  channel_id text not null,
  title text,
  verified_at timestamptz not null,
  can_embed boolean not null default true,
  context jsonb
);

create index youtube_videos_channel_id_idx
  on public.youtube_videos (channel_id);

alter table public.youtube_videos enable row level security;

create policy "youtube videos are publicly readable"
  on public.youtube_videos
  for select
  to anon, authenticated
  using (true);
