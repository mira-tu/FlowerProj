# FlowerForge System Analysis & Requirements
**Complete Analysis of Web & Mobile Applications**

---

## 📋 EXECUTIVE SUMMARY

**Project:** FlowerForge - Flower Shop E-commerce System  
**Platforms:** React Web App + React Native Mobile App  
**Current Status:** UI/UX Complete, Backend Required  
**Recommended Backend:** Node.js + Express + MySQL

---

## 1. UI AUDIT

### 1.1 React Web App Pages (19 Pages)

| Page | Purpose | Status | Notes |
|------|---------|--------|-------|
| **Home.jsx** | Product browsing, hero carousel | ✅ Complete | Main landing page |
| **About.jsx** | Company information | ✅ Complete | Static content |
| **Contact.jsx** | Contact form, map | ✅ Complete | Static content |
| **Login.jsx** | User authentication | ⚠️ Mock | No backend auth |
| **Signup.jsx** | User registration | ⚠️ Mock | No backend auth |
| **Wishlist.jsx** | Saved products | ✅ Complete | localStorage only |
| **Cart.jsx** | Shopping cart | ✅ Complete | localStorage only |
| **Checkout.jsx** | Order placement | ⚠️ Mock | No payment integration |
| **OrderSuccess.jsx** | Order confirmation | ✅ Complete | Display only |
| **OrderTracking.jsx** | Track order status | ⚠️ Mock | No real tracking |
| **Profile.jsx** | User profile & orders | ✅ Complete | Complex, multi-tab |
| **MyOrders.jsx** | Order history | ✅ Complete | localStorage only |
| **Notifications.jsx** | User notifications | ✅ Complete | localStorage only |
| **ProductDetail.jsx** | Single product view | ✅ Complete | Static reviews |
| **Customized.jsx** | Custom bouquet builder | ✅ Complete | Interactive designer |
| **BookEvent.jsx** | Event booking form | ✅ Complete | Request submission |
| **SpecialOrder.jsx** | Special order requests | ✅ Complete | Request submission |
| **AdminDashboard.jsx** | Admin panel (web) | ✅ Complete | 10 tabs, full featured |
| **AdminDashboard.native.jsx** | Admin panel (mobile version) | ✅ Complete | Simplified for mobile |

### 1.2 React Native Mobile App Screens (2 Screens)

| Screen | Purpose | Status | Notes |
|--------|---------|--------|-------|
| **LoginScreen.js** | Admin login | ✅ Complete | AsyncStorage auth |
| **AdminDashboard.js** | Full admin panel | ✅ Complete | 10 tabs, matches web |

### 1.3 Shared Components (6 Components)

| Component | Purpose | Used In |
|-----------|---------|---------|
| **Navbar.jsx** | Main navigation | Web only |
| **Footer.jsx** | Footer links | Web only |
| **RequestSuccessModal.jsx** | Success notifications | Web only |
| **AdminSyncWrapper.jsx** | Sync management | Both |
| **AdminSyncStatus.jsx** | Sync status display | Both |
| **SyncButton.jsx** | Manual sync trigger | Both |

---

## 2. FEATURE EXTRACTION

### 2.1 Customer Features (Web App)

#### **Authentication & Profile**
- ✅ User registration (email, password, name)
- ✅ User login
- ✅ Profile management (name, email, phone, DOB)
- ✅ Password change
- ✅ Address management (add, edit, delete, set default)
- ✅ Order history view
- ✅ Messaging with shop

#### **Product Browsing**
- ✅ Product catalog display
- ✅ Category filtering (7 categories: All, Sympathy, Graduation, All Souls Day, Valentines, Get Well Soon, Mothers Day)
- ✅ Search functionality
- ✅ Product detail view
- ✅ Product reviews (static, needs backend)
- ✅ Wishlist (add/remove)
- ✅ Add to cart

#### **Shopping Cart & Checkout**
- ✅ View cart items
- ✅ Update quantities
- ✅ Remove items
- ✅ Delivery method selection (Delivery / Pickup)
- ✅ Address selection
- ✅ Payment method selection (GCash, COD, Bank Transfer)
- ✅ Order placement
- ✅ Order confirmation

#### **Special Services**
- ✅ **Custom Bouquet Designer**
  - Flower selection (Rose, Sunflower, Tulip, Lily, Carnation, Orchid, Daisy, Peony)
  - Color selection
  - Bundle size (12, 24, 50, 100 stems)
  - Ribbon selection
  - Wrapper selection
  - Live preview with drag-and-drop
  - Price calculation
  - Screenshot/download design

- ✅ **Event Booking**
  - Event type selection (Wedding, Birthday, Corporate, Anniversary, Other)
  - Date & time selection
  - Venue information
  - Guest count
  - Budget range
  - Special requests
  - Photo upload

- ✅ **Special Orders**
  - Recipient information
  - Occasion selection
  - Delivery date
  - Add-ons (Chocolates, Teddy Bear, Balloons, Wine, Cake, Greeting Card)
  - Custom message
  - Photo upload

#### **Order Management**
- ✅ Order tracking
- ✅ Order status updates (Pending, Processing, Ready for Pickup, Out for Delivery, Claimed, Completed, Cancelled)
- ✅ Payment status (To Pay, Waiting for Confirmation, Paid)
- ✅ Cancel order
- ✅ Reorder (Buy Again)
- ✅ View order details

#### **Notifications & Messaging**
- ✅ Receive notifications
- ✅ Mark as read
- ✅ Delete notifications
- ✅ Message shop
- ✅ View message history

### 2.2 Admin Features (Both Web & Mobile)

#### **Tab 1: Catalogue Management**
- ✅ View all products
- ✅ Add new product (name, price, quantity, category, image)
- ✅ Edit product
- ✅ Delete product
- ✅ Filter by category
- ✅ Image upload (camera/gallery on mobile)

#### **Tab 2: Orders Management**
- ✅ View all orders (regular + requests)
- ✅ Accept/Decline orders
- ✅ Update order status
- ✅ Update payment status
- ✅ Confirm payment (with receipt upload)
- ✅ View order details
- ✅ Filter by status
- ✅ Send notifications to customers

#### **Tab 3: Stock/Inventory Management**
- ✅ View stock items
- ✅ Add stock item (name, quantity, unit, category, reorder level, image)
- ✅ Edit stock
- ✅ Delete stock
- ✅ Toggle availability
- ✅ Low stock alerts
- ✅ Filter by category

#### **Tab 4: Notifications**
- ✅ View all notifications
- ✅ Send custom notifications
- ✅ Target specific users or all users
- ✅ Notification types (order, payment, promotion, system)

#### **Tab 5: Messaging**
- ✅ View all customer conversations
- ✅ Real-time messaging
- ✅ Send messages
- ✅ Send payment requests
- ✅ Confirm payment from messages
- ✅ View order context
- ✅ Message grouping by date

#### **Tab 6: Admin Control** (Admin only)
- ✅ View all admin accounts
- ✅ Add new admin/employee
- ✅ Edit admin details
- ✅ Delete admin
- ✅ Role management (Admin/Employee)
- ✅ Password management

#### **Tab 7: About Page Management** (Admin only)
- ✅ Edit shop description
- ✅ Edit mission statement
- ✅ Edit vision statement
- ✅ Manage team members (add, edit, delete)
- ✅ Upload team photos

#### **Tab 8: Contact Page Management** (Admin only)
- ✅ Edit shop address
- ✅ Edit phone number
- ✅ Edit email
- ✅ Edit business hours
- ✅ Edit map URL

#### **Tab 9: Sales Reports** (Admin only)
- ✅ View total revenue
- ✅ View total orders
- ✅ View pending orders
- ✅ View completed orders
- ✅ Sales by category
- ✅ Top selling products
- ✅ Recent orders list
- ✅ Date range filtering

#### **Tab 10: Employee Management** (Admin only)
- ✅ View all employees
- ✅ Add employee
- ✅ Edit employee
- ✅ Delete employee
- ✅ Assign roles
- ✅ Track employee activity

---

## 3. DUPLICATED & INCONSISTENT ITEMS

### 3.1 Duplicated Pages
| Item | Location 1 | Location 2 | Recommendation |
|------|-----------|-----------|----------------|
| **Admin Dashboard** | `AdminDashboard.jsx` (web) | `AdminDashboard.js` (mobile) | ✅ Keep both - different platforms |
| **Admin Dashboard** | `AdminDashboard.jsx` | `AdminDashboard.native.jsx` | ❌ Remove `.native.jsx` - redundant |
| **Orders Display** | `Profile.jsx` (My Orders tab) | `MyOrders.jsx` | ❌ Remove `MyOrders.jsx` - use Profile tab |

### 3.2 Inconsistent Terminology
| Feature | Web Term | Mobile Term | Recommended |
|---------|----------|-------------|-------------|
| Order types | "Request" | "Booking/Order" | Use "Request" for special orders |
| Payment status | "Waiting for Confirmation" | "Pending Payment" | Use "Awaiting Confirmation" |
| Delivery method | "Delivery/Pickup" | "Delivery/Pickup" | ✅ Consistent |

### 3.3 Missing Features

#### Missing from Web App:
- ❌ Employee dashboard (only admin dashboard exists)
- ❌ Product reviews submission (only display)
- ❌ Rating system backend
- ❌ Email notifications
- ❌ SMS notifications
- ❌ Push notifications

#### Missing from Mobile App:
- ❌ Customer-facing mobile app (only admin app exists)
- ❌ Customer shopping experience
- ❌ Mobile checkout flow
- ❌ Mobile product browsing

---

## 4. SYSTEM LOGIC & WORKFLOWS

### 4.1 User Registration & Login Flow

```
[Customer] → Signup Page → Enter Details → Submit
    ↓
[System] → Validate Email → Hash Password → Create User → Store in DB
    ↓
[System] → Send Welcome Email → Redirect to Login
    ↓
[Customer] → Login → Enter Credentials → Submit
    ↓
[System] → Validate → Create Session/JWT → Redirect to Home
```

**Current Status:** ⚠️ Mock - localStorage only  
**Missing:** Email validation, password hashing, JWT tokens, session management

### 4.2 Product Browsing Flow

```
[Customer] → Home Page → Browse Products
    ↓
[Customer] → Filter by Category / Search
    ↓
[Customer] → Click Product → View Details
    ↓
[Customer] → Add to Wishlist OR Add to Cart
    ↓
[System] → Update localStorage → Show Confirmation
```

**Current Status:** ✅ Works with localStorage  
**Missing:** Backend product sync, real-time inventory

### 4.3 Checkout & Order Placement Flow

```
[Customer] → Cart → Review Items → Proceed to Checkout
    ↓
[Customer] → Select Delivery Method (Delivery/Pickup)
    ↓
[Customer] → Select/Add Address (if delivery)
    ↓
[Customer] → Select Payment Method (GCash/COD/Bank)
    ↓
[Customer] → Upload Receipt (if GCash/Bank) → Place Order
    ↓
[System] → Create Order → Generate Order ID → Store in DB
    ↓
[System] → Send Notification to Admin → Send Confirmation to Customer
    ↓
[Customer] → Redirect to Order Success Page
```

**Current Status:** ⚠️ Mock - localStorage only  
**Missing:** Payment gateway integration, order ID generation, email confirmations

### 4.4 Admin Order Management Flow

```
[Admin] → Login → Admin Dashboard → Orders Tab
    ↓
[Admin] → View New Orders → Review Details
    ↓
[Admin] → Accept Order OR Decline Order
    ↓
    IF ACCEPT:
        [Admin] → Update Status to "Processing"
        [System] → Send Notification to Customer
        ↓
        [Admin] → Prepare Order → Update Status to "Ready for Pickup" / "Out for Delivery"
        [System] → Send Notification to Customer
        ↓
        [Customer] → Pickup/Receive Order
        ↓
        [Admin] → Update Status to "Claimed" / "Completed"
        [System] → Send Notification to Customer
    
    IF DECLINE:
        [Admin] → Provide Reason → Decline
        [System] → Send Notification to Customer → Refund (if paid)
```

**Current Status:** ✅ Works with localStorage  
**Missing:** Real-time notifications, payment refunds, email alerts

### 4.5 Custom Bouquet Design Flow

```
[Customer] → Customized Page → Select Flower Type
    ↓
[Customer] → Select Color → Select Bundle Size
    ↓
[Customer] → Select Ribbon → Select Wrapper
    ↓
[Customer] → Drag & Arrange Elements (Interactive Canvas)
    ↓
[System] → Calculate Price → Show Live Preview
    ↓
[Customer] → Save Design → Add to Cart OR Submit Request
    ↓
[System] → Store Design → Create Request → Notify Admin
```

**Current Status:** ✅ Works with localStorage  
**Missing:** Save design to user account, design gallery

### 4.6 Event Booking Flow

```
[Customer] → Book Event Page → Select Event Type
    ↓
[Customer] → Enter Event Details (Date, Venue, Guests, Budget)
    ↓
[Customer] → Upload Reference Photo → Add Special Requests
    ↓
[Customer] → Submit Booking
    ↓
[System] → Create Booking Request → Generate Request ID
    ↓
[System] → Notify Admin → Send Confirmation to Customer
    ↓
[Admin] → Review Booking → Contact Customer → Provide Quote
    ↓
[Admin] → Accept Booking → Update Status
    ↓
[System] → Send Confirmation & Payment Details to Customer
```

**Current Status:** ⚠️ Mock - localStorage only  
**Missing:** Admin quote system, payment collection, calendar integration

### 4.7 Messaging Flow

```
[Customer] → Profile → Messages Tab → Send Message
    ↓
[System] → Store Message → Notify Admin
    ↓
[Admin] → Admin Dashboard → Messaging Tab → View Message
    ↓
[Admin] → Reply to Customer
    ↓
[System] → Store Message → Notify Customer
    ↓
[Customer] → View Reply → Continue Conversation
```

**Current Status:** ⚠️ Mock - localStorage only  
**Missing:** Real-time messaging (WebSocket), push notifications, message read receipts

---

## 5. DATABASE SCHEMA DESIGN

### 5.1 Entity Relationship Diagram (ERD)

```
USERS (1) ──── (N) ORDERS
USERS (1) ──── (N) ADDRESSES
USERS (1) ──── (N) WISHLISTS
USERS (1) ──── (N) MESSAGES
USERS (1) ──── (N) NOTIFICATIONS

ORDERS (1) ──── (N) ORDER_ITEMS
ORDERS (N) ──── (1) ADDRESSES
ORDERS (1) ──── (N) MESSAGES

PRODUCTS (1) ──── (N) ORDER_ITEMS
PRODUCTS (1) ──── (N) WISHLISTS
PRODUCTS (1) ──── (N) REVIEWS
PRODUCTS (N) ──── (1) CATEGORIES

REQUESTS (1) ──── (1) USERS
REQUESTS (N) ──── (1) REQUEST_TYPES

STOCK (N) ──── (1) CATEGORIES

ADMINS (1) ──── (N) MESSAGES
ADMINS (1) ──── (N) NOTIFICATIONS_SENT
```

### 5.2 Database Tables

#### **Table: users**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Unique user ID |
| email | VARCHAR(255) | UNIQUE, NOT NULL | User email |
| password | VARCHAR(255) | NOT NULL | Hashed password |
| name | VARCHAR(255) | NOT NULL | Full name |
| phone | VARCHAR(20) | | Phone number |
| date_of_birth | DATE | | Date of birth |
| role | ENUM('customer', 'admin', 'employee') | DEFAULT 'customer' | User role |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Registration date |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | Last update |

#### **Table: addresses**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Address ID |
| user_id | INT | FOREIGN KEY → users(id) | Owner |
| label | VARCHAR(50) | | e.g., "Home", "Office" |
| recipient_name | VARCHAR(255) | NOT NULL | Recipient name |
| phone | VARCHAR(20) | NOT NULL | Contact number |
| street | VARCHAR(255) | NOT NULL | Street address |
| barangay | VARCHAR(100) | | Barangay |
| city | VARCHAR(100) | NOT NULL | City |
| province | VARCHAR(100) | NOT NULL | Province |
| zip_code | VARCHAR(10) | | Postal code |
| is_default | BOOLEAN | DEFAULT FALSE | Default address |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

#### **Table: categories**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Category ID |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Category name |
| slug | VARCHAR(100) | UNIQUE, NOT NULL | URL-friendly name |
| description | TEXT | | Category description |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

**Default Categories:**
- Sympathy
- Graduation
- All Souls Day
- Valentines
- Get Well Soon
- Mothers Day

#### **Table: products**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Product ID |
| name | VARCHAR(255) | NOT NULL | Product name |
| description | TEXT | | Product description |
| price | DECIMAL(10,2) | NOT NULL | Price in PHP |
| category_id | INT | FOREIGN KEY → categories(id) | Category |
| image_url | VARCHAR(500) | | Product image |
| stock_quantity | INT | DEFAULT 0 | Available quantity |
| is_active | BOOLEAN | DEFAULT TRUE | Active status |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

#### **Table: orders**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Order ID |
| order_number | VARCHAR(50) | UNIQUE, NOT NULL | e.g., "ORD-20241204-001" |
| user_id | INT | FOREIGN KEY → users(id) | Customer |
| status | ENUM | NOT NULL | Order status |
| payment_status | ENUM | NOT NULL | Payment status |
| payment_method | ENUM | NOT NULL | Payment method |
| delivery_method | ENUM | NOT NULL | Delivery/Pickup |
| address_id | INT | FOREIGN KEY → addresses(id) | Delivery address |
| pickup_time | DATETIME | | Pickup time (if pickup) |
| subtotal | DECIMAL(10,2) | NOT NULL | Subtotal |
| delivery_fee | DECIMAL(10,2) | DEFAULT 0 | Delivery fee |
| total | DECIMAL(10,2) | NOT NULL | Total amount |
| notes | TEXT | | Special instructions |
| receipt_url | VARCHAR(500) | | Payment receipt |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Order date |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

**Order Status ENUM:**
- pending
- processing
- ready_for_pickup
- out_for_delivery
- claimed
- completed
- cancelled

**Payment Status ENUM:**
- to_pay
- awaiting_confirmation
- paid
- refunded

**Payment Method ENUM:**
- cash_on_delivery
- gcash
- bank_transfer

**Delivery Method ENUM:**
- delivery
- pickup

#### **Table: order_items**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Item ID |
| order_id | INT | FOREIGN KEY → orders(id) | Order |
| product_id | INT | FOREIGN KEY → products(id) | Product |
| product_name | VARCHAR(255) | NOT NULL | Product name (snapshot) |
| quantity | INT | NOT NULL | Quantity ordered |
| unit_price | DECIMAL(10,2) | NOT NULL | Price per unit |
| subtotal | DECIMAL(10,2) | NOT NULL | Item subtotal |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

#### **Table: requests**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Request ID |
| request_number | VARCHAR(50) | UNIQUE, NOT NULL | e.g., "REQ-20241204-001" |
| user_id | INT | FOREIGN KEY → users(id) | Customer |
| type | ENUM | NOT NULL | Request type |
| status | ENUM | NOT NULL | Request status |
| data | JSON | NOT NULL | Request details |
| photo_url | VARCHAR(500) | | Reference photo |
| estimated_price | DECIMAL(10,2) | | Admin quote |
| final_price | DECIMAL(10,2) | | Final price |
| notes | TEXT | | Special requests |
| admin_notes | TEXT | | Admin notes |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

**Request Type ENUM:**
- booking (Event Booking)
- customized (Custom Bouquet)
- special_order (Special Order)

**Request Status ENUM:**
- pending
- quoted
- accepted
- in_progress
- completed
- cancelled

**Data JSON Structure Examples:**

**Booking:**
```json
{
  "eventType": "Wedding",
  "eventDate": "2024-12-25",
  "eventTime": "14:00",
  "venue": "Grand Ballroom, Manila Hotel",
  "guestCount": 150,
  "budget": "50000-100000",
  "specialRequests": "White and pink theme"
}
```

**Customized:**
```json
{
  "flower": { "name": "Rose", "color": "#ff0000" },
  "bundleSize": 24,
  "ribbon": { "color": "#ff69b4", "style": "satin" },
  "wrapper": { "color": "#ffffff", "material": "kraft" },
  "designImage": "base64_or_url"
}
```

**Special Order:**
```json
{
  "recipientName": "Maria Santos",
  "occasion": "Birthday",
  "deliveryDate": "2024-12-10",
  "addOns": ["chocolates", "teddy_bear"],
  "message": "Happy Birthday!"
}
```

#### **Table: wishlists**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Wishlist ID |
| user_id | INT | FOREIGN KEY → users(id) | User |
| product_id | INT | FOREIGN KEY → products(id) | Product |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Added date |

**Composite Unique:** (user_id, product_id)

#### **Table: reviews**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Review ID |
| product_id | INT | FOREIGN KEY → products(id) | Product |
| user_id | INT | FOREIGN KEY → users(id) | Reviewer |
| order_id | INT | FOREIGN KEY → orders(id) | Related order |
| rating | INT | CHECK (rating BETWEEN 1 AND 5) | Star rating |
| comment | TEXT | | Review text |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Review date |

#### **Table: stock**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Stock ID |
| name | VARCHAR(255) | NOT NULL | Item name |
| category | VARCHAR(100) | | Category |
| quantity | INT | NOT NULL | Current quantity |
| unit | VARCHAR(50) | | e.g., "pcs", "kg", "box" |
| reorder_level | INT | DEFAULT 10 | Low stock threshold |
| is_available | BOOLEAN | DEFAULT TRUE | Availability |
| image_url | VARCHAR(500) | | Item image |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

#### **Table: messages**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Message ID |
| order_id | INT | FOREIGN KEY → orders(id) | Related order |
| sender_id | INT | FOREIGN KEY → users(id) | Sender |
| sender_type | ENUM('customer', 'admin') | NOT NULL | Sender type |
| message_type | ENUM | DEFAULT 'text' | Message type |
| content | TEXT | NOT NULL | Message content |
| metadata | JSON | | Additional data |
| is_read | BOOLEAN | DEFAULT FALSE | Read status |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Sent time |

**Message Type ENUM:**
- text
- payment_request
- payment_confirmation
- system

**Metadata JSON Examples:**

**Payment Request:**
```json
{
  "amount": 2500,
  "dueDate": "2024-12-10",
  "paymentMethods": ["gcash", "bank_transfer"]
}
```

#### **Table: notifications**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Notification ID |
| user_id | INT | FOREIGN KEY → users(id) | Recipient |
| type | ENUM | NOT NULL | Notification type |
| title | VARCHAR(255) | NOT NULL | Title |
| message | TEXT | NOT NULL | Message |
| icon | VARCHAR(50) | | Icon class |
| link | VARCHAR(255) | | Action link |
| is_read | BOOLEAN | DEFAULT FALSE | Read status |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

**Notification Type ENUM:**
- order
- payment
- promotion
- system
- cancellation

#### **Table: admins**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Admin ID |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Admin email |
| password | VARCHAR(255) | NOT NULL | Hashed password |
| name | VARCHAR(255) | NOT NULL | Full name |
| role | ENUM('admin', 'employee') | DEFAULT 'employee' | Role |
| is_active | BOOLEAN | DEFAULT TRUE | Active status |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

#### **Table: about_content**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY | Always 1 (singleton) |
| description | TEXT | | Shop description |
| mission | TEXT | | Mission statement |
| vision | TEXT | | Vision statement |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

#### **Table: team_members**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | Member ID |
| name | VARCHAR(255) | NOT NULL | Name |
| position | VARCHAR(100) | NOT NULL | Position/Role |
| photo_url | VARCHAR(500) | | Photo |
| bio | TEXT | | Biography |
| display_order | INT | DEFAULT 0 | Display order |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | |

#### **Table: contact_info**
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | INT | PRIMARY KEY | Always 1 (singleton) |
| address | VARCHAR(500) | | Shop address |
| phone | VARCHAR(20) | | Phone number |
| email | VARCHAR(255) | | Email address |
| business_hours | TEXT | | Business hours |
| map_url | VARCHAR(1000) | | Google Maps embed URL |
| updated_at | TIMESTAMP | ON UPDATE CURRENT_TIMESTAMP | |

---

## 6. API ROUTE DESIGN

### 6.1 Authentication Routes

#### POST `/api/auth/register`
**Description:** Register new customer  
**Auth:** None  
**Request Body:**
```json
{
  "email": "maria@email.com",
  "password": "SecurePass123!",
  "name": "Maria Santos",
  "phone": "+63 912 345 6789"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": 1,
    "email": "maria@email.com",
    "name": "Maria Santos",
    "role": "customer"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST `/api/auth/login`
**Description:** User login  
**Auth:** None  
**Request Body:**
```json
{
  "email": "maria@email.com",
  "password": "SecurePass123!"
}
```
**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "maria@email.com",
    "name": "Maria Santos",
    "role": "customer"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST `/api/auth/admin/login`
**Description:** Admin/Employee login  
**Auth:** None  
**Request Body:**
```json
{
  "email": "admin@flowershop.com",
  "password": "AdminPass123!"
}
```

#### POST `/api/auth/logout`
**Description:** Logout user  
**Auth:** Required (JWT)

#### POST `/api/auth/change-password`
**Description:** Change password  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}
```

### 6.2 Product Routes

#### GET `/api/products`
**Description:** Get all products  
**Auth:** None  
**Query Params:**
- `category` (optional): Filter by category
- `search` (optional): Search by name
- `limit` (optional): Results per page
- `page` (optional): Page number

**Response:**
```json
{
  "success": true,
  "products": [
    {
      "id": 1,
      "name": "Red Rose Bouquet",
      "description": "Beautiful red roses",
      "price": 1500,
      "category": {
        "id": 1,
        "name": "Valentines"
      },
      "image_url": "https://...",
      "stock_quantity": 50,
      "is_active": true
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

#### GET `/api/products/:id`
**Description:** Get single product  
**Auth:** None  
**Response:**
```json
{
  "success": true,
  "product": {
    "id": 1,
    "name": "Red Rose Bouquet",
    "description": "Beautiful red roses",
    "price": 1500,
    "category": { "id": 1, "name": "Valentines" },
    "image_url": "https://...",
    "stock_quantity": 50,
    "reviews": [
      {
        "id": 1,
        "user": "Maria Santos",
        "rating": 5,
        "comment": "Beautiful!",
        "created_at": "2024-12-01T10:00:00Z"
      }
    ],
    "average_rating": 4.8
  }
}
```

#### POST `/api/products` (Admin)
**Description:** Create new product  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "name": "Sunflower Bouquet",
  "description": "Bright sunflowers",
  "price": 1200,
  "category_id": 2,
  "stock_quantity": 30,
  "image_url": "https://..."
}
```

#### PUT `/api/products/:id` (Admin)
**Description:** Update product  
**Auth:** Required (Admin/Employee)

#### DELETE `/api/products/:id` (Admin)
**Description:** Delete product  
**Auth:** Required (Admin)

### 6.3 Category Routes

#### GET `/api/categories`
**Description:** Get all categories  
**Auth:** None

#### POST `/api/categories` (Admin)
**Description:** Create category  
**Auth:** Required (Admin)

### 6.4 Cart & Wishlist Routes

#### GET `/api/cart`
**Description:** Get user's cart  
**Auth:** Required (JWT)

#### POST `/api/cart/add`
**Description:** Add item to cart  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "product_id": 1,
  "quantity": 2
}
```

#### PUT `/api/cart/update/:item_id`
**Description:** Update cart item quantity  
**Auth:** Required (JWT)

#### DELETE `/api/cart/remove/:item_id`
**Description:** Remove item from cart  
**Auth:** Required (JWT)

#### GET `/api/wishlist`
**Description:** Get user's wishlist  
**Auth:** Required (JWT)

#### POST `/api/wishlist/add`
**Description:** Add to wishlist  
**Auth:** Required (JWT)

#### DELETE `/api/wishlist/remove/:product_id`
**Description:** Remove from wishlist  
**Auth:** Required (JWT)

### 6.5 Order Routes

#### POST `/api/orders`
**Description:** Create new order  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "items": [
    { "product_id": 1, "quantity": 2 }
  ],
  "delivery_method": "delivery",
  "address_id": 1,
  "payment_method": "gcash",
  "notes": "Please deliver before 5pm",
  "receipt_url": "https://..." (if gcash/bank)
}
```
**Response:**
```json
{
  "success": true,
  "order": {
    "id": 1,
    "order_number": "ORD-20241204-001",
    "status": "pending",
    "payment_status": "awaiting_confirmation",
    "total": 3000
  }
}
```

#### GET `/api/orders`
**Description:** Get user's orders  
**Auth:** Required (JWT)  
**Query Params:**
- `status` (optional): Filter by status

#### GET `/api/orders/:id`
**Description:** Get order details  
**Auth:** Required (JWT)

#### PUT `/api/orders/:id/cancel`
**Description:** Cancel order  
**Auth:** Required (JWT)

#### GET `/api/orders/:id/track`
**Description:** Track order status  
**Auth:** Required (JWT)

### 6.6 Admin Order Routes

#### GET `/api/admin/orders`
**Description:** Get all orders  
**Auth:** Required (Admin/Employee)  
**Query Params:**
- `status` (optional)
- `payment_status` (optional)
- `date_from` (optional)
- `date_to` (optional)

#### PUT `/api/admin/orders/:id/status`
**Description:** Update order status  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "status": "processing"
}
```

#### PUT `/api/admin/orders/:id/payment-status`
**Description:** Update payment status  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "payment_status": "paid"
}
```

#### POST `/api/admin/orders/:id/accept`
**Description:** Accept order  
**Auth:** Required (Admin/Employee)

#### POST `/api/admin/orders/:id/decline`
**Description:** Decline order  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "reason": "Out of stock"
}
```

### 6.7 Request Routes (Bookings, Custom, Special Orders)

#### POST `/api/requests`
**Description:** Create new request  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "type": "booking",
  "data": {
    "eventType": "Wedding",
    "eventDate": "2024-12-25",
    "venue": "Grand Ballroom",
    "guestCount": 150,
    "budget": "50000-100000"
  },
  "photo_url": "https://...",
  "notes": "White and pink theme"
}
```

#### GET `/api/requests`
**Description:** Get user's requests  
**Auth:** Required (JWT)

#### GET `/api/requests/:id`
**Description:** Get request details  
**Auth:** Required (JWT)

#### PUT `/api/requests/:id/cancel`
**Description:** Cancel request  
**Auth:** Required (JWT)

### 6.8 Admin Request Routes

#### GET `/api/admin/requests`
**Description:** Get all requests  
**Auth:** Required (Admin/Employee)

#### PUT `/api/admin/requests/:id/quote`
**Description:** Provide quote  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "estimated_price": 50000,
  "admin_notes": "Includes 50 centerpieces"
}
```

#### PUT `/api/admin/requests/:id/accept`
**Description:** Accept request  
**Auth:** Required (Admin/Employee)

#### PUT `/api/admin/requests/:id/status`
**Description:** Update request status  
**Auth:** Required (Admin/Employee)

### 6.9 Address Routes

#### GET `/api/addresses`
**Description:** Get user's addresses  
**Auth:** Required (JWT)

#### POST `/api/addresses`
**Description:** Add new address  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "label": "Home",
  "recipient_name": "Maria Santos",
  "phone": "+63 912 345 6789",
  "street": "123 Sampaguita St.",
  "barangay": "Brgy. Maligaya",
  "city": "Quezon City",
  "province": "Metro Manila",
  "zip_code": "1100",
  "is_default": true
}
```

#### PUT `/api/addresses/:id`
**Description:** Update address  
**Auth:** Required (JWT)

#### DELETE `/api/addresses/:id`
**Description:** Delete address  
**Auth:** Required (JWT)

#### PUT `/api/addresses/:id/set-default`
**Description:** Set as default address  
**Auth:** Required (JWT)

### 6.10 Review Routes

#### POST `/api/reviews`
**Description:** Submit product review  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "product_id": 1,
  "order_id": 5,
  "rating": 5,
  "comment": "Beautiful flowers!"
}
```

#### GET `/api/reviews/product/:product_id`
**Description:** Get product reviews  
**Auth:** None

### 6.11 Message Routes

#### GET `/api/messages`
**Description:** Get user's messages  
**Auth:** Required (JWT)  
**Query Params:**
- `order_id` (optional): Filter by order

#### POST `/api/messages`
**Description:** Send message  
**Auth:** Required (JWT)  
**Request Body:**
```json
{
  "order_id": 1,
  "content": "When will my order be ready?"
}
```

#### PUT `/api/messages/:id/read`
**Description:** Mark message as read  
**Auth:** Required (JWT)

### 6.12 Admin Message Routes

#### GET `/api/admin/messages`
**Description:** Get all conversations  
**Auth:** Required (Admin/Employee)

#### GET `/api/admin/messages/order/:order_id`
**Description:** Get messages for specific order  
**Auth:** Required (Admin/Employee)

#### POST `/api/admin/messages`
**Description:** Send message to customer  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "order_id": 1,
  "user_id": 5,
  "content": "Your order is ready for pickup!"
}
```

#### POST `/api/admin/messages/payment-request`
**Description:** Send payment request  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "order_id": 1,
  "user_id": 5,
  "amount": 2500,
  "due_date": "2024-12-10"
}
```

### 6.13 Notification Routes

#### GET `/api/notifications`
**Description:** Get user's notifications  
**Auth:** Required (JWT)

#### PUT `/api/notifications/:id/read`
**Description:** Mark as read  
**Auth:** Required (JWT)

#### DELETE `/api/notifications/:id`
**Description:** Delete notification  
**Auth:** Required (JWT)

### 6.14 Admin Notification Routes

#### POST `/api/admin/notifications`
**Description:** Send notification  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "user_id": 5, // or null for all users
  "type": "promotion",
  "title": "Holiday Sale!",
  "message": "Get 20% off all bouquets",
  "link": "/products"
}
```

### 6.15 Stock Routes (Admin)

#### GET `/api/admin/stock`
**Description:** Get all stock items  
**Auth:** Required (Admin/Employee)

#### POST `/api/admin/stock`
**Description:** Add stock item  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "name": "Red Roses",
  "category": "Flowers",
  "quantity": 100,
  "unit": "stems",
  "reorder_level": 20,
  "image_url": "https://..."
}
```

#### PUT `/api/admin/stock/:id`
**Description:** Update stock  
**Auth:** Required (Admin/Employee)

#### DELETE `/api/admin/stock/:id`
**Description:** Delete stock item  
**Auth:** Required (Admin)

#### PUT `/api/admin/stock/:id/toggle`
**Description:** Toggle availability  
**Auth:** Required (Admin/Employee)

### 6.16 Admin Management Routes

#### GET `/api/admin/admins`
**Description:** Get all admins/employees  
**Auth:** Required (Admin only)

#### POST `/api/admin/admins`
**Description:** Create admin/employee  
**Auth:** Required (Admin only)  
**Request Body:**
```json
{
  "email": "employee@shop.com",
  "password": "TempPass123!",
  "name": "Juan Dela Cruz",
  "role": "employee"
}
```

#### PUT `/api/admin/admins/:id`
**Description:** Update admin  
**Auth:** Required (Admin only)

#### DELETE `/api/admin/admins/:id`
**Description:** Delete admin  
**Auth:** Required (Admin only)

### 6.17 Content Management Routes (Admin)

#### GET `/api/admin/about`
**Description:** Get about page content  
**Auth:** Required (Admin)

#### PUT `/api/admin/about`
**Description:** Update about page  
**Auth:** Required (Admin)  
**Request Body:**
```json
{
  "description": "We are...",
  "mission": "Our mission...",
  "vision": "Our vision..."
}
```

#### GET `/api/admin/team`
**Description:** Get team members  
**Auth:** Required (Admin)

#### POST `/api/admin/team`
**Description:** Add team member  
**Auth:** Required (Admin)

#### PUT `/api/admin/team/:id`
**Description:** Update team member  
**Auth:** Required (Admin)

#### DELETE `/api/admin/team/:id`
**Description:** Delete team member  
**Auth:** Required (Admin)

#### GET `/api/admin/contact`
**Description:** Get contact info  
**Auth:** Required (Admin)

#### PUT `/api/admin/contact`
**Description:** Update contact info  
**Auth:** Required (Admin)

### 6.18 Sales & Analytics Routes (Admin)

#### GET `/api/admin/sales/summary`
**Description:** Get sales summary  
**Auth:** Required (Admin)  
**Query Params:**
- `date_from` (optional)
- `date_to` (optional)

**Response:**
```json
{
  "success": true,
  "summary": {
    "total_revenue": 150000,
    "total_orders": 45,
    "pending_orders": 5,
    "completed_orders": 38,
    "average_order_value": 3333.33
  }
}
```

#### GET `/api/admin/sales/by-category`
**Description:** Sales by category  
**Auth:** Required (Admin)

#### GET `/api/admin/sales/top-products`
**Description:** Top selling products  
**Auth:** Required (Admin)

### 6.19 Sync Routes (Web ↔ Mobile)

#### POST `/api/sync`
**Description:** Sync data from mobile/web  
**Auth:** Required (Admin/Employee)  
**Request Body:**
```json
{
  "catalogueProducts": [...],
  "orders": [...],
  "stock": [...],
  "notifications": [...],
  "messages": [...]
}
```

#### GET `/api/sync`
**Description:** Get synced data  
**Auth:** Required (Admin/Employee)

#### GET `/api/admin/pull`
**Description:** Pull updates since timestamp  
**Auth:** Required (Admin/Employee)  
**Query Params:**
- `since` (timestamp): Get updates after this time

### 6.20 File Upload Routes

#### POST `/api/upload/image`
**Description:** Upload image  
**Auth:** Required (JWT)  
**Request:** multipart/form-data  
**Response:**
```json
{
  "success": true,
  "url": "https://cloudinary.com/..."
}
```

---

## 7. UNIFIED SYSTEM SYNCHRONIZATION

### 7.1 Data Consistency Strategy

**Shared Data Keys:**
- `catalogueProducts` - Product catalog
- `orders` - Customer orders
- `requests` - Special requests (bookings, custom, special orders)
- `stock` - Inventory
- `notifications` - Notifications
- `messages` - Customer messages
- `employees` - Employee data
- `aboutData` - About page content
- `contactData` - Contact page content

**Sync Methods:**

1. **API-Based Sync (Recommended)**
   - Web and mobile both connect to same backend API
   - Real-time updates via WebSocket (optional)
   - Polling for updates every 5-30 seconds

2. **localStorage Sync (Current - Development Only)**
   - Web uses localStorage
   - Mobile uses AsyncStorage
   - Manual export/import via QR code or file

### 7.2 Consistency Rules

1. **Single Source of Truth:** MySQL database
2. **Real-time Updates:** WebSocket for critical updates (new orders, messages)
3. **Offline Support:** Cache data locally, sync when online
4. **Conflict Resolution:** Last-write-wins with timestamp
5. **Data Validation:** Server-side validation for all mutations

### 7.3 Terminology Standardization

| Feature | Standardized Term |
|---------|------------------|
| Order types | "Order" (regular), "Request" (booking/custom/special) |
| Payment status | "To Pay", "Awaiting Confirmation", "Paid", "Refunded" |
| Order status | "Pending", "Processing", "Ready for Pickup", "Out for Delivery", "Claimed", "Completed", "Cancelled" |
| Delivery method | "Delivery", "Pickup" |
| Payment method | "Cash on Delivery", "GCash", "Bank Transfer" |
| User roles | "Customer", "Employee", "Admin" |

---

## 8. RECOMMENDATIONS & CLEANUP

### 8.1 Pages to Remove

1. ❌ **MyOrders.jsx** - Redundant with Profile.jsx (My Orders tab)
2. ❌ **AdminDashboard.native.jsx** - Use AdminDashboard.jsx for web, AdminDashboard.js for mobile

### 8.2 Pages to Add

1. ✅ **Customer Mobile App** - Complete customer-facing mobile experience
   - Home/Browse
   - Product Detail
   - Cart
   - Checkout
   - Orders
   - Profile
   - Custom Bouquet Designer
   - Event Booking
   - Special Orders

2. ✅ **Email Templates** - For notifications
   - Order confirmation
   - Order status updates
   - Payment confirmations
   - Welcome email
   - Password reset

3. ✅ **Admin Analytics Dashboard** - Enhanced reporting
   - Revenue charts
   - Order trends
   - Customer insights
   - Inventory alerts

### 8.3 Features to Add

1. **Product Reviews System** - Backend implementation
2. **Email Notifications** - Transactional emails
3. **SMS Notifications** - Order updates via SMS
4. **Push Notifications** - Mobile app notifications
5. **Payment Gateway Integration** - GCash, PayMaya, Stripe
6. **Inventory Alerts** - Low stock notifications
7. **Customer Loyalty Program** - Points/rewards
8. **Discount Codes** - Promo code system
9. **Order Scheduling** - Schedule future deliveries
10. **Multi-image Products** - Product image gallery

### 8.4 UX Improvements

1. **Simplify Navigation**
   - Reduce Profile page tabs (currently 4 tabs)
   - Merge "Messages" into "Orders" context
   - Move "Addresses" to Checkout flow

2. **Better Grouping**
   - Group all "Services" (Custom, Event, Special Order) under one menu
   - Separate "Shop" (products) from "Services"

3. **Rename for Clarity**
   - "Customized" → "Design Your Bouquet"
   - "Book Event" → "Event Flowers"
   - "Special Order" → "Gift Packages"
   - "My Orders" tab → "Order History"

4. **Mobile Optimization**
   - Reduce admin tabs on mobile (currently 10 tabs)
   - Use bottom navigation for top 5 features
   - Hamburger menu for remaining features

### 8.5 Missing Workflows

1. **Password Reset Flow**
   - Forgot password link
   - Email verification
   - Reset password page

2. **Email Verification Flow**
   - Verify email after registration
   - Resend verification email

3. **Refund Flow**
   - Request refund
   - Admin approve/decline
   - Process refund

4. **Product Availability Check**
   - Check stock before checkout
   - Reserve stock during checkout
   - Release stock if payment fails

5. **Order Modification Flow**
   - Customer requests changes
   - Admin approves/declines
   - Update order

---

## 9. IMPLEMENTATION PRIORITY

### Phase 1: Core Backend (Week 1-2)
1. ✅ Set up Node.js + Express + MySQL
2. ✅ Database schema creation
3. ✅ Authentication (JWT)
4. ✅ Product CRUD APIs
5. ✅ Order APIs
6. ✅ User profile APIs

### Phase 2: Essential Features (Week 3-4)
1. ✅ Cart & Wishlist APIs
2. ✅ Address management APIs
3. ✅ Request APIs (booking, custom, special)
4. ✅ Message APIs
5. ✅ Notification APIs

### Phase 3: Admin Features (Week 5-6)
1. ✅ Admin authentication
2. ✅ Order management APIs
3. ✅ Stock management APIs
4. ✅ Content management APIs
5. ✅ Sales analytics APIs

### Phase 4: Integration (Week 7-8)
1. ✅ Connect web app to backend
2. ✅ Connect mobile app to backend
3. ✅ File upload (Cloudinary)
4. ✅ Email notifications (SendGrid/Nodemailer)
5. ✅ Testing & bug fixes

### Phase 5: Advanced Features (Week 9-10)
1. ✅ Payment gateway integration
2. ✅ SMS notifications
3. ✅ Push notifications
4. ✅ Real-time messaging (WebSocket)
5. ✅ Review system

### Phase 6: Polish & Deploy (Week 11-12)
1. ✅ Performance optimization
2. ✅ Security hardening
3. ✅ Documentation
4. ✅ Deployment (Backend + Database)
5. ✅ Production testing

---

## 10. TECHNOLOGY STACK SUMMARY

### Frontend
- **Web:** React 19 + Vite + React Router + Bootstrap
- **Mobile:** React Native + Expo + React Navigation

### Backend (Recommended)
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MySQL 8.0
- **ORM:** Sequelize or mysql2
- **Authentication:** JWT (jsonwebtoken)
- **File Upload:** Multer + Cloudinary
- **Email:** Nodemailer or SendGrid
- **SMS:** Twilio (optional)
- **Real-time:** Socket.io (optional)

### DevOps
- **Hosting:** Railway, Render, or Vercel (backend)
- **Database:** Railway MySQL or PlanetScale
- **File Storage:** Cloudinary
- **Version Control:** Git + GitHub

---

## 11. NEXT STEPS

1. **Review this document** with your team
2. **Approve database schema** and API design
3. **Set up development environment**
   - Install Node.js, MySQL
   - Create project structure
   - Initialize Git repository
4. **Start Phase 1 implementation**
   - Create database
   - Build authentication APIs
   - Test with Postman
5. **Iterate and refine** based on testing

---

**Document Version:** 1.0  
**Last Updated:** 2024-12-04  
**Author:** Antigravity AI Assistant  
**Status:** Ready for Implementation
