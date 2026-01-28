# FlowerForge Data Architecture - User-Centric Hierarchy

**Perspective**: Users → Their Data  
**Approach**: Hierarchical relationships from user authentication down through all associated data points  
**Database**: flowerforge (MySQL 8.0+)

---

## Overview

This document illustrates how user data flows through the FlowerForge platform, organized hierarchically from the user account downward through all their associated data and interactions.

## Data Hierarchy Map

```
users/{user_id}/
├── profile/                    (users table)
├── addresses/                  (addresses table)
├── shopping/
│   ├── cart/                  (cart_items table)
│   ├── wishlist/              (wishlists table)
│   └── orders/                (orders table)
│       └── order_items/       (order_items table)
├── requests/                   (requests table)
├── inquiries/                  (inquiries table)
├── reviews/                    (reviews table)
├── communications/
│   ├── chat_rooms/            (chat_rooms table)
│   │   └── chat_messages/     (chat_messages table)
│   └── notifications/         (notifications table)
└── legacy/
    └── messages/              (messages table)
```

---

## Level 1: User Profile

### `users/{id}` - Core Identity

The foundation of all user data. Every customer interaction starts here.

```javascript
{
  id: 1,
  email: "customer@example.com",
  password: "$2a$10$...", // bcrypted
  name: "John Doe",
  phone: "+63 912 345 6789",
  date_of_birth: "1990-01-15",
  avatar_url: "/uploads/avatars/user1.jpg",
  role: "customer", // customer | admin | employee
  is_active: true,
  email_verified: true,
  last_login: "2025-12-09 14:23:00",
  created_at: "2025-01-01 10:00:00",
  updated_at: "2025-12-09 14:23:00"
}
```

**Primary Relationships**:
- Has many addresses
- Has many cart items
- Has many orders
- Has many  requests
- Has many inquiries (optional)
- Has many wishlists
- Has many reviews
- Has many chat rooms
- Has many notifications

---

## Level 2: User Addresses

### `users/{id}/addresses/` 

Delivery and contact addresses for the user.

**Path**: `addresses` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  user_id: 1, // → users.id
  label: "Home",
  recipient_name: "John Doe",
  phone: "+63 912 345 6789",
  street: "123 Main St",
  barangay: "Barangay 1",
  city: "Quezon City",
  province: "Metro Manila",
  zip_code: "1100",
  is_default: true,
  created_at: "2025-01-01 10:05:00",
  updated_at: "2025-01-01 10:05:00"
}
```

**Used By**: Orders for delivery information

**Cascade**: ON DELETE CASCADE (deletes when user is deleted)

---

## Level 3: Shopping Data

### `users/{id}/shopping/cart/`

Current shopping cart items.

**Path**: `cart_items` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  user_id: 1, // → users.id
  product_id: 5, // → products.id
  quantity: 2,
  customization: {
    dedicationCard: "Happy Birthday!",
    ribbonColor: "red"
  },
  created_at: "2025-12-09 14:20:00",
  updated_at: "2025-12-09 14:20:00"
}
```

**Constraints**: One product per cart (unique per user-product pair)

**Cascade**: ON DELETE CASCADE

---

### `users/{id}/shopping/wishlist/`

Saved products for future purchase.

**Path**: `wishlists` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  user_id: 1, // → users.id
  product_id: 12, // → products.id
  created_at: "2025-12-08 09:15:00"
}
```

**Constraints**: One product per wishlist (unique per user-product pair)

**Cascade**: ON DELETE CASCADE

---

### `users/{id}/shopping/orders/`

All user orders with full lifecycle tracking.

**Path**: `orders` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  order_number: "ORD-20251209-1234", // Auto-generated
  user_id: 1, // → users.id
  
  // Order Status
  status: "processing", // pending → accepted → processing → ready_for_pickup/out_for_delivery → claimed/completed
  payment_status: "paid", // to_pay → awaiting_confirmation → paid
  
  // Payment & Delivery
  payment_method: "gcash", // cash_on_delivery | gcash | bank_transfer
  delivery_method: "delivery", // delivery | pickup
  address_id: 1, // → addresses.id (for delivery)
  pickup_time: null, // DateTime for pickup orders
  
  // Pricing
  subtotal: 2500.00,
  delivery_fee: 100.00,
  discount: 0.00,
  total: 2600.00,
  
  // Additional Data
  notes: "Please deliver after 2pm",
  receipt_url: "/uploads/receipts/gcash-20251209-1234.jpg",
  admin_notes: null,
  decline_reason: null,
  
  // Timestamps
  accepted_at: "2025-12-09 10:30:00",
  completed_at: null,
  created_at: "2025-12-09 10:00:00",
  updated_at: "2025-12-09 14:00:00"
}
```

**Status Flow**:
1. **pending** - Customer submitted, awaiting admin acceptance
2. **accepted** - Admin accepted the order
3. **processing** - Order is being prepared
4. **ready_for_pickup** / **out_for_delivery** - Ready for customer
5. **claimed** / **completed** - Order fulfilled
6. **cancelled** / **declined** - Order terminated

**Cascade**: ON DELETE CASCADE

**Referenced By**: order_items, chat_rooms, messages

---

### `users/{id}/shopping/orders/{order_id}/items/`

Individual items within an order.

**Path**: `order_items` WHERE `order_id` IN (SELECT id FROM orders WHERE user_id = {id})

```javascript
{
  id: 1,
  order_id: 1, // → orders.id
  product_id: 5, // → products.id (nullable)
  product_name: "Valentine's Rose Bouquet", // Snapshot
  product_image: "/uploads/products/rose-bouquet.jpg", // Snapshot
  quantity: 1,
  unit_price: 2500.00, // Price at time of order
  subtotal: 2500.00,
  customization: {
    dedicationCard: "To my love",
    ribbonColor: "red"
  },
  created_at: "2025-12-09 10:00:00"
}
```

**Why Snapshots?**: Product name/image saved because products can be deleted/modified

**Auto-Trigger**: Decreases product stock_quantity on insert

---

## Level 4: Custom Requests

### `users/{id}/requests/`

Custom orders, bookings, and special requests from the user.

**Path**: `requests` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  request_number: "REQ-20251209-5678", // Auto-generated
  user_id: 1, // → users.id
  
  // Request Type & Status
  type: "customized", // booking | customized | special_order | inquiry
  status: "quoted", // pending → viewed → quoted → accepted → in_progress → completed
  
  // Request Data
  data: {
    occasion: "Wedding",
    guestCount: 100,
    colorScheme: ["white", "cream", "gold"],
    flowerPreferences: ["roses", "orchids"],
    budget: "50000-100000"
  },
  
  // Visual References
  photo_url: "/uploads/requests/wedding-ref.jpg",
  photos: [
    "/uploads/requests/ref1.jpg",
    "/uploads/requests/ref2.jpg"
  ],
  
  // Pricing
  estimated_price: 75000.00, // Admin estimate
  final_price: 72000.00, // Final agreed price
  
  // Communication
  notes: "Need this by June 15, 2025",
  admin_notes: "Customer prefers imported roses",
  admin_response: "We can fulfill this request. Estimated 72,000 PHP.",
  
  // Event Details
  event_date: "2025-06-15 14:00:00",
  event_type: "Wedding",
  
  created_at: "2025-12-09 08:00:00",
  updated_at: "2025-12-09 15:00:00"
}
```

**Request Types**:
- **booking**: Event/venue booking
- **customized**: Custom flower arrangement
- **special_order**: Special occasion order
- **inquiry**: General product inquiry

**Cascade**: ON DELETE CASCADE

**Referenced By**: chat_rooms

---

## Level 5: Inquiries

### `users/{id}/inquiries/`

Customer support tickets and contact form submissions.

**Path**: `inquiries` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  inquiry_number: "INQ-20251209-9012", // Auto-generated
  user_id: 1, // → users.id (nullable for guest inquiries)
  
  // Contact Info
  name: "John Doe",
  email: "customer@example.com",
  phone: "+63 912 345 6789",
  
  // Inquiry Content
  subject: "Question about delivery timeframe",
  message: "How long does delivery usually take within Quezon City?",
  
  // Status & Response
  status: "replied", // new → read → replied → resolved → closed
  admin_id: 1, // → admins.id
  admin_reply: "Delivery within Quezon City typically takes 2-4 hours.",
  replied_at: "2025-12-09 10:30:00",
  
  created_at: "2025-12-09 09:00:00",
  updated_at: "2025-12-09 10:30:00"
}
```

**Note**: Supports both logged-in users and guest inquiries (user_id can be NULL)

**Cascade**: ON DELETE SET NULL (inquiry preserved even if user deleted)

---

## Level 6: Reviews

### `users/{id}/reviews/`

Product reviews and ratings submitted by the user.

**Path**: `reviews` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  product_id: 5, // → products.id
  user_id: 1, // → users.id
  order_id: 1, // → orders.id (optional, for verified purchases)
  
  rating: 5, // 1-5 stars
  comment: "Absolutely beautiful arrangement! Delivered on time and fresh.",
  
  is_verified: true, // Verified purchase (has order_id)
  is_visible: true, // Visible on product page
  
  created_at: "2025-12-10 16:00:00",
  updated_at: "2025-12-10 16:00:00"
}
```

**Verified Purchase**: `is_verified = true` when `order_id` is present

**Cascade**: ON DELETE CASCADE

---

## Level 7: Communications

### `users/{id}/communications/chat_rooms/`

Chat conversations between user and support/admin.

**Path**: `chat_rooms` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  user_id: 1, // → users.id
  order_id: 1, // → orders.id (related order, optional)
  request_id: null, // → requests.id (related request, optional)
  
  // Last Message Preview
  last_message: "Thank you! Order received.",
  last_message_at: "2025-12-09 14:30:00",
  
  // Unread Counts
  user_unread_count: 0, // Messages unread by user
  admin_unread_count: 1, // Messages unread by admin
  
  is_active: true,
  created_at: "2025-12-09 10:00:00",
  updated_at: "2025-12-09 14:30:00"
}
```

**Context**: Can be related to a specific order or request

**Cascade**: ON DELETE CASCADE

---

### `users/{id}/communications/chat_rooms/{room_id}/messages/`

Individual messages within a chat room.

**Path**: `chat_messages` WHERE `room_id` IN (SELECT id FROM chat_rooms WHERE user_id = {id})

```javascript
{
  id: 1,
  room_id: 1, // → chat_rooms.id
  sender_id: 1, // User or Admin ID
  sender_type: "customer", // customer | admin
  
  // Message Content
  message_type: "text", // text | image | payment_request | payment_confirmation | system
  content: "Can I change the delivery time to 3pm?",
  image_url: null,
  metadata: null,
  
  is_read: true,
  created_at: "2025-12-09 14:15:00"
}
```

**Message Types**:
- **text**: Regular text message
- **image**: Image attachment
- **payment_request**: Admin requesting payment
- **payment_confirmation**: Payment confirmed
- **system**: Automated system message

**Cascade**: ON DELETE CASCADE (deletes with room)

---

### `users/{id}/communications/notifications/`

System notifications sent to the user.

**Path**: `notifications` WHERE `user_id` = {id}

```javascript
{
  id: 1,
  user_id: 1, // → users.id
  admin_id: null, // → admins.id (optional)
  target_type: "customer", // customer | admin | all
  
  // Notification Content
  type: "order", // order | payment | promotion | system | cancellation | chat | request
  title: "Order Accepted",
  message: "Your order ORD-20251209-1234 has been accepted and is being processed.",
  icon: "shopping-bag",
  link: "/orders/1",
  data: {
    order_id: 1,
    order_number: "ORD-20251209-1234"
  },
  
  is_read: false,
  created_at: "2025-12-09 10:30:00"
}
```

**Notification Types**:
- **order**: Order status updates
- **payment**: Payment confirmations
- **promotion**: Marketing/promotions
- **system**: System announcements
- **cancellation**: Order cancellations
- **chat**: New chat messages
- **request**: Request updates

**Cascade**: ON DELETE CASCADE

---

## Level 8: Legacy Systems

### `users/{id}/legacy/messages/`

Legacy order-based messaging system (backward compatibility).

**Path**: `messages` WHERE `sender_id` = {id} AND `sender_type` = 'customer'

```javascript
{
  id: 1,
  order_id: 1, // → orders.id
  sender_id: 1, // User ID
  sender_type: "customer",
  message_type: "text",
  content: "When will my order be ready?",
  metadata: null,
  is_read: true,
  created_at: "2025-12-09 11:00:00"
}
```

**Note**: Maintained for backward compatibility. New implementations should use chat_rooms/chat_messages.

**Cascade**: ON DELETE CASCADE (with order)

---

## User Data Deletion Flow

When a user account is deleted (`users.id` = X), the following cascading deletes occur automatically:

### ✅ Immediately Deleted (CASCADE)
1. **addresses** - All user addresses
2. **cart_items** - Shopping cart
3. **wishlists** - Saved products
4. **orders** → **order_items** - All orders and their items
5. **requests** - Custom requests
6. **reviews** - Product reviews
7. **chat_rooms** → **chat_messages** - All chat data
8. **notifications** - All notifications

### ⚠️ Preserved (SET NULL)
1. **inquiries** - Contact form submissions (contact info preserved)

### 📊 No Impact
1. **products** - Products remain even if creator deleted
2. **categories** - Categories unaffected
3. **stock** - Inventory unaffected

---

## User Data Privacy & GDPR Considerations

### Personal Identifiable Information (PII)

**Stored in users table**:
- Email (indexed)
- Name
- Phone
- Date of birth
- Avatar URL

**Stored in related tables**:
- Addresses (recipient name, phone, full address)
- Inquiries (name, email, phone)
- Orders (customer snapshots via addresses)
- Reviews (username via join)

### Data Retention

**Active Users**: Indefinite
**Deleted Users**: All PII removed via CASCADE
**Completed Orders**: Retained for business records (anonymized if user deleted)
**Inquiries**: Retained with contact info (SET NULL on user deletion)

### Right to be Forgotten

To fully comply with GDPR:
1. Delete user account (triggers CASCADE)
2. Manually anonymize inquiries if needed
3. Optionally anonymize completed order names in snapshots

---

## Typical User Journey Data Flow

### 1. Registration
```
User creates account → users table
```

### 2. Browsing & Shopping
```
View products → Add to wishlist (wishlists)
              → Add to cart (cart_items)
```

### 3. Checkout
```
Cart → Create order (orders + order_items)
     → Link address (addresses)
     → Upload receipt (gcash/transfer)
```

### 4. Order Processing
```
Order → Chat with admin (chat_rooms + chat_messages)
      → Receive notifications (notifications)
      → Track status updates (orders.status)
```

### 5. Post-Purchase
```
Completed order → Leave review (reviews)
                → Request custom arrangement (requests)
```

### 6. Support
```
Questions → Submit inquiry (inquiries)
          → Chat with support (chat_rooms)
```

---

## Database Queries by User Path

### Get Complete User Profile
```sql
SELECT * FROM users WHERE id = ?;
```

### Get All User Addresses
```sql
SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC;
```

### Get User Cart
```sql
SELECT ci.*, p.name, p.price, p.image_url, p.stock_quantity
FROM cart_items ci
JOIN products p ON ci.product_id = p.id
WHERE ci.user_id = ?;
```

### Get User Orders
```sql
SELECT * FROM orders 
WHERE user_id = ? 
ORDER BY created_at DESC;
```

### Get Order with Items
```sql
SELECT o.*, oi.*, a.*
FROM orders o
LEFT JOIN order_items oi ON o.id = oi.order_id
LEFT JOIN addresses a ON o.address_id = a.id
WHERE o.user_id = ? AND o.id = ?;
```

### Get User Wishlist
```sql
SELECT w.*, p.name, p.price, p.image_url
FROM wishlists w
JOIN products p ON w.product_id = p.id
WHERE w.user_id = ?;
```

### Get User Requests
```sql
SELECT * FROM requests 
WHERE user_id = ? 
ORDER BY created_at DESC;
```

### Get User Notifications (Unread)
```sql
SELECT * FROM notifications 
WHERE user_id = ? AND is_read = FALSE 
ORDER BY created_at DESC LIMIT 10;
```

### Get User Chat Rooms
```sql
SELECT cr.*, 
  (SELECT COUNT(*) FROM chat_messages WHERE room_id = cr.id AND is_read = FALSE AND sender_type = 'admin') as unread_count
FROM chat_rooms cr
WHERE cr.user_id = ?
ORDER BY cr.last_message_at DESC;
```

---

## Security & Access Control

### User Can Access:
- ✅ Their own profile, addresses, cart, wishlist
- ✅ Their own orders and order history
- ✅ Their own requests and inquiries
- ✅ Their own reviews
- ✅ Their own chat rooms and notifications
- ❌ Other users' data
- ❌ Admin-only data (stock, admin notes, etc.)

### Admin Can Access:
- ✅ All user data (for support)
- ✅ All orders, requests, inquiries
- ✅ All chat rooms
- ✅ Stock and inventory
- ✅ Content management
- ✅ Analytics views

### Implementation:
- **Node.js Middleware**: `auth` middleware checks `req.user.id`
- **SQL Queries**: Always include `WHERE user_id = req.user.id`
- **Admin Routes**: Protected by `adminAuth` middleware

---

**Generated by**: FlowerForge Development Team  
**Last Updated**: 2025-12-09  
**Version**: 2.0  
**Related Documents**:
- [database-schema.md](./database-schema.md) - Technical reference
- [schema-documentation.md](./schema-documentation.md) - Complete overview with ERD
