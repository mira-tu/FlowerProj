# FlowerForge Database Schema - Technical Reference

**Database**: flowerforge  
**Engine**: MySQL 8.0+ (InnoDB)  
**Character Set**: utf8mb4_unicode_ci  
**Total Tables**: 20  
**Technology Stack**: Node.js + MySQL

---

## Table of Contents

- [Core Tables](#core-tables)
  - [Users & Authentication](#users--authentication)
  - [Addresses](#addresses)
- [Product Management](#product-management)
  - [Categories](#categories)
  - [Products](#products)
- [Shopping & Orders](#shopping--orders)
  - [Cart Items](#cart-items)
  - [Orders](#orders)
  - [Order Items](#order-items)
- [Requests & Inquiries](#requests--inquiries)
  - [Requests](#requests)
  - [Inquiries](#inquiries)
- [User Interactions](#user-interactions)
  - [Wishlists](#wishlists)
  - [Reviews](#reviews)
- [Communication](#communication)
  - [Chat Rooms](#chat-rooms)
  - [Chat Messages](#chat-messages)
 - [Messages (Legacy)](#messages-legacy)
- [Notifications](#notifications)
- [Inventory](#inventory)
  - [Stock](#stock)
- [Content Management](#content-management)
  - [About Content](#about-content)
  - [Team Members](#team-members)
  - [Contact Info](#contact-info)
- [Database Features](#database-features)
  - [Triggers](#triggers)
  - [Views](#views)
  - [Indexes](#indexes)

---

## Core Tables

### Users & Authentication

#### `users`
Customer accounts with authentication and profile information.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique user identifier |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL, INDEXED | User email address |
| `password` | VARCHAR(255) | NOT NULL | Hashed password (bcrypt) |
| `name` | VARCHAR(255) | NOT NULL | Full name |
| `phone` | VARCHAR(20) | NULL | Contact phone number |
| `date_of_birth` | DATE | NULL | Date of birth |
| `avatar_url` | VARCHAR(500) | NULL | Profile picture URL |
| `role` | ENUM | DEFAULT 'customer', INDEXED | Role: customer, admin, employee |
| `is_active` | BOOLEAN | DEFAULT TRUE | Account active status |
| `email_verified` | BOOLEAN | DEFAULT FALSE | Email verification status |
| `last_login` | TIMESTAMP | NULL | Last login timestamp |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Account creation date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Last update timestamp |

**Indexes**: `idx_email`, `idx_role`  
**Relationships**: Referenced by addresses, cart_items, orders, requests, wishlists, reviews, chat_rooms, notifications

---

#### `admins`
Administrator and employee accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Unique admin identifier |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL, INDEXED | Admin email |
| `password` | VARCHAR(255) | NOT NULL | Hashed password |
| `name` | VARCHAR(255) | NOT NULL | Full name |
| `phone` | VARCHAR(20) | NULL | Contact number |
| `avatar_url` | VARCHAR(500) | NULL | Profile picture URL |
| `role` | ENUM | DEFAULT 'employee', INDEXED | Role: admin or employee |
| `is_active` | BOOLEAN | DEFAULT TRUE | Account status |
| `last_login` | TIMESTAMP | NULL | Last login time |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Indexes**: `idx_email`, `idx_role`  
**Relationships**: Referenced by inquiries, notifications  
**Default Admin**: admin@flower.com / pa55w0rd

---

### Addresses

#### `addresses`
User delivery addresses.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Address ID |
| `user_id` | INT | FK → users(id), NOT NULL, INDEXED | Owner user ID |
| `label` | VARCHAR(50) | NULL | Address label (Home, Work) |
| `recipient_name` | VARCHAR(255) | NOT NULL | Recipient full name |
| `phone` | VARCHAR(20) | NOT NULL | Contact phone |
| `street` | VARCHAR(255) | NOT NULL | Street address |
| `barangay` | VARCHAR(100) | NULL | Barangay/District |
| `city` | VARCHAR(100) | NOT NULL | City |
| `province` | VARCHAR(100) | NOT NULL | Province |
| `zip_code` | VARCHAR(10) | NULL | Postal code |
| `is_default` | BOOLEAN | DEFAULT FALSE | Default address flag |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Foreign Keys**: user_id → users(id) ON DELETE CASCADE  
**Indexes**: `idx_user_id`  
**Relationships**: Referenced by orders

---

## Product Management

### Categories

#### `categories`
Product categories (All Souls Day, Get Well Soon, Graduation, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Category ID |
| `name` | VARCHAR(100) | UNIQUE, NOT NULL | Category name |
| `slug` | VARCHAR(100) | UNIQUE, NOT NULL, INDEXED | URL-friendly slug |
| `description` | TEXT | NULL | Category description |
| `image_url` | VARCHAR(500) | NULL | Category image |
| `display_order` | INT | DEFAULT 0 | Sort order |
| `is_active` | BOOLEAN | DEFAULT TRUE | Active status |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Indexes**: `idx_slug`  
**Relationships**: Referenced by products  
**Default Categories**: Sympathy, Graduation, All Souls Day, Valentines, Get Well Soon, Mothers Day

---

### Products

#### `products`
Flower products and arrangements.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Product ID |
| `name` | VARCHAR(255) | NOT NULL, INDEXED | Product name |
| `description` | TEXT | NULL | Product description |
| `price` | DECIMAL(10,2) | NOT NULL | Current price |
| `compare_price` | DECIMAL(10,2) | NULL | Original/compare price |
| `category_id` | INT | FK → categories(id), INDEXED | Category reference |
| `image_url` | VARCHAR(500) | NULL | Main product image |
| `images` | JSON | NULL | Additional images array |
| `stock_quantity` | INT | DEFAULT 0 | Available stock |
| `is_active` | BOOLEAN | DEFAULT TRUE, INDEXED | Product active status |
| `is_featured` | BOOLEAN | DEFAULT FALSE, INDEXED | Featured product flag |
| `tags` | JSON | NULL | Product tags array |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Foreign Keys**: category_id → categories(id) ON DELETE SET NULL  
**Indexes**: `idx_category_id`, `idx_is_active`, `idx_is_featured`, `idx_name`  
**Relationships**: Referenced by cart_items, order_items, wishlists, reviews  
**Auto-Update**: Stock decreases via trigger after order placement

---

## Shopping & Orders

### Cart Items

#### `cart_items`
User shopping cart.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Cart item ID |
| `user_id` | INT | FK → users(id), NOT NULL, INDEXED | User reference |
| `product_id` | INT | FK → products(id), NOT NULL | Product reference |
| `quantity` | INT | NOT NULL, DEFAULT 1 | Item quantity |
| `customization` | JSON | NULL | Custom options |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Added date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Foreign Keys**:  
- user_id → users(id) ON DELETE CASCADE  
- product_id → products(id) ON DELETE CASCADE

**Indexes**: `idx_user_id`  
**Constraints**: UNIQUE KEY (user_id, product_id) - One product per user cart

---

### Orders

#### `orders`
Customer orders with payment and delivery tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Order ID |
| `order_number` | VARCHAR(50) | UNIQUE, NOT NULL, INDEXED | Format: ORD-YYYYMMDD-XXXX |
| `user_id` | INT | FK → users(id), NOT NULL, INDEXED | Customer reference |
| `status` | ENUM | DEFAULT 'pending', INDEXED | Order status |
| `payment_status` | ENUM | DEFAULT 'to_pay', INDEXED | Payment status |
| `payment_method` | ENUM | NOT NULL | cash_on_delivery, gcash, bank_transfer |
| `delivery_method` | ENUM | NOT NULL | delivery or pickup |
| `address_id` | INT | FK → addresses(id) | Delivery address |
| `pickup_time` | DATETIME | NULL | Scheduled pickup time |
| `subtotal` | DECIMAL(10,2) | NOT NULL | Items subtotal |
| `delivery_fee` | DECIMAL(10,2) | DEFAULT 0 | Delivery charge |
| `discount` | DECIMAL(10,2) | DEFAULT 0 | Discount amount |
| `total` | DECIMAL(10,2) | NOT NULL | Final total |
| `notes` | TEXT | NULL | Customer notes |
| `receipt_url` | VARCHAR(500) | NULL | Payment receipt image |
| `admin_notes` | TEXT | NULL | Admin notes |
| `decline_reason` | TEXT | NULL | Decline reason |
| `accepted_at` | TIMESTAMP | NULL | Order accepted time |
| `completed_at` | TIMESTAMP | NULL | Order completed time |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP, INDEXED | Order date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Order Status Values**:
- `pending` - Awaiting admin acceptance
- `accepted` - Admin accepted
- `processing` - Being prepared
- `ready_for_pickup` - Ready for customer pickup
- `out_for_delivery` - Out for delivery
- `claimed` - Picked up by customer
- `completed` - Fulfilled
- `cancelled` - Customer cancelled
- `declined` - Admin declined

**Payment Status Values**:
- `to_pay` - Not paid
- `awaiting_confirmation` - Waiting for admin to verify payment
- `paid` - Payment confirmed
- `refunded` - Payment refunded

**Foreign Keys**:  
- user_id → users(id) ON DELETE CASCADE  
- address_id → addresses(id) ON DELETE SET NULL

**Indexes**: `idx_user_id`, `idx_status`, `idx_payment_status`, `idx_order_number`, `idx_created_at`  
**Composite Indexes**: `idx_orders_user_status (user_id, status)`, `idx_orders_created_status (created_at, status)`  
**Relationships**: Referenced by order_items, chat_rooms, messages  
**Auto-Generated**: order_number via trigger

---

### Order Items

#### `order_items`
Individual items within an order.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Item ID |
| `order_id` | INT | FK → orders(id), NOT NULL, INDEXED | Order reference |
| `product_id` | INT | FK → products(id), INDEXED | Product reference |
| `product_name` | VARCHAR(255) | NOT NULL | Product name snapshot |
| `product_image` | VARCHAR(500) | NULL | Product image snapshot |
| `quantity` | INT | NOT NULL | Order quantity |
| `unit_price` | DECIMAL(10,2) | NOT NULL | Price per unit |
| `subtotal` | DECIMAL(10,2) | NOT NULL | Line total |
| `customization` | JSON | NULL | Custom options |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation date |

**Foreign Keys**:  
- order_id → orders(id) ON DELETE CASCADE  
- product_id → products(id) ON DELETE SET NULL (allows product deletion)

**Indexes**: `idx_order_id`, `idx_product_id`  
**Auto-Trigger**: Updates product stock_quantity after insertion

---

## Requests & Inquiries

### Requests

#### `requests`
Custom orders, bookings, and special requests.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Request ID |
| `request_number` | VARCHAR(50) | UNIQUE, NOT NULL, INDEXED | Format: REQ-YYYYMMDD-XXXX |
| `user_id` | INT | FK → users(id), NOT NULL, INDEXED | Customer reference |
| `type` | ENUM | NOT NULL, INDEXED | Request type |
| `status` | ENUM | DEFAULT 'pending', INDEXED | Request status |
| `data` | JSON | NOT NULL | Request details |
| `photo_url` | VARCHAR(500) | NULL | Reference photo |
| `photos` | JSON | NULL | Multiple photos |
| `estimated_price` | DECIMAL(10,2) | NULL | Admin estimate |
| `final_price` | DECIMAL(10,2) | NULL | Final agreed price |
| `notes` | TEXT | NULL | Customer notes |
| `admin_notes` | TEXT | NULL | Admin internal notes |
| `admin_response` | TEXT | NULL | Admin response |
| `event_date` | DATETIME | NULL | Event date/time |
| `event_type` | VARCHAR(100) | NULL | Event type |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Request date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Request Types**:
- `booking` - Event booking
- `customized` - Custom arrangement
- `special_order` - Special order
- `inquiry` - General inquiry

**Status Values**:
- `pending` - Awaiting review
- `viewed` - Admin viewed
- `quoted` - Price quoted
- `accepted` - Accepted by customer
- `in_progress` - Being prepared
- `completed` - Fulfilled
- `cancelled` - Customer cancelled
- `declined` - Admin declined

**Foreign Keys**: user_id → users(id) ON DELETE CASCADE  
**Indexes**: `idx_user_id`, `idx_type`, `idx_status`, `idx_request_number`  
**Relationships**: Referenced by chat_rooms  
**Auto-Generated**: request_number via trigger

---

### Inquiries

#### `inquiries`
Customer support inquiries and contact form submissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Inquiry ID |
| `inquiry_number` | VARCHAR(50) | UNIQUE, NOT NULL | Format: INQ-YYYYMMDD-XXXX |
| `user_id` | INT | FK → users(id), INDEXED | User reference (optional) |
| `name` | VARCHAR(255) | NOT NULL | Inquirer name |
| `email` | VARCHAR(255) | NOT NULL | Contact email |
| `phone` | VARCHAR(20) | NULL | Contact phone |
| `subject` | VARCHAR(255) | NOT NULL | Inquiry subject |
| `message` | TEXT | NOT NULL | Inquiry message |
| `status` | ENUM | DEFAULT 'new', INDEXED | Inquiry status |
| `admin_id` | INT | FK → admins(id) | Admin handler |
| `admin_reply` | TEXT | NULL | Admin response |
| `replied_at` | TIMESTAMP | NULL | Reply timestamp |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP, INDEXED | Submission date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Status Values**: new, read, replied, resolved, closed

**Foreign Keys**:  
- user_id → users(id) ON DELETE SET NULL  
- admin_id → admins(id) ON DELETE SET NULL

**Indexes**: `idx_user_id`, `idx_status`, `idx_created_at`  
**Auto-Generated**: inquiry_number via trigger  
**Note**: Supports both logged-in users and guest inquiries

---

## User Interactions

### Wishlists

#### `wishlists`
User saved/favorite products.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Wishlist ID |
| `user_id` | INT | FK → users(id), NOT NULL, INDEXED | User reference |
| `product_id` | INT | FK → products(id), NOT NULL | Product reference |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Added date |

**Foreign Keys**:  
- user_id → users(id) ON DELETE CASCADE  
- product_id → products(id) ON DELETE CASCADE

**Indexes**: `idx_user_id`  
**Constraints**: UNIQUE KEY (user_id, product_id) - One product per user wishlist

---

### Reviews

#### `reviews`
Product reviews and ratings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Review ID |
| `product_id` | INT | FK → products(id), NOT NULL, INDEXED | Product reference |
| `user_id` | INT | FK → users(id), NOT NULL, INDEXED | Reviewer reference |
| `order_id` | INT | FK → orders(id) | Related order |
| `rating` | INT | NOT NULL, CHECK (1-5) | Star rating |
| `comment` | TEXT | NULL | Review text |
| `is_verified` | BOOLEAN | DEFAULT FALSE | Verified purchase |
| `is_visible` | BOOLEAN | DEFAULT TRUE | Visible on site |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Review date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Foreign Keys**:  
- product_id → products(id) ON DELETE CASCADE  
- user_id → users(id) ON DELETE CASCADE  
- order_id → orders(id) ON DELETE SET NULL

**Indexes**: `idx_product_id`, `idx_user_id`  
**Validation**: Rating must be 1-5

---

## Communication

### Chat Rooms

#### `chat_rooms`
Chat conversations between customers and admins.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Room ID |
| `user_id` | INT | FK → users(id), NOT NULL, INDEXED | Customer reference |
| `order_id` | INT | FK → orders(id) | Related order |
| `request_id` | INT | FK → requests(id) | Related request |
| `last_message` | TEXT | NULL | Last message preview |
| `last_message_at` | TIMESTAMP | NULL, INDEXED | Last message time |
| `user_unread_count` | INT | DEFAULT 0 | User unread messages |
| `admin_unread_count` | INT | DEFAULT 0 | Admin unread messages |
| `is_active` | BOOLEAN | DEFAULT TRUE | Room status |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Foreign Keys**:  
- user_id → users(id) ON DELETE CASCADE  
- order_id → orders(id) ON DELETE SET NULL  
- request_id → requests(id) ON DELETE SET NULL

**Indexes**: `idx_user_id`, `idx_last_message_at`

---

### Chat Messages

#### `chat_messages`
Individual messages within chat rooms.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Message ID |
| `room_id` | INT | FK → chat_rooms(id), NOT NULL, INDEXED | Room reference |
| `sender_id` | INT | NOT NULL | User or Admin ID |
| `sender_type` | ENUM | NOT NULL | customer or admin |
| `message_type` | ENUM | DEFAULT 'text' | Message type |
| `content` | TEXT | NOT NULL | Message content |
| `image_url` | VARCHAR(500) | NULL | Image attachment |
| `metadata` | JSON | NULL | Additional data |
| `is_read` | BOOLEAN | DEFAULT FALSE | Read status |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP, INDEXED | Message timestamp |

**Message Types**: text, image, payment_request, payment_confirmation, system

**Foreign Keys**: room_id → chat_rooms(id) ON DELETE CASCADE  
**Indexes**: `idx_room_id`, `idx_created_at`  
**Composite Index**: `idx_chat_messages_room_created (room_id, created_at)`

---

### Messages (Legacy)

#### `messages`
Legacy messaging system (backward compatibility).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Message ID |
| `order_id` | INT | FK → orders(id), INDEXED | Related order |
| `sender_id` | INT | NOT NULL, INDEXED | Sender reference |
| `sender_type` | ENUM | NOT NULL | customer or admin |
| `message_type` | ENUM | DEFAULT 'text' | Message type |
| `content` | TEXT | NOT NULL | Message content |
| `metadata` | JSON | NULL | Additional data |
| `is_read` | BOOLEAN | DEFAULT FALSE | Read status |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP, INDEXED | Message time |

**Foreign Keys**: order_id → orders(id) ON DELETE CASCADE  
**Indexes**: `idx_order_id`, `idx_sender_id`, `idx_created_at`  
**Note**: Maintained for backward compatibility with existing features

---

## Notifications

#### `notifications`
System notifications for users and admins.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Notification ID |
| `user_id` | INT | FK → users(id), INDEXED | Customer reference |
| `admin_id` | INT | FK → admins(id), INDEXED | Admin reference |
| `target_type` | ENUM | DEFAULT 'customer' | Target audience |
| `type` | ENUM | NOT NULL | Notification type |
| `title` | VARCHAR(255) | NOT NULL | Notification title |
| `message` | TEXT | NOT NULL | Notification content |
| `icon` | VARCHAR(50) | NULL | Icon name |
| `link` | VARCHAR(255) | NULL | Action link |
| `data` | JSON | NULL | Additional data |
| `is_read` | BOOLEAN | DEFAULT FALSE, INDEXED | Read status |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP, INDEXED | Creation date |

**Target Types**: customer, admin, all

**Notification Types**: order, payment, promotion, system, cancellation, chat, request

**Foreign Keys**:  
- user_id → users(id) ON DELETE CASCADE  
- admin_id → admins(id) ON DELETE CASCADE

**Indexes**: `idx_user_id`, `idx_admin_id`, `idx_is_read`, `idx_created_at`  
**Composite Index**: `idx_notifications_user_read (user_id, is_read)`

---

## Inventory

### Stock

#### `stock`
Raw materials and supplies inventory.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Stock item ID |
| `name` | VARCHAR(255) | NOT NULL | Item name |
| `category` | VARCHAR(100) | INDEXED | Item category |
| `quantity` | INT | NOT NULL, DEFAULT 0 | Current quantity |
| `price` | DECIMAL(10,2) | DEFAULT 0 | Unit price |
| `unit` | VARCHAR(50) | NULL | Unit of measurement |
| `reorder_level` | INT | DEFAULT 10 | Low stock threshold |
| `is_available` | BOOLEAN | DEFAULT TRUE, INDEXED | Availability status |
| `image_url` | VARCHAR(500) | NULL | Item image |
| `notes` | TEXT | NULL | Additional notes |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation date |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Update timestamp |

**Indexes**: `idx_category`, `idx_is_available`  
**View**: low_stock_items (quantity <= reorder_level)  
**Default Items**: Ribbons, Wrappers, Flowers (8 sample items)

---

## Content Management

### About Content

#### `about_content`
Company about page content (singleton table).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, DEFAULT 1, CHECK (id=1) | Singleton ID |
| `title` | VARCHAR(255) | DEFAULT 'About Us' | Page title |
| `description` | TEXT | NULL | About description |
| `mission` | TEXT | NULL | Company mission |
| `vision` | TEXT | NULL | Company vision |
| `story` | TEXT | NULL | Company story |
| `image_url` | VARCHAR(500) | NULL | About image |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Last update |

**Note**: Single-row table (id always = 1)

---

### Team Members

#### `team_members`
Company team members display.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, AUTO_INCREMENT | Member ID |
| `name` | VARCHAR(255) | NOT NULL | Member name |
| `position` | VARCHAR(100) | NOT NULL | Job position |
| `photo_url` | VARCHAR(500) | NULL | Photo URL |
| `bio` | TEXT | NULL | Biography |
| `display_order` | INT | DEFAULT 0, INDEXED | Display order |
| `is_active` | BOOLEAN | DEFAULT TRUE | Active status |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation date |

**Indexes**: `idx_display_order`

---

### Contact Info

#### `contact_info`
Store contact information (singleton table).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PK, DEFAULT 1, CHECK (id=1) | Singleton ID |
| `shop_name` | VARCHAR(255) | DEFAULT 'FlowerForge' | Shop name |
| `address` | VARCHAR(500) | NULL | Physical address |
| `phone` | VARCHAR(20) | NULL | Contact phone |
| `email` | VARCHAR(255) | NULL | Contact email |
| `business_hours` | TEXT | NULL | Operating hours |
| `map_url` | VARCHAR(1000) | NULL | Google Maps embed URL |
| `facebook_url` | VARCHAR(500) | NULL | Facebook page |
| `instagram_url` | VARCHAR(500) | NULL | Instagram profile |
| `updated_at` | TIMESTAMP | AUTO UPDATE | Last update |

**Note**: Single-row table (id always = 1)

---

## Database Features

### Triggers

#### `before_order_insert`
Auto-generates order numbers in format: ORD-YYYYMMDD-XXXX

```sql
CONCAT('ORD-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(FLOOR(RAND() * 10000), 4, '0'))
```

#### `before_request_insert`
Auto-generates request numbers in format: REQ-YYYYMMDD-XXXX

#### `before_inquiry_insert`
Auto-generates inquiry numbers in format: INQ-YYYYMMDD-XXXX

#### `after_order_item_insert`
Automatically decreases product stock_quantity when order items are created

---

### Views

#### `order_statistics`
Aggregate order and revenue statistics.

**Columns**:
- total_orders
- pending_orders
- completed_orders
- cancelled_orders
- total_revenue (paid orders only)
- average_order_value

#### `top_products`
Best-selling products by quantity and revenue.

**Columns**:
- Product ID, name, category
- total_sold (quantity)
- total_revenue

#### `low_stock_items`
Stock items below reorder level.

**Columns**:
- Stock ID, name, category
- Current quantity
- reorder_level
- unit

---

### Indexes

#### Single-Column Indexes
- User email, role
- Admin email, role
- Product category, name, is_active, is_featured
- Order user_id, status, payment_status, order_number, created_at
- All foreign key columns
- Notification is_read, created_at

#### Composite Indexes
- `idx_orders_user_status` - Efficient user order filtering
- `idx_orders_created_status` - Date-based order queries
- `idx_chat_messages_room_created` - Chat message retrieval
- `idx_notifications_user_read` - Unread notification counts

---

## Performance Considerations

1. **Cascading Deletes**: User deletion removes all related data
2. **SET NULL on Delete**: Products/categories can be deleted without losing orders
3. **JSON Fields**: Used for flexible data (customization, photos, metadata)
4. **Timestamp Tracking**: All tables track creation and updates
5. **Auto-Increment IDs**: All tables use integer primary keys
6. **Engine**: InnoDB for ACID compliance and foreign key support

---

## Database Size Estimation

**Small Shop** (100 customers, 50 products):
- ~10MB initial
- ~1-2MB per 1000 orders

**Medium Shop** (1000 customers, 200 products):
- ~50MB initial
- ~5-10MB per 1000 orders

**Large Shop** (10000+ customers, 500+ products):
- ~200MB+ initial
- Growing with orders, messages, notifications

---

**Generated by**: FlowerForge Development Team  
**Last Updated**: 2025-12-09  
**Version**: 2.0
