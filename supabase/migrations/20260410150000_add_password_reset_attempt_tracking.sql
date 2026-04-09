create table if not exists public.password_reset_attempts (
  id text primary key,
  email_hash text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz,
  last_attempt_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists password_reset_attempts_email_hash_idx
  on public.password_reset_attempts (email_hash);

create index if not exists password_reset_attempts_cooldown_until_idx
  on public.password_reset_attempts (cooldown_until);

create index if not exists password_reset_attempts_window_started_at_idx
  on public.password_reset_attempts (window_started_at);

alter table public.password_reset_attempts enable row level security;

revoke all on public.password_reset_attempts from anon;
revoke all on public.password_reset_attempts from authenticated;

create or replace function public.set_password_reset_attempts_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists password_reset_attempts_set_updated_at on public.password_reset_attempts;

create trigger password_reset_attempts_set_updated_at
before update on public.password_reset_attempts
for each row
execute procedure public.set_password_reset_attempts_updated_at();
