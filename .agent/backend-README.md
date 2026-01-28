# FlowerForge Backend - Setup & Installation Guide

## 📋 Prerequisites

- **Node.js** 18+ installed
- **MySQL** 8.0+ installed and running
- **npm** or **yarn** package manager
- **Git** (optional, for version control)

---

## 🚀 Quick Start

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

### Step 2: Configure Environment

1. Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```

2. Edit `.env` and update these values:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=flowerforge

# JWT Secret (generate a random string)
JWT_SECRET=your_super_secret_jwt_key_here

# Cloudinary (optional - for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Step 3: Create Database

1. Open MySQL command line or MySQL Workbench
2. Run the schema file:

```bash
mysql -u root -p < database/schema_complete.sql
```

Or manually:
```sql
source /path/to/backend/database/schema_complete.sql
```

### Step 4: Create Admin Account

The schema creates a default admin account, but you need to hash the password.

Run this Node.js script to generate a hashed password:

```javascript
const bcrypt = require('bcryptjs');
const password = 'Admin123!'; // Change this
bcrypt.hash(password, 10).then(hash => console.log(hash));
```

Then update the admin in MySQL:
```sql
UPDATE admins 
SET password = '$2a$10$YourHashedPasswordHere' 
WHERE email = 'admin@flowerforge.com';
```

### Step 5: Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

You should see:
```
🌸 ========================================
🌸  FlowerForge API Server
🌸 ========================================
🌸  Environment: development
🌸  Port: 5000
🌸  URL: http://localhost:5000
🌸 ========================================
```

---

## 📁 Project Structure

```
backend/
├── config/
│   └── database.js          # MySQL connection pool
├── middleware/
│   ├── auth.js              # JWT authentication
│   └── upload.js            # File upload handling
├── routes/
│   ├── auth.js              # Authentication routes
│   ├── products.js          # Product CRUD
│   ├── categories.js        # Categories
│   ├── orders.js            # Order management
│   ├── requests.js          # Special requests
│   ├── addresses.js         # User addresses
│   ├── wishlist.js          # Wishlist
│   ├── reviews.js           # Product reviews
│   ├── messages.js          # Messaging
│   ├── notifications.js     # Notifications
│   ├── admin.js             # Admin routes
│   └── upload.js            # File upload
├── database/
│   └── schema_complete.sql  # Database schema (complete)
├── uploads/                 # Uploaded files
├── .env.example             # Environment template
├── .env                     # Your environment (create this)
├── package.json             # Dependencies
└── server.js                # Main server file
```

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register customer
- `POST /api/auth/login` - Customer login
- `POST /api/auth/admin/login` - Admin/Employee login
- `POST /api/auth/change-password` - Change password
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (Admin)
- `PUT /api/products/:id` - Update product (Admin)
- `DELETE /api/products/:id` - Delete product (Admin)

### Orders
- `GET /api/orders` - Get user orders
- `GET /api/orders/:id` - Get order details
- `POST /api/orders` - Create order
- `PUT /api/orders/:id/cancel` - Cancel order

### Admin Orders
- `GET /api/admin/orders` - Get all orders
- `PUT /api/admin/orders/:id/status` - Update status
- `PUT /api/admin/orders/:id/payment-status` - Update payment
- `POST /api/admin/orders/:id/accept` - Accept order
- `POST /api/admin/orders/:id/decline` - Decline order

**See SYSTEM_ANALYSIS.md for complete API documentation**

---

## 🧪 Testing the API

### Using cURL

**Register a user:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"Test123!\",\"name\":\"Test User\"}"
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"Test123!\"}"
```

**Get products:**
```bash
curl http://localhost:5000/api/products
```

### Using Postman

1. Import the API collection (create one from SYSTEM_ANALYSIS.md)
2. Set environment variable `BASE_URL` = `http://localhost:5000`
3. After login, save the token
4. Add token to Authorization header: `Bearer YOUR_TOKEN`

---

## 🔧 Common Issues & Solutions

### Issue: "Database connection failed"
**Solution:** 
- Check MySQL is running
- Verify DB credentials in `.env`
- Ensure database `flowerforge` exists

### Issue: "Port 5000 already in use"
**Solution:**
- Change PORT in `.env` to another port (e.g., 5001)
- Or kill the process using port 5000

### Issue: "JWT_SECRET is not defined"
**Solution:**
- Make sure `.env` file exists
- Add `JWT_SECRET=your_secret_key`

### Issue: "Cannot find module"
**Solution:**
- Run `npm install` again
- Delete `node_modules` and `package-lock.json`, then `npm install`

---

## 📦 Deployment

### Deploy to Railway

1. Create account at [railway.app](https://railway.app)
2. Create new project
3. Add MySQL database
4. Deploy from GitHub or local
5. Set environment variables in Railway dashboard
6. Deploy!

### Deploy to Render

1. Create account at [render.com](https://render.com)
2. Create Web Service
3. Add MySQL database (or use external)
4. Set environment variables
5. Deploy!

---

## 🔐 Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT_SECRET
- [ ] Enable HTTPS in production
- [ ] Set up CORS properly
- [ ] Use environment variables for secrets
- [ ] Enable rate limiting
- [ ] Validate all inputs
- [ ] Use prepared statements (already done)
- [ ] Hash passwords (already done)
- [ ] Set up backup for database

---

## 📝 Next Steps

1. ✅ Backend is set up
2. ⏳ Connect frontend to backend
3. ⏳ Test all features
4. ⏳ Add payment gateway
5. ⏳ Set up email notifications
6. ⏳ Deploy to production

---

## 🆘 Need Help?

- Check `SYSTEM_ANALYSIS.md` for detailed documentation
- Review error logs in console
- Check MySQL logs
- Verify `.env` configuration

---

**Happy Coding! 🌸**
