-- Safe order history cleanup for FlowerProj
--
-- This script deletes only order/request transactional data while preserving
-- users, products, categories, and app content.
--
-- Covers:
--   1) Product catalogue orders (`orders` + `order_items`)
--   2) Special orders (`requests.type = 'special_order'`)
--   3) Customized bouquet requests (`requests.type = 'customized'`)
--   4) Event booking requests (`requests.type = 'booking'`)
--
-- How to use in Supabase SQL editor:
--   - Run the entire script once as-is and REVIEW the returned summary.
--   - If everything is correct, change the final ROLLBACK; to COMMIT;
--   - Run again to apply permanently.

BEGIN;

-- 0) Pre-check counts (so you can see what will be removed)
SELECT
  (SELECT COUNT(*) FROM orders)                                                   AS orders_count,
  (SELECT COUNT(*) FROM order_items)                                              AS order_items_count,
  (SELECT COUNT(*) FROM requests WHERE type IN ('booking','customized','special_order')) AS requests_count,
  (SELECT COUNT(*) FROM messages WHERE order_id IS NOT NULL OR request_id IS NOT NULL)    AS messages_count,
  (SELECT COUNT(*) FROM notifications WHERE link = '/my-orders')                  AS notifications_count,
  (SELECT COUNT(*) FROM sales WHERE order_id IS NOT NULL OR request_id IS NOT NULL)       AS sales_count;

-- 1) Delete dependent messages first
DELETE FROM messages
WHERE order_id IN (SELECT id FROM orders)
   OR request_id IN (
      SELECT id FROM requests WHERE type IN ('booking','customized','special_order')
   );

-- 2) Delete app notifications related to order/request updates
DELETE FROM notifications
WHERE link = '/my-orders';

-- 3) Remove sales records tied to orders/requests
DELETE FROM sales
WHERE order_id IN (SELECT id FROM orders)
   OR request_id IN (
      SELECT id FROM requests WHERE type IN ('booking','customized','special_order')
   );

-- 4) Remove request records (special/customized/booking)
DELETE FROM requests
WHERE type IN ('booking','customized','special_order');

-- 5) Remove catalogue orders (order_items will be deleted by FK cascade)
DELETE FROM orders;

-- 6) Post-check summary
SELECT
  (SELECT COUNT(*) FROM orders)                                                   AS remaining_orders,
  (SELECT COUNT(*) FROM order_items)                                              AS remaining_order_items,
  (SELECT COUNT(*) FROM requests WHERE type IN ('booking','customized','special_order')) AS remaining_requests,
  (SELECT COUNT(*) FROM messages WHERE order_id IS NOT NULL OR request_id IS NOT NULL)    AS remaining_messages,
  (SELECT COUNT(*) FROM notifications WHERE link = '/my-orders')                  AS remaining_notifications,
  (SELECT COUNT(*) FROM sales WHERE order_id IS NOT NULL OR request_id IS NOT NULL)       AS remaining_sales;

-- SAFETY MODE: keep rollback by default.
-- Change to COMMIT only after verifying the summaries above.
ROLLBACK;
