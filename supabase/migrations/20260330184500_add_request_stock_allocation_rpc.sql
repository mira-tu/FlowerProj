create or replace function public.apply_request_stock_allocations(
  p_request_id bigint,
  p_allocations jsonb default '[]'::jsonb,
  p_mode text default 'reserve'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
  v_request_data jsonb;
  v_mode text := lower(coalesce(p_mode, 'reserve'));
  v_allocations jsonb := '[]'::jsonb;
  v_allocation record;
  v_applied_count integer := 0;
  v_available_quantity integer;
  v_scope stock_reservation_scope;
begin
  if p_request_id is null then
    raise exception 'Request id is required for stock allocation.';
  end if;

  if v_mode not in ('reserve', 'release') then
    raise exception 'Unsupported stock allocation mode: %', v_mode;
  end if;

  select id, data
  into v_request
  from public.requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request % was not found.', p_request_id;
  end if;

  v_request_data := coalesce(v_request.data, '{}'::jsonb);

  if jsonb_typeof(p_allocations) = 'array' and jsonb_array_length(p_allocations) > 0 then
    v_allocations := p_allocations;
  elsif jsonb_typeof(v_request_data -> 'stock_allocations') = 'array' then
    v_allocations := v_request_data -> 'stock_allocations';
  end if;

  if v_mode = 'reserve' then
    if exists (
      select 1
      from public.stock_reservations
      where request_id = p_request_id
        and status = 'reserved'
    ) then
      return jsonb_build_object(
        'success', true,
        'mode', v_mode,
        'request_id', p_request_id,
        'allocations', v_allocations,
        'applied_count', 0
      );
    end if;

    for v_allocation in
      select
        nullif(entry ->> 'stock_product_id', '')::bigint as stock_product_id,
        greatest(coalesce(nullif(entry ->> 'quantity', '')::integer, 0), 0) as quantity,
        lower(coalesce(nullif(entry ->> 'scope', ''), nullif(entry ->> 'reservation_kind', ''), 'other')) as scope
      from jsonb_array_elements(v_allocations) entry
      where coalesce(entry ->> 'stock_product_id', '') ~ '^[0-9]+$'
    loop
      if v_allocation.stock_product_id is null or v_allocation.quantity <= 0 then
        continue;
      end if;

      v_scope := case v_allocation.scope
        when 'flower' then 'flower'::stock_reservation_scope
        when 'wrapper' then 'wrapper'::stock_reservation_scope
        when 'ribbon' then 'ribbon'::stock_reservation_scope
        else 'other'::stock_reservation_scope
      end;

      select quantity
      into v_available_quantity
      from public.stock_products
      where id = v_allocation.stock_product_id
      for update;

      if v_available_quantity is null then
        raise exception 'Stock item % was not found.', v_allocation.stock_product_id;
      end if;

      if v_available_quantity < v_allocation.quantity then
        raise exception 'Not enough stock for stock item %.', v_allocation.stock_product_id;
      end if;

      insert into public.stock_reservations (
        request_id,
        stock_product_id,
        quantity,
        scope,
        status
      )
      values (
        p_request_id,
        v_allocation.stock_product_id,
        v_allocation.quantity,
        v_scope,
        'reserved'
      );

      update public.stock_products
      set
        quantity = quantity - v_allocation.quantity,
        updated_at = now()
      where id = v_allocation.stock_product_id;

      v_applied_count := v_applied_count + 1;
    end loop;
  else
    with released_reservations as (
      update public.stock_reservations
      set
        status = 'released',
        updated_at = now()
      where request_id = p_request_id
        and status = 'reserved'
      returning stock_product_id, quantity
    ),
    release_totals as (
      select stock_product_id, sum(quantity)::integer as quantity
      from released_reservations
      group by stock_product_id
    )
    update public.stock_products stock
    set
      quantity = coalesce(stock.quantity, 0) + release_totals.quantity,
      updated_at = now()
    from release_totals
    where stock.id = release_totals.stock_product_id;

    get diagnostics v_applied_count = row_count;
  end if;

  update public.requests
  set data = v_request_data || jsonb_build_object(
    'stock_allocations', v_allocations,
    'stock_allocation_status', case when v_mode = 'reserve' then 'reserved' else 'released' end,
    'stock_allocation_updated_at', now()
  )
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'mode', v_mode,
    'request_id', p_request_id,
    'allocations', v_allocations,
    'applied_count', v_applied_count
  );
end;
$$;

grant execute on function public.apply_request_stock_allocations(bigint, jsonb, text) to authenticated;
grant execute on function public.apply_request_stock_allocations(bigint, jsonb, text) to service_role;
