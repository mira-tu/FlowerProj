# Safe order history cleanup (no schema changes)

Use `supabase/sql/clear_order_history_safe.sql` to safely remove all user order history from:

- Product catalogue orders (`orders`, `order_items`)
- Event bookings (`requests.type = 'booking'`)
- Customized bouquet requests (`requests.type = 'customized'`)
- Special orders (`requests.type = 'special_order'`)

## Why this is safe

- It runs inside a transaction.
- It starts with pre-check counts.
- It ends with `ROLLBACK` by default, so no permanent change happens unless you intentionally switch to `COMMIT`.
- It does **not** delete users, products, categories, or app content.

## Steps

1. Open **Supabase Dashboard → SQL Editor**.
2. Paste the contents of `clear_order_history_safe.sql`.
3. Run once with default `ROLLBACK` and inspect both summaries.
4. If counts look correct, replace final `ROLLBACK;` with `COMMIT;`.
5. Run again to apply permanently.

## Important note

If your production schema differs from `databse-schema.sql` (extra FKs/triggers/custom tables), run the script with `ROLLBACK` first and check for errors before committing.
