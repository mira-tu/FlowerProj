alter table public.users
  add column if not exists first_name varchar(100),
  add column if not exists middle_name varchar(100),
  add column if not exists last_name varchar(100),
  add column if not exists birthdate date,
  add column if not exists gender varchar(50);

with parsed_names as (
  select
    id,
    regexp_split_to_array(trim(coalesce(name, '')), '\s+') as parts
  from public.users
)
update public.users as users
set
  first_name = coalesce(
    nullif(users.first_name, ''),
    nullif(parsed_names.parts[1], '')
  ),
  middle_name = coalesce(
    nullif(users.middle_name, ''),
    case
      when array_length(parsed_names.parts, 1) > 2
        then array_to_string(parsed_names.parts[2:array_length(parsed_names.parts, 1) - 1], ' ')
      else null
    end
  ),
  last_name = coalesce(
    nullif(users.last_name, ''),
    case
      when array_length(parsed_names.parts, 1) > 1
        then parsed_names.parts[array_length(parsed_names.parts, 1)]
      else null
    end
  )
from parsed_names
where users.id = parsed_names.id;
