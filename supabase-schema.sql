-- AVENOR — Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query → paste → Run

-- 1) Profiles: one row per user, holds subscription status (written only by Stripe webhook via service role)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  stripe_customer_id text,
  plan text not null default 'free',          -- 'free' | 'premium'
  status text not null default 'none',        -- 'none' | 'trialing' | 'active' | 'past_due' | 'canceled'
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- No insert/update policies for users: subscription fields are server-managed.
-- The webhook uses the service role key, which bypasses RLS.

-- 2) User state: the entire AVENOR life record as one JSONB document per user.
--    Last-write-wins sync. Simple, fast, and easy to migrate to normalized
--    tables later when the Family Tier needs row-level sharing.
create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

create policy "Users own their state"
  on public.user_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3) Auto-create a profile row whenever a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Helpful index for the Stripe webhook lookup
create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id);
