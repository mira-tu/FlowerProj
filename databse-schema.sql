-- Enum Types
CREATE TYPE user_role AS ENUM ('customer', 'admin', 'employee');
CREATE TYPE payment_status AS ENUM ('to_pay', 'waiting_for_confirmation', 'paid', 'failed');
CREATE TYPE delivery_method AS ENUM ('delivery', 'pickup');
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled');
CREATE TYPE request_type AS ENUM ('booking', 'customized', 'special_order');
CREATE TYPE request_status AS ENUM ('pending', 'quoted', 'accepted', 'processing', 'completed', 'declined', 'cancelled');

-- Users and Authentication
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role user_role NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE addresses (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
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
  category_id INT,
  image_url VARCHAR(255),
  stock_quantity INT NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);


-- Customer Interactions
CREATE TABLE wishlist (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE(user_id, product_id)
);

CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL,
  user_id INT NOT NULL,
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
  user_id INT NOT NULL,
  address_id INT NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  shipping_fee DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  payment_status payment_status NOT NULL,
  delivery_method delivery_method NOT NULL,
  pickup_time VARCHAR(50),
  receipt_url VARCHAR(255),
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
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Special Requests (Bookings, Customized, Special Orders)
CREATE TABLE requests (
  id SERIAL PRIMARY KEY,
  request_number VARCHAR(50) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  type request_type NOT NULL,
  status request_status NOT NULL DEFAULT 'pending',
  data JSONB NOT NULL, -- Stores all form fields specific to the request type
  contact_number VARCHAR(20),
  photo_url VARCHAR(255),
  notes TEXT,
  final_price DECIMAL(10, 2),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- System and App Content
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
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
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
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
    user_id int,
    user_name text,
    last_message text,
    last_message_at timestamptz,
    unread_count bigint
) as 
begin
    return query
    with message_partners as (
        select
            case
                when sender_id = 1 then receiver_id
                else sender_id
            end as partner_id,
            id,
            message,
            created_at,
            is_read
        from messages
        where sender_id = 1 or receiver_id = 1
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
            from messages
            where (receiver_id = 1 and sender_id = u.id and not is_read)
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
  user_id INT NOT NULL,
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
