-- Preferred language support for multilingual extraction output.
alter table public.user_profiles
  add column if not exists preferred_language text not null default 'en';

