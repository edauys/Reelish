-- Reelish MVP schema
-- Run this in Supabase SQL Editor or via CLI migrations.
-- Enable RLS on all user tables.

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Saved personalized recipes
create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  source_url text,
  original_recipe_json jsonb not null,
  personalized_recipe_json jsonb not null,
  selected_preferences jsonb not null default '[]'::jsonb,
  selected_goals jsonb not null default '[]'::jsonb,
  substitutions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

create index if not exists saved_recipes_user_id_created_at
  on public.saved_recipes (user_id, created_at desc);

alter table public.saved_recipes enable row level security;

create policy "saved_recipes_select_own"
  on public.saved_recipes for select
  using (auth.uid() = user_id);

create policy "saved_recipes_insert_own"
  on public.saved_recipes for insert
  with check (auth.uid() = user_id);

create policy "saved_recipes_update_own"
  on public.saved_recipes for update
  using (auth.uid() = user_id);

create policy "saved_recipes_delete_own"
  on public.saved_recipes for delete
  using (auth.uid() = user_id);

-- Auto-create profile on signup (optional convenience)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
