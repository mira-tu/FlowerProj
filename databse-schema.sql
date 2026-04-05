-- Enum Types
CREATE TYPE user_role AS ENUM ('customer', 'admin', 'employee');
CREATE TYPE payment_status AS ENUM ('to_pay', 'waiting_for_confirmation', 'paid', 'partial', 'failed');
CREATE TYPE refund_status AS ENUM ('requested', 'approved', 'gcash_submitted', 'processing', 'refunded', 'rejected');
CREATE TYPE delivery_method AS ENUM ('delivery', 'pickup');
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'claimed', 'cancelled');
CREATE TYPE request_type AS ENUM ('booking', 'customized', 'special_order');
CREATE TYPE request_status AS ENUM ('pending', 'quoted', 'accepted', 'processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'claimed', 'declined', 'cancelled');
CREATE TYPE stock_reservation_scope AS ENUM ('flower', 'wrapper', 'ribbon', 'other');
CREATE TYPE stock_reservation_status AS ENUM ('reserved', 'consumed', 'released');

-- Users and Authentication
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  middle_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  birthdate DATE,
  gender VARCHAR(50),
  role user_role NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE addresses (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  label VARCHAR(50) NOT NULL, -- e.g., 'Home', 'Office'
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  street VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  zip VARCHAR(10) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Product Catalog
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2),
  discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
  discounted_price DECIMAL(10, 2),
  category_id INT,
  image_url VARCHAR(255),
  stock_quantity INT NOT NULL DEFAULT 0,
  is_free_shipping BOOLEAN NOT NULL DEFAULT FALSE,
  free_shipping_min_order_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE stock_products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  quantity INT NOT NULL DEFAULT 0,
  unit VARCHAR(50),
  reorder_level INT NOT NULL DEFAULT 10,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  preview_image_url TEXT,
  layer_image_url TEXT,
  stem_image_url TEXT,
  wrapper_group_name VARCHAR(255),
  wrapper_color VARCHAR(255),
  ribbon_scope VARCHAR(255),
  customization_config JSONB,
  wrapper_behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);


-- Customer Interactions
CREATE TABLE wishlist (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE(user_id, product_id)
);

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL,
  user_id UUID NOT NULL,
  rating SMALLINT NOT NULL, -- 1 to 5
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Orders and Checkout
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  address_id INT,
  subtotal DECIMAL(10, 2) NOT NULL,
  shipping_fee DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  payment_status payment_status NOT NULL,
  delivery_method delivery_method NOT NULL,
  pickup_time VARCHAR(50),
  receipt_url VARCHAR(255),
  additional_receipts JSONB NOT NULL DEFAULT '[]'::jsonb,
  amount_received DECIMAL(10, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  cancellation_reason TEXT,
  status_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_rider UUID,
  third_party_rider_name VARCHAR(255),
  third_party_rider_info TEXT,
  status order_status NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id)
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  name VARCHAR(255) NOT NULL, -- Denormalized for historical record
  price DECIMAL(10, 2) NOT NULL, -- Denormalized
  quantity INT NOT NULL,
  image_url VARCHAR(255),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Special Requests (Bookings, Customized, Special Orders)
CREATE TABLE requests (
  id SERIAL PRIMARY KEY,
  request_number VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  type request_type NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  data JSONB NOT NULL, -- Stores all form fields specific to the request type
  contact_number VARCHAR(20),
  image_url VARCHAR(255),
  photo_url VARCHAR(255),
  notes TEXT,
  cancellation_reason TEXT,
  estimated_price DECIMAL(10, 2),
  final_price DECIMAL(10, 2),
  shipping_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  delivery_method delivery_method,
  pickup_time VARCHAR(80),
  payment_method VARCHAR(50),
  payment_status payment_status NOT NULL DEFAULT 'to_pay',
  receipt_url VARCHAR(255),
  additional_receipts JSONB NOT NULL DEFAULT '[]'::jsonb,
  amount_received DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_rider UUID,
  third_party_rider_name VARCHAR(255),
  third_party_rider_info TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE stock_reservations (
  id BIGSERIAL PRIMARY KEY,
  request_id INT NOT NULL,
  stock_product_id INT NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  scope stock_reservation_scope NOT NULL DEFAULT 'other',
  status stock_reservation_status NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (stock_product_id) REFERENCES stock_products(id) ON DELETE CASCADE
);

-- System and App Content
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  type VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(255),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  order_id INT,
  request_id INT,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (request_id) REFERENCES requests(id),
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE app_content (
  id SERIAL PRIMARY KEY,
  key VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'about_story', 'contact_phone'
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

create or replace function get_admin_conversations()
returns table (
    user_id uuid,
    user_name text,
    last_message text,
    last_message_at timestamptz,
    unread_count bigint
) as 
begin
    return query
    with admin_user as (
        select id
        from users
        where role = 'admin'
        order by created_at asc
        limit 1
    ),
    message_partners as (
        select
            case
                when sender_id = admin_user.id then receiver_id
                else sender_id
            end as partner_id,
            id,
            message,
            created_at,
            is_read
        from messages
        cross join admin_user
        where sender_id = admin_user.id or receiver_id = admin_user.id
    ),
    ranked_messages as (
        select
            partner_id,
            message,
            created_at,
            is_read,
            row_number() over(partition by partner_id order by created_at desc) as rn
        from message_partners
    )
    select
        u.id as user_id,
        u.name as user_name,
        rm.message as last_message,
        rm.created_at as last_message_at,
        (
            select count(*)
            from admin_user
            cross join messages
            where receiver_id = admin_user.id
              and sender_id = u.id
              and not is_read
        ) as unread_count
    from ranked_messages rm
    join users u on u.id = rm.partner_id
    where rm.rn = 1
    order by rm.created_at desc;
end;
 language plpgsql;
 
-- Sales Table and Triggers
CREATE TABLE sales (
  id SERIAL PRIMARY KEY,
  order_id INT UNIQUE,
  request_id INT UNIQUE,
  user_id UUID NOT NULL,
  sale_date TIMESTAMPTZ NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_sale_source CHECK (order_id IS NOT NULL OR request_id IS NOT NULL)
);

CREATE INDEX idx_sales_sale_date ON sales(sale_date);

CREATE OR REPLACE FUNCTION record_order_sale()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IN ('completed', 'claimed') AND (OLD.status IS NULL OR OLD.status NOT IN ('completed', 'claimed'))) THEN
        INSERT INTO sales (order_id, user_id, sale_date, total_amount)
        VALUES (NEW.id, NEW.user_id, NOW(), NEW.total)
        ON CONFLICT (order_id) DO UPDATE 
        SET total_amount = EXCLUDED.total_amount, sale_date = EXCLUDED.sale_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_complete
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE PROCEDURE record_order_sale();

CREATE OR REPLACE FUNCTION record_request_sale()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') AND NEW.final_price > 0) THEN
        INSERT INTO sales (request_id, user_id, sale_date, total_amount)
        VALUES (NEW.id, NEW.user_id, NOW(), NEW.final_price)
        ON CONFLICT (request_id) DO UPDATE 
        SET total_amount = EXCLUDED.total_amount, sale_date = EXCLUDED.sale_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_request_complete
AFTER UPDATE ON requests
FOR EACH ROW
EXECUTE PROCEDURE record_request_sale();

CREATE OR REPLACE FUNCTION sync_product_discount_fields()
RETURNS TRIGGER AS $$
DECLARE
  base_price NUMERIC(10, 2);
  safe_discount NUMERIC(5, 2);
BEGIN
  base_price := COALESCE(NEW.original_price, NEW.price, 0);
  safe_discount := GREATEST(0, LEAST(100, COALESCE(NEW.discount_percentage, 0)));

  NEW.price := ROUND(base_price::NUMERIC, 2);
  NEW.original_price := NEW.price;
  NEW.discount_percentage := safe_discount;
  NEW.discounted_price := ROUND((NEW.price * (1 - (safe_discount / 100.0)))::NUMERIC, 2);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_product_discount_fields_trigger
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE PROCEDURE sync_product_discount_fields();

CREATE OR REPLACE FUNCTION set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_stock_products_update
BEFORE UPDATE ON stock_products
FOR EACH ROW
EXECUTE PROCEDURE set_current_timestamp_updated_at();

CREATE TRIGGER on_stock_reservations_update
BEFORE UPDATE ON stock_reservations
FOR EACH ROW
EXECUTE PROCEDURE set_current_timestamp_updated_at();

CREATE TRIGGER on_products_update_touch
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE PROCEDURE set_current_timestamp_updated_at();

CREATE OR REPLACE FUNCTION sync_request_stock_reservations()
RETURNS TRIGGER AS $$
DECLARE
  transition_to_released BOOLEAN := TG_OP = 'UPDATE' AND NEW.status IN ('cancelled', 'declined');
  transition_to_consumed BOOLEAN := TG_OP = 'UPDATE' AND NEW.status IN ('processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'claimed');
BEGIN
  IF TG_OP = 'INSERT' AND NEW.type <> 'customized' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    WITH item_source AS (
      SELECT
        item,
        ROW_NUMBER() OVER () AS item_index
      FROM jsonb_array_elements(COALESCE(NEW.data->'items', '[]'::jsonb)) AS item
    ),
    flower_distribution AS (
      SELECT
        (flower_item->>'id')::BIGINT AS stock_product_id,
        CASE
          WHEN flower_count = 0 OR bundle_size <= 0 THEN 0
          ELSE (bundle_size / flower_count)
            + CASE WHEN flower_position <= (bundle_size % flower_count) THEN 1 ELSE 0 END
        END AS quantity,
        'flower'::stock_reservation_scope AS scope
      FROM (
        SELECT
          item,
          COALESCE(NULLIF(item->>'bundleSize', '')::INTEGER, 0) AS bundle_size,
          flower_item,
          ROW_NUMBER() OVER (PARTITION BY item_index) AS flower_position,
          COUNT(*) OVER (PARTITION BY item_index) AS flower_count
        FROM item_source
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item->'flowers', '[]'::jsonb)) AS flower_item
        WHERE jsonb_typeof(COALESCE(item->'flowers', '[]'::jsonb)) = 'array'
      ) distributed
      WHERE flower_item ? 'id'
        AND COALESCE(flower_item->>'id', '') ~ '^[0-9]+$'
    ),
    explicit_flower_breakdown AS (
      SELECT
        COALESCE(
          NULLIF(breakdown_item->>'stock_product_id', '')::BIGINT,
          NULLIF(breakdown_item->>'flowerId', '')::BIGINT,
          NULLIF(breakdown_item->>'id', '')::BIGINT
        ) AS stock_product_id,
        COALESCE(
          NULLIF(breakdown_item->>'quantity', '')::INTEGER,
          NULLIF(breakdown_item->>'stems', '')::INTEGER,
          0
        ) AS quantity,
        'flower'::stock_reservation_scope AS scope
      FROM item_source
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item->'flowerStemBreakdown', item->'flowerAllocations', '[]'::jsonb)) AS breakdown_item
      WHERE jsonb_typeof(COALESCE(item->'flowerStemBreakdown', item->'flowerAllocations', '[]'::jsonb)) = 'array'
        AND (
          COALESCE(breakdown_item->>'stock_product_id', '') ~ '^[0-9]+$'
          OR COALESCE(breakdown_item->>'flowerId', '') ~ '^[0-9]+$'
          OR COALESCE(breakdown_item->>'id', '') ~ '^[0-9]+$'
        )
    ),
    wrapper_and_ribbon AS (
      SELECT
        NULLIF(item->'wrapper'->>'id', '')::BIGINT AS stock_product_id,
        1 AS quantity,
        'wrapper'::stock_reservation_scope AS scope
      FROM item_source
      WHERE COALESCE(item->'wrapper'->>'id', '') ~ '^[0-9]+$'
      UNION ALL
      SELECT
        NULLIF(item->'ribbon'->>'id', '')::BIGINT AS stock_product_id,
        1 AS quantity,
        'ribbon'::stock_reservation_scope AS scope
      FROM item_source
      WHERE COALESCE(item->'ribbon'->>'id', '') ~ '^[0-9]+$'
    ),
    raw_reservations AS (
      SELECT stock_product_id, quantity, scope
      FROM explicit_flower_breakdown
      WHERE stock_product_id IS NOT NULL AND quantity > 0
      UNION ALL
      SELECT stock_product_id, quantity, scope
      FROM flower_distribution
      WHERE stock_product_id IS NOT NULL
        AND quantity > 0
        AND NOT EXISTS (
          SELECT 1
          FROM explicit_flower_breakdown explicit_rows
          WHERE explicit_rows.stock_product_id = flower_distribution.stock_product_id
        )
      UNION ALL
      SELECT stock_product_id, quantity, scope
      FROM wrapper_and_ribbon
      WHERE stock_product_id IS NOT NULL AND quantity > 0
    ),
    aggregated_reservations AS (
      SELECT
        stock_product_id,
        SUM(quantity)::INTEGER AS quantity,
        scope
      FROM raw_reservations
      GROUP BY stock_product_id, scope
    ),
    inserted_reservations AS (
      INSERT INTO stock_reservations (request_id, stock_product_id, quantity, scope, status)
      SELECT
        NEW.id,
        stock_product_id,
        quantity,
        scope,
        'reserved'
      FROM aggregated_reservations
      RETURNING stock_product_id, quantity
    ),
    reservation_totals AS (
      SELECT stock_product_id, SUM(quantity)::INTEGER AS quantity
      FROM inserted_reservations
      GROUP BY stock_product_id
    )
    UPDATE stock_products stock
    SET
      quantity = GREATEST(0, COALESCE(stock.quantity, 0) - reservation_totals.quantity),
      updated_at = NOW()
    FROM reservation_totals
    WHERE stock.id = reservation_totals.stock_product_id;

    RETURN NEW;
  END IF;

  IF transition_to_released THEN
    WITH released_reservations AS (
      UPDATE stock_reservations
      SET
        status = 'released',
        updated_at = NOW()
      WHERE request_id = NEW.id
        AND status = 'reserved'
      RETURNING stock_product_id, quantity
    ),
    release_totals AS (
      SELECT stock_product_id, SUM(quantity)::INTEGER AS quantity
      FROM released_reservations
      GROUP BY stock_product_id
    )
    UPDATE stock_products stock
    SET
      quantity = COALESCE(stock.quantity, 0) + release_totals.quantity,
      updated_at = NOW()
    FROM release_totals
    WHERE stock.id = release_totals.stock_product_id;

    RETURN NEW;
  END IF;

  IF transition_to_consumed THEN
    UPDATE stock_reservations
    SET
      status = 'consumed',
      updated_at = NOW()
    WHERE request_id = NEW.id
      AND status = 'reserved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER requests_sync_stock_reservations_after_insert
AFTER INSERT ON requests
FOR EACH ROW
EXECUTE PROCEDURE sync_request_stock_reservations();

CREATE TRIGGER requests_sync_stock_reservations_after_update
AFTER UPDATE OF status ON requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE PROCEDURE sync_request_stock_reservations();

CREATE OR REPLACE FUNCTION apply_request_stock_allocations(
  p_request_id BIGINT,
  p_allocations JSONB DEFAULT '[]'::jsonb,
  p_mode TEXT DEFAULT 'reserve'
)
RETURNS JSONB AS $$
DECLARE
  v_request RECORD;
  v_request_data JSONB;
  v_mode TEXT := LOWER(COALESCE(p_mode, 'reserve'));
  v_allocations JSONB := '[]'::jsonb;
  v_allocation RECORD;
  v_applied_count INTEGER := 0;
  v_available_quantity INTEGER;
  v_scope stock_reservation_scope;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Request id is required for stock allocation.';
  END IF;

  IF v_mode NOT IN ('reserve', 'release') THEN
    RAISE EXCEPTION 'Unsupported stock allocation mode: %', v_mode;
  END IF;

  SELECT id, data
  INTO v_request
  FROM requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % was not found.', p_request_id;
  END IF;

  v_request_data := COALESCE(v_request.data, '{}'::jsonb);

  IF jsonb_typeof(p_allocations) = 'array' AND jsonb_array_length(p_allocations) > 0 THEN
    v_allocations := p_allocations;
  ELSIF jsonb_typeof(v_request_data -> 'stock_allocations') = 'array' THEN
    v_allocations := v_request_data -> 'stock_allocations';
  END IF;

  IF v_mode = 'reserve' THEN
    IF EXISTS (
      SELECT 1
      FROM stock_reservations
      WHERE request_id = p_request_id
        AND status = 'reserved'
    ) THEN
      RETURN jsonb_build_object(
        'success', true,
        'mode', v_mode,
        'request_id', p_request_id,
        'allocations', v_allocations,
        'applied_count', 0
      );
    END IF;

    FOR v_allocation IN
      SELECT
        NULLIF(entry ->> 'stock_product_id', '')::BIGINT AS stock_product_id,
        GREATEST(COALESCE(NULLIF(entry ->> 'quantity', '')::INTEGER, 0), 0) AS quantity,
        LOWER(COALESCE(NULLIF(entry ->> 'scope', ''), NULLIF(entry ->> 'reservation_kind', ''), 'other')) AS scope
      FROM jsonb_array_elements(v_allocations) entry
      WHERE COALESCE(entry ->> 'stock_product_id', '') ~ '^[0-9]+$'
    LOOP
      IF v_allocation.stock_product_id IS NULL OR v_allocation.quantity <= 0 THEN
        CONTINUE;
      END IF;

      v_scope := CASE v_allocation.scope
        WHEN 'flower' THEN 'flower'::stock_reservation_scope
        WHEN 'wrapper' THEN 'wrapper'::stock_reservation_scope
        WHEN 'ribbon' THEN 'ribbon'::stock_reservation_scope
        ELSE 'other'::stock_reservation_scope
      END;

      SELECT quantity
      INTO v_available_quantity
      FROM stock_products
      WHERE id = v_allocation.stock_product_id
      FOR UPDATE;

      IF v_available_quantity IS NULL THEN
        RAISE EXCEPTION 'Stock item % was not found.', v_allocation.stock_product_id;
      END IF;

      IF v_available_quantity < v_allocation.quantity THEN
        RAISE EXCEPTION 'Not enough stock for stock item %.', v_allocation.stock_product_id;
      END IF;

      INSERT INTO stock_reservations (request_id, stock_product_id, quantity, scope, status)
      VALUES (p_request_id, v_allocation.stock_product_id, v_allocation.quantity, v_scope, 'reserved');

      UPDATE stock_products
      SET
        quantity = quantity - v_allocation.quantity,
        updated_at = NOW()
      WHERE id = v_allocation.stock_product_id;

      v_applied_count := v_applied_count + 1;
    END LOOP;
  ELSE
    WITH released_reservations AS (
      UPDATE stock_reservations
      SET
        status = 'released',
        updated_at = NOW()
      WHERE request_id = p_request_id
        AND status = 'reserved'
      RETURNING stock_product_id, quantity
    ),
    release_totals AS (
      SELECT stock_product_id, SUM(quantity)::INTEGER AS quantity
      FROM released_reservations
      GROUP BY stock_product_id
    )
    UPDATE stock_products stock
    SET
      quantity = COALESCE(stock.quantity, 0) + release_totals.quantity,
      updated_at = NOW()
    FROM release_totals
    WHERE stock.id = release_totals.stock_product_id;

    GET DIAGNOSTICS v_applied_count = ROW_COUNT;
  END IF;

  UPDATE requests
  SET data = v_request_data || jsonb_build_object(
    'stock_allocations', v_allocations,
    'stock_allocation_status', CASE WHEN v_mode = 'reserve' THEN 'reserved' ELSE 'released' END,
    'stock_allocation_updated_at', NOW()
  )
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'mode', v_mode,
    'request_id', p_request_id,
    'allocations', v_allocations,
    'applied_count', v_applied_count
  );
END;
$$ LANGUAGE plpgsql;

-- Refund Requests
CREATE TABLE refund_requests (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL, -- 'order' or 'request'
  order_id INT,
  request_id INT,
  customer_id UUID NOT NULL,
  status refund_status NOT NULL DEFAULT 'requested',
  refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  customer_reason TEXT NOT NULL,
  admin_note TEXT,
  rejection_reason TEXT,
  gcash_name VARCHAR(255),
  gcash_number VARCHAR(20),
  refund_reference VARCHAR(255),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  gcash_submitted_at TIMESTAMPTZ,
  processing_started_by UUID,
  processing_started_at TIMESTAMPTZ,
  processed_by UUID,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE
);
