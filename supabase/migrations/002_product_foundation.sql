-- Reelish product foundation updates
-- Safe to run after 001_initial.sql.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dietary_pattern text not null default 'omnivore',
  restrictions jsonb not null default '[]'::jsonb,
  allergies jsonb not null default '[]'::jsonb,
  disliked_ingredients jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own"
  on public.user_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
  on public.user_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
  on public.user_profiles for update
  using (auth.uid() = user_id);

-- Saved recipe metadata for creator attribution, convert-later, favorites
alter table public.saved_recipes
  add column if not exists source_platform text,
  add column if not exists creator_handle text,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists converted_at timestamptz;

alter table public.saved_recipes
  alter column personalized_recipe_json drop not null;

-- Keep timestamps fresh on profile updates
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

-- Ensure profile row exists for newly created auth users.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

