alter table public.users
  add column if not exists email_verified boolean not null default false,
  add column if not exists email_verified_at timestamptz,
  add column if not exists email_verification_token_hash text,
  add column if not exists email_verification_sent_at timestamptz,
  add column if not exists email_verification_expires_at timestamptz;

update public.users as public_users
set
  email_verified = auth_users.email_confirmed_at is not null,
  email_verified_at = coalesce(public_users.email_verified_at, auth_users.email_confirmed_at)
from auth.users as auth_users
where auth_users.id = public_users.id;

create index if not exists users_email_verification_token_hash_idx
  on public.users (email_verification_token_hash)
  where email_verification_token_hash is not null;

create or replace function public.sync_auth_user_email_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_role public.user_role := case coalesce(new.raw_user_meta_data ->> 'role', new.raw_app_meta_data ->> 'role')
    when 'admin' then 'admin'::public.user_role
    when 'employee' then 'employee'::public.user_role
    else 'customer'::public.user_role
  end;
  normalized_name text := nullif(
    trim(
      coalesce(
        new.raw_user_meta_data ->> 'full_name',
        new.raw_user_meta_data ->> 'name',
        concat_ws(
          ' ',
          new.raw_user_meta_data ->> 'first_name',
          new.raw_user_meta_data ->> 'middle_name',
          new.raw_user_meta_data ->> 'last_name'
        )
      )
    ),
    ''
  );
begin
  insert into public.users (
    id,
    name,
    email,
    role,
    email_verified,
    email_verified_at
  )
  values (
    new.id,
    coalesce(normalized_name, split_part(coalesce(new.email, ''), '@', 1), 'Customer'),
    lower(coalesce(new.email, '')),
    normalized_role,
    new.email_confirmed_at is not null,
    new.email_confirmed_at
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(nullif(public.users.name, ''), excluded.name),
    role = coalesce(public.users.role, excluded.role),
    email_verified = excluded.email_verified,
    email_verified_at = case
      when excluded.email_verified then coalesce(public.users.email_verified_at, excluded.email_verified_at)
      else public.users.email_verified_at
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_verification on auth.users;

create trigger on_auth_user_email_verification
after insert or update of email, email_confirmed_at
on auth.users
for each row
execute function public.sync_auth_user_email_verification();
