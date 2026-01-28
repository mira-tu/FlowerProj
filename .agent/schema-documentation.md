# FlowerForge Schema Documentation - Complete Overview

**Database**: flowerforge  
**Version**: 2.0  
**Engine**: MySQL 8.0+ (InnoD

B)  
**Tables**: 20  
**Stack**: Node.js + MySQL  
**Last Updated**: 2025-12-09

---

## Executive Summary

FlowerForge is a comprehensive e-commerce platform for a flower shop, supporting:
- Customer authentication and profiles
- Product catalog with categories
- Shopping cart and wishlist
- Order management with multiple fulfillment methods
- Custom requests and bookings
- Real-time chat communication
- Review and rating system
- Notifications system
- Inventory management
- Content management (About, Contact, Team)

## Table of Contents

- [Entity Relationship Diagram](#entity-relationship-diagram)
- [Database Overview](#database-overview)
- [Table Groups](#table-groups)
- [Detailed Entity Diagrams](#detailed-entity-diagrams)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Schema Features](#schema-features)
- [Quick Reference](#quick-reference)

---

## Entity Relationship Diagram

### Complete System ERD

```mermaid
erDiagram
    %% Core Authentication
    users ||--o{ addresses : "has many"
    users ||--o{ cart_items : "has many"
    users ||--o{ wishlists : "has many"
    users ||--o{ orders : "places"
    users ||--o{ requests : "submits"
    users ||--o{ inquiries : "creates"
    users ||--o{ reviews : "writes"
    users ||--o{ chat_rooms : "participates in"
    users ||--o{ notifications : "receives"
    
    admins ||--o{ inquiries : "responds to"
    admins ||--o{ notifications : "sends"
    
    %% Products
    categories ||--o{ products : "contains"
    products ||--o{ cart_items : "in"
    products ||--o{ order_items : "in"
    products ||--o{ wishlists : "saved in"
    products ||--o{ reviews : "has"
    
    %% Orders
    orders ||--|{ order_items : "contains"
    orders }o--|| addresses : "ships to"
    orders ||--o{ chat_rooms : "discussed in"
    orders ||--o{ messages : "has"
    orders ||--o{ reviews : "reviewed via"
    
    %% Requests
    requests ||--o{ chat_rooms : "discussed in"
    
    %% Chat
    chat_rooms ||--|{ chat_messages : "contains"
    
    %% Defining entities
    users {
        int id PK
        varchar email UK
        varchar password
        varchar name
        varchar phone
        date date_of_birth
        varchar avatar_url
        enum role
        boolean is_active
        boolean email_verified
        timestamp last_login
        timestamp created_at
        timestamp updated_at
    }
    
    admins {
        int id PK
        varchar email UK
        varchar password
        varchar name
        varchar phone
        varchar avatar_url
        enum role
        boolean is_active
        timestamp last_login
        timestamp created_at
        timestamp updated_at
    }
    
    addresses {
        int id PK
        int user_id FK
        varchar label
        varchar recipient_name
        varchar phone
        varchar street
        varchar barangay
        varchar city
        varchar province
        varchar zip_code
        boolean is_default
        timestamp created_at
        timestamp updated_at
    }
    
    categories {
        int id PK
        varchar name UK
        varchar slug UK
        text description
        varchar image_url
        int display_order
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    products {
        int id PK
        varchar name
        text description
        decimal price
        decimal compare_price
        int category_id FK
        varchar image_url
        json images
        int stock_quantity
        boolean is_active
        boolean is_featured
        json tags
        timestamp created_at
        timestamp updated_at
    }
    
    cart_items {
        int id PK
        int user_id FK
        int product_id FK
        int quantity
        json customization
        timestamp created_at
        timestamp updated_at
    }
    
    wishlists {
        int id PK
        int user_id FK
        int product_id FK
        timestamp created_at
    }
    
    orders {
        int id PK
        varchar order_number UK
        int user_id FK
        enum status
        enum payment_status
        enum payment_method
        enum delivery_method
        int address_id FK
        datetime pickup_time
        decimal subtotal
        decimal delivery_fee
        decimal discount
        decimal total
        text notes
        varchar receipt_url
        text admin_notes
        text decline_reason
        timestamp accepted_at
        timestamp completed_at
        timestamp created_at
        timestamp updated_at
    }
    
    order_items {
        int id PK
        int order_id FK
        int product_id FK
        varchar product_name
        varchar product_image
        int quantity
        decimal unit_price
        decimal subtotal
        json customization
        timestamp created_at
    }
    
    requests {
        int id PK
        varchar request_number UK
        int user_id FK
        enum type
        enum status
        json data
        varchar photo_url
        json photos
        decimal estimated_price
        decimal final_price
        text notes
        text admin_notes
        text admin_response
        datetime event_date
        varchar event_type
        timestamp created_at
        timestamp updated_at
    }
    
    inquiries {
        int id PK
        varchar inquiry_number UK
        int user_id FK
        varchar name
        varchar email
        varchar phone
        varchar subject
        text message
        enum status
        int admin_id FK
        text admin_reply
        timestamp replied_at
        timestamp created_at
        timestamp updated_at
    }
    
    reviews {
        int id PK
        int product_id FK
        int user_id FK
        int order_id FK
        int rating
        text comment
        boolean is_verified
        boolean is_visible
        timestamp created_at
        timestamp updated_at
    }
    
    chat_rooms {
        int id PK
        int user_id FK
        int order_id FK
        int request_id FK
        text last_message
        timestamp last_message_at
        int user_unread_count
        int admin_unread_count
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }
    
    chat_messages {
        int id PK
        int room_id FK
        int sender_id
        enum sender_type
        enum message_type
        text content
        varchar image_url
        json metadata
        boolean is_read
        timestamp created_at
    }
    
    notifications {
        int id PK
        int user_id FK
        int admin_id FK
        enum target_type
        enum type
        varchar title
        text message
        varchar icon
        varchar link
        json data
        boolean is_read
        timestamp created_at
    }
    
    stock {
        int id PK
        varchar name
        varchar category
        int quantity
        decimal price
        varchar unit
        int reorder_level
        boolean is_available
        varchar image_url
        text notes
        timestamp created_at
        timestamp updated_at
    }
    
    messages {
        int id PK
        int order_id FK
        int sender_id
        enum sender_type
        enum message_type
        text content
        json metadata
        boolean is_read
        timestamp created_at
    }
```

---

## Database Overview

### Table Groups

| Group | Tables | Purpose |
|-------|--------|---------|
| **Authentication** | users, admins | User and admin accounts |
| **User Data** | addresses | User delivery addresses |
| **Products** | categories, products | Product catalog |
| **Shopping** | cart_items, wishlists | Shopping cart and saved items |
| **Orders** | orders, order_items | Order management |
| **Requests** | requests, inquiries | Custom orders and support tickets |
| **Reviews** | reviews | Product ratings and feedback |
| **Communication** | chat_rooms, chat_messages, messages | Customer-admin messaging |
| **Notifications** | notifications | System notifications |
| **Inventory** | stock | Raw materials tracking |
| **Content** | about_content, team_members, contact_info | Website content |

### Statistics

- **Total Tables**: 20
- **Total Relationships**: 25+ foreign keys
- **Indexes**: 40+ (single + composite)
- **Triggers**: 4 (auto-generate numbers, update stock)
- **Views**: 3 (analytics)
- **Engine**: InnoDB (supports transactions, foreign keys)

---

## Detailed Entity Diagrams

### 1. User Authentication & Profile Flow

```mermaid
erDiagram
    users ||--o{ addresses : has
    users ||--o{ cart_items : owns
    users ||--o{ wishlists : maintains
    users ||--o{ orders : places
    users ||--o{ notifications : receives
    
    users {
        int id PK "Primary Key"
        varchar email UK "Unique email"
        varchar password "Bcrypt hashed"
        varchar name "Full name"
        enum role "customer/admin/employee"
        boolean is_active "Account status"
    }
    
    addresses {
        int id PK
        int user_id FK "→ users.id CASCADE"
        varchar recipient_name
        varchar street
        varchar city
        varchar province
        boolean is_default
    }
```

**Key Points**:
- User deletion cascades to all related data
- Email is unique and indexed
- Role determines access level
- Addresses support multiple per user with default flag

---

### 2. Product Catalog Structure

```mermaid
erDiagram
    categories ||--o{ products : contains
    products ||--o{ cart_items : appears_in
    products ||--o{ order_items : ordered_as
    products ||--o{ wishlists : saved_in
    products ||--o{ reviews : reviewed_by
    
    categories {
        int id PK
        varchar name UK "Sympathy, Graduation, etc."
        varchar slug UK "URL-friendly"
        boolean is_active
        int display_order "Sort order"
    }
    
    products {
        int id PK
        varchar name
        decimal price
        int category_id FK "→ categories.id SET NULL"
        int stock_quantity "Auto-updated by trigger"
        boolean is_active
        boolean is_featured
        json images "Multiple photos"
        json tags
    }
```

**Key Points**:
- Category deletion sets products.category_id to NULL (doesn't delete products)
- Stock quantity auto-decreases when orders placed (trigger)
- JSON fields for flexible data (images, tags)
- Featured products flag for homepage

---

### 3. Shopping Cart to Order Flow

```mermaid
erDiagram
    users ||--o{ cart_items : has
    users ||--o{ orders : places
    products ||--o{ cart_items : in
    products ||--o{ order_items : in
    orders ||--|{ order_items : contains
    orders }o--|| addresses : ships_to
    
    cart_items {
        int id PK
        int user_id FK
        int product_id FK
        int quantity
        json customization "Dedication, ribbon color"
        unique user_product "One product per cart"
    }
    
    orders {
        int id PK
        varchar order_number UK "ORD-20251209-1234"
        int user_id FK
        enum status "pending → completed"
        enum payment_status "to_pay → paid"
        enum payment_method "gcash, cod, bank"
        enum delivery_method "delivery or pickup"
        int address_id FK
        decimal total
        varchar receipt_url "Payment proof"
    }
    
    order_items {
        int id PK
        int order_id FK
        int product_id FK "Nullable"
        varchar product_name "Snapshot"
        varchar product_image "Snapshot"
        decimal unit_price "Price at purchase"
        int quantity
    }
```

**Checkout Flow**:
1. User adds products to `cart_items`
2. User proceeds to checkout
3. System creates `order` record
4. System copies cart items to `order_items` with snapshots
5. Trigger decreases product `stock_quantity`
6. Cart is cleared

**Why Snapshots**: Product names/images saved because products can be deleted or modified later

---

### 4. Custom Requests & Inquiries

```mermaid
erDiagram
    users ||--o{ requests : submits
    users ||--o{ inquiries : creates
    requests ||--o{ chat_rooms : discussed_in
    admins ||--o{ inquiries : responds_to
    
    requests {
        int id PK
        varchar request_number UK "REQ-20251209-1234"
        int user_id FK
        enum type "booking/customized/special_order"
        enum status "pending → completed"
        json data "Flexible request details"
        json photos "Reference images"
        decimal estimated_price "Admin quote"
        decimal final_price "Agreed price"
        datetime event_date
    }
    
    inquiries {
        int id PK
        varchar inquiry_number UK "INQ-20251209-1234"
        int user_id FK "Nullable for guests"
        varchar email "Contact email"
        varchar subject
        text message
        enum status "new → resolved"
        int admin_id FK "Handler"
        text admin_reply
    }
```

**Use Cases**:
- **Requests**: Wedding bookings, custom arrangements, bulk orders
- **Inquiries**: General questions, delivery inquiries, product availability

---

### 5. Communication System

```mermaid
erDiagram
    users ||--o{ chat_rooms : participates_in
    chat_rooms ||--o{ chat_messages :contains
    chat_rooms }o--|| orders : about
    chat_rooms }o--|| requests : about
    orders ||--o{ messages : has_legacy
    
    chat_rooms {
        int id PK
        int user_id FK
        int order_id FK "Optional context"
        int request_id FK "Optional context"
        text last_message "Preview"
        timestamp last_message_at
        int user_unread_count
        int admin_unread_count
    }
    
    chat_messages {
        int id PK
        int room_id FK
        int sender_id "User or Admin ID"
        enum sender_type "customer/admin"
        enum message_type "text/image/payment_request"
        text content
        varchar image_url
        boolean is_read
    }
    
    messages {
        int id PK
        int order_id FK
        int sender_id
        enum sender_type
        text content
        note "Legacy system"
    }
```

**Modern Chat** (`chat_rooms` + `chat_messages`):
- Supports general chat and order/request-specific chat
- Unread message tracking for both sides
- Multiple message types (text, image, payment requests)

**Legacy Messages**:
- Order-specific only
- Maintained for backward compatibility

---

### 6. Reviews & Ratings

```mermaid
erDiagram
    users ||--o{ reviews : writes
    products ||--o{ reviews : has
    orders ||--o{ reviews : verified_by
    
    reviews {
        int id PK
        int product_id FK
        int user_id FK
        int order_id FK "Verified purchase"
        int rating "1-5 stars, CHECK constraint"
        text comment
        boolean is_verified "Has order_id"
        boolean is_visible "Moderation"
    }
```

**Verified Purchases**: Reviews linked to `order_id` are marked `is_verified = true`

**Moderation**: `is_visible` allows admin to hide inappropriate reviews

---

## Data Flow Diagrams

### Customer Order Journey

```mermaid
flowchart TD
    A[Customer Registers] --> B[Browse Products]
    B --> C{Add toCart or Wishlist?}
    C -->|Cart| D[cart_items]
    C -->|Wishlist| E[wishlists]
    D --> F[Checkout]
    F --> G[Create Order]
    G --> H[orders + order_items]
    H --> I{Payment Method?}
    I -->|GCash/Bank| J[Upload Receipt]
    I -->|COD| K[Wait for Admin]
    J --> L[Admin Reviews]
    K --> L
    L --> M{Admin Decision}
    M -->|Accept| N[Order Processing]
    M -->|Decline| O[Order Declined]
    N --> P[Order Completed]
    P --> Q[Customer Reviews]
    Q --> R[reviews table]
    
    style A fill:#e1f5ff
    style H fill:#fff4e1
    style P fill:#e7ffe1
```

### Custom Request Flow

```mermaid
flowchart TD
    A[Customer Submits Request] --> B[requests table]
    B --> C[Admin Views Request]
    C --> D[Admin Provides Quote]
    D --> E{Customer Accepts?}
    E -->|Yes| F[Request Accepted]
    E -->|No| G[Request Declined]
    F --> H[In Progress]
    H --> I[Completed]
    I --> J[Customer Can Review]
    
    C --> K[Start Chat]
    K --> L[chat_rooms + chat_messages]
    
    style B fill:#e1f5ff
    style F fill:#fff4e1
    style I fill:#e7ffe1
```

### Notification Triggers

```mermaid
flowchart LR
    A[Order Status Change] --> N[notifications]
    B[Payment Confirmed] --> N
    C[New Chat Message] --> N
    D[Request Update] --> N
    E[Admin Announcement] --> N
    F[Low Stock Alert] --> N
    
    N --> G[User Notifications]
    N --> H[Admin Notifications]
    
    style N fill:#fff4e1
```

---

## Schema Features

### Auto-Generated Values

**Triggers for Number Generation**:

| Table | Trigger | Format | Example |
|-------|---------|--------|---------|
| orders | before_order_insert | ORD-YYYYMMDD-XXXX | ORD-20251209-1234 |
| requests | before_request_insert | REQ-YYYYMMDD-XXXX | REQ-20251209-5678 |
| inquiries | before_inquiry_insert | INQ-YYYYMMDD-XXXX | INQ-20251209-9012 |

**Stock Auto-Update**:
```sql
-- Trigger: after_order_item_insert
UPDATE products 
SET stock_quantity = stock_quantity - NEW.quantity
WHERE id = NEW.product_id;
```

### Analytical Views

#### 1. order_statistics
```sql
SELECT 
    COUNT(*) as total_orders,
    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
    SUM(CASE WHEN payment_status = 'paid' THEN total ELSE 0 END) as total_revenue,
    AVG(total) as average_order_value
FROM orders;
```

#### 2. top_products
```sql
SELECT 
    p.id, p.name, c.name as category_name,
    SUM(oi.quantity) as total_sold,
    SUM(oi.subtotal) as total_revenue
FROM products p
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN categories c ON p.category_id = c.id
GROUP BY p.id
ORDER BY total_sold DESC;
```

#### 3. low_stock_items
```sql
SELECT id, name, category, quantity, reorder_level, unit
FROM stock
WHERE quantity <= reorder_level AND is_available = TRUE;
```

### Performance Indexes

**High-Traffic Queries**:

| Query Pattern | Index |
|--------------|-------|
| User login | `idx_email` on users |
| User orders | `idx_orders_user_status (user_id, status)` |
| Product listing | `idx_category_id`, `idx_is_active` |
| Order tracking | `idx_order_number` |
| Chat messages | `idx_chat_messages_room_created (room_id, created_at)` |
| Unread notifications | `idx_notifications_user_read (user_id, is_read)` |
| Recent orders | `idx_orders_created_status (created_at, status)` |

---

## Quick Reference

### Order Status Flow

```
pending → accepted → processing → ready_for_pickup/out_for_delivery → claimed/completed
                                                                      ↓
                                                                 cancelled/declined
```

### Payment Status Flow

```
to_pay → awaiting_confirmation → paid
                                   ↓
                              refunded
```

### Request Status Flow

```
pending → viewed → quoted → accepted → in_progress → completed
                                                        ↓
                                                   cancelled/declined
```

### Inquiry Status Flow

```
new → read → replied → resolved → closed
```

### Common Enums

| Field | Values |
|-------|--------|
| users.role | customer, admin, employee |
| admins.role | admin, employee |
| orders.status | pending, accepted, processing, ready_for_pickup, out_for_delivery, claimed, completed, cancelled, declined |
| orders.payment_status | to_pay, awaiting_confirmation, paid, refunded |
| orders.payment_method | cash_on_delivery, gcash, bank_transfer |
| orders.delivery_method | delivery, pickup |
| requests.type | booking, customized, special_order, inquiry |
| requests.status | pending, viewed, quoted, accepted, in_progress, completed, cancelled, declined |
| inquiries.status | new, read, replied, resolved, closed |
| notifications.type | order, payment, promotion, system, cancellation, chat, request |
| chat_messages.message_type | text, image, payment_request, payment_confirmation, system |

### Default Data

**Categories** (6):
- Sympathy
- Graduation
- All Souls Day
- Valentines
- Get Well Soon
- Mothers Day

**Admin Account**:
- Email: admin@flower.com
- Password: pa55w0rd

**Sample Stock Items** (8):
- Ribbons (Red Satin, Blue Organza, Pink)
- Wrappers (Gold Foil, Clear Cellophane, Brown Kraft)
- Flowers (Red Roses, White Lilies)

---

## Integration Points

### Node.js Backend

**Database Connection**:
```javascript
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'flowerforge',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
```

**Authentication Middleware**:
- `auth` - Verifies JWT, sets `req.user`
- `adminAuth` - Requires admin or employee role
- `adminOnly` - Requires admin role only

### API Routes

| Endpoint | Table(s) | Purpose |
|----------|----------|---------|
| POST /api/auth/register | users | User registration |
| POST /api/auth/login | users | User login |
| GET /api/products | products, categories | List products |
| POST /api/cart/add | cart_items | Add to cart |
| POST /api/orders | orders, order_items | Create order |
| GET /api/orders/:id | orders, order_items, addresses | Get order details |
| POST /api/requests | requests | Submit custom request |
| POST /api/inquiries | inquiries | Submit inquiry |
| POST /api/reviews | reviews | Write review |
| GET /api/chat/rooms | chat_rooms | List chat rooms |
| GET /api/notifications | notifications | Get notifications |

---

## Maintenance & Monitoring

### Backup Strategy

**Daily**: Full database backup  
**Hourly**: Transaction log backup  
**Retention**: 30 days

### Monitoring Queries

**Check Low Stock**:
```sql
SELECT * FROM low_stock_items;
```

**Pending Orders Count**:
```sql
SELECT COUNT(*) FROM orders WHERE status = 'pending';
```

**Today's Revenue**:
```sql
SELECT SUM(total) FROM orders 
WHERE DATE(created_at) = CURDATE() 
AND payment_status = 'paid';
```

**Unread Inquiries**:
```sql
SELECT COUNT(*) FROM inquiries WHERE status = 'new';
```

---

## Future Enhancements

### Possible Additions

1. **Coupons/Discounts Table**
   - Promo codes
   - Discount percentages
   - Validity periods

2. **Loyalty Program**
   - Points system
   - Rewards redemption

3. **Product Variants**
   - Size options
   - Color variations

4. **Shipping Zones**
   - Location-based delivery fees
   - Delivery time estimates

5. **Order Tracking**
   - GPS tracking links
   - Status history log

6. **Product Bundles**
   - Package deals
   - Related products

---

## Related Documentation

- **[database-schema.md](./database-schema.md)** - Technical reference for all tables
- **[data-architecture.md](./data-architecture.md)** - User-centric data hierarchy
- **Backend API**: `backend/routes/` - Route implementations
- **Database Schema**: `backend/database/schema_complete.sql` - SQL source

---

**Maintained by**: FlowerForge Development Team  
**Technology Stack**: Node.js + Express + MySQL + JWT  
**Last Updated**: 2025-12-09  
**Schema Version**: 2.0
