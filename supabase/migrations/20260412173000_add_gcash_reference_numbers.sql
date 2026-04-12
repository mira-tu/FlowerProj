alter table if exists public.orders
    add column if not exists gcash_reference_number text;

alter table if exists public.requests
    add column if not exists gcash_reference_number text;
