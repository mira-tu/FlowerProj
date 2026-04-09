create table if not exists public.auth_login_attempts (
  id text primary key,
  email_hash text not null,
  failure_count integer not null default 0 check (failure_count >= 0),
  first_failed_at timestamptz,
  last_failed_at timestamptz,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_login_attempts_email_hash_idx
  on public.auth_login_attempts (email_hash);

create index if not exists auth_login_attempts_blocked_until_idx
  on public.auth_login_attempts (blocked_until);

alter table public.auth_login_attempts enable row level security;

revoke all on public.auth_login_attempts from anon;
revoke all on public.auth_login_attempts from authenticated;

create or replace function public.set_auth_login_attempts_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists auth_login_attempts_set_updated_at on public.auth_login_attempts;

create trigger auth_login_attempts_set_updated_at
before update on public.auth_login_attempts
for each row
execute procedure public.set_auth_login_attempts_updated_at();
