-- FCC2026 Gimmick Supabase setup
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.fcc2026_gimmick_state (
  session_id text primary key,
  status text not null default 'idle' check (status in ('idle','armed','listening','initiated','completed','ignored','reset')),
  active_command_id uuid,
  last_transcript text,
  last_action text,
  updated_at timestamptz not null default now()
);

create table if not exists public.fcc2026_gimmick_commands (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  transcript text,
  normalized_transcript text,
  action text not null check (action in ('ARM','LISTENING','PLAY_INIT_VIDEO','RESET','IGNORED','TRANSCRIPT')),
  safety_status text not null check (safety_status in ('ALLOWED','REJECTED','SYSTEM')),
  source text not null default 'stage',
  created_at timestamptz not null default now()
);

insert into public.fcc2026_gimmick_state (session_id, status)
values ('fcc2026-main-stage', 'idle')
on conflict (session_id) do nothing;

alter table public.fcc2026_gimmick_state enable row level security;
alter table public.fcc2026_gimmick_commands enable row level security;

-- Public read is needed so GitHub Pages clients can watch Realtime updates.
-- No public insert/update/delete policies are created. Writes should go through the Edge Function only.
drop policy if exists "Public can read gimmick state" on public.fcc2026_gimmick_state;
create policy "Public can read gimmick state"
on public.fcc2026_gimmick_state
for select
to anon
using (true);

drop policy if exists "Public can read gimmick commands" on public.fcc2026_gimmick_commands;
create policy "Public can read gimmick commands"
on public.fcc2026_gimmick_commands
for select
to anon
using (true);

-- Enable Realtime for the command table.
-- If Supabase says the table is already in the publication, ignore that message.
alter table public.fcc2026_gimmick_commands replica identity full;
alter publication supabase_realtime add table public.fcc2026_gimmick_commands;
