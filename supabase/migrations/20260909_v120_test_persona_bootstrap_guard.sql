-- NEXUS V1 one-time fictional test persona bootstrap guard.
-- Applied to the shared Camarillo Darts Nexus Supabase project on 2026-09-09.

create extension if not exists http with schema extensions;

create table if not exists public.nexus_bootstrap_jobs (
  id text primary key,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending','used','disabled')),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.nexus_bootstrap_jobs enable row level security;
revoke all on public.nexus_bootstrap_jobs from anon, authenticated;

-- No reusable bootstrap token is committed. Production provisioning generates
-- a one-time token in-database, stores only its SHA-256 hash, and marks the job
-- used immediately after the fictional personas are provisioned.
