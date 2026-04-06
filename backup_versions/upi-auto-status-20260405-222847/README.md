# CounterCraft POS - Full-Stack Retail Billing System

CounterCraft POS is a real-world, scalable Point of Sale web application for small retail shops.
It includes barcode checkout, inventory management, billing, transaction history, dashboard reports,
and offline fallback with local sync.

## Tech Stack

- Frontend: HTML, Tailwind CSS (CDN), custom CSS, vanilla JavaScript modules
- Backend: Node.js, Express, Mongoose
- Database: MongoDB
- Barcode scanner: QuaggaJS (camera-based)
- Offline mode: LocalStorage cache + pending sales queue

## Project Structure

```text
POS System/
|-- backend/
|   |-- package.json
|   |-- .env.example
|   `-- src/
|       |-- app.js
|       |-- server.js
|       |-- config/db.js
|       |-- models/
|       |   |-- Product.js
|       |   |-- Sale.js
|       |   |-- UpiPaymentSession.js
|       |   `-- InventoryLog.js
|       |-- controllers/
|       |   |-- productController.js
|       |   |-- billingController.js
|       |   |-- paymentController.js
|       |   `-- inventoryController.js
|       |-- routes/
|       |   |-- productsRoutes.js
|       |   |-- billingRoutes.js
|       |   |-- paymentsRoutes.js
|       |   |-- salesRoutes.js
|       |   `-- inventoryRoutes.js
|       |-- middlewares/errorHandler.js
|       `-- utils/
|           |-- errors.js
|           `-- dateRange.js
|-- frontend/
|   |-- index.html
|   |-- assets/styles.css
|   `-- js/
|       |-- app.js
|       |-- config.js
|       `-- services/
|           |-- api.js
|           `-- storage.js
`-- README.md
```

## Core Features Implemented

- Product search by name/barcode
- Add to cart with quantity control
- Auto total calculation with tax and discount
- Payment simulation: Cash, UPI, Card
- UPI Scan & Pay modal with dynamic QR and status polling
- Billing API with automatic stock deduction
- Invoice/bill modal with print support
- Barcode-based lookup and camera scanning
- Inventory management (add/edit/deactivate products)
- Manual stock updates and inventory logs
- Sales transaction history
- Sales dashboard (daily/weekly/monthly summaries)
- Low-stock alerts
- Offline fallback:
  - cached product list in LocalStorage
  - offline sale queue
  - automatic sync when internet reconnects

## UPI Auto-Status Payment Flow

- Frontend creates a UPI payment session via backend.
- Backend creates a provider payment link and returns dynamic QR value.
- Frontend polls session status periodically.
- On `paid` status, frontend auto-completes billing.
- Backend verifies payment status before finalizing sale and stock deduction.
- Optional webhook endpoint is available for provider callbacks.

## Database Schema

### Product Collection

```json
{
  "_id": "ObjectId",
  "name": "String",
  "price": "Number",
  "stock": "Number",
  "barcode": "String (unique)",
  "category": "String",
  "isActive": "Boolean",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Sale Collection

```json
{
  "_id": "ObjectId",
  "billNumber": "String (unique)",
  "items": [
    {
      "productId": "ObjectId",
      "name": "String",
      "barcode": "String",
      "unitPrice": "Number",
      "quantity": "Number",
      "lineTotal": "Number"
    }
  ],
  "subtotal": "Number",
  "tax": "Number",
  "discount": "Number",
  "total": "Number",
  "paymentMethod": "cash | upi | card",
  "paidAmount": "Number",
  "changeDue": "Number",
  "cashier": "String",
  "source": "online | offline_sync",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### InventoryLog Collection

```json
{
  "_id": "ObjectId",
  "productId": "ObjectId",
  "type": "add | deduct | set | sale",
  "quantity": "Number",
  "previousStock": "Number",
  "newStock": "Number",
  "referenceType": "manual | restock | adjustment | sale",
  "saleId": "ObjectId | null",
  "note": "String",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### UpiPaymentSession Collection

```json
{
  "_id": "ObjectId",
  "sessionId": "String (unique)",
  "provider": "razorpay",
  "providerPaymentLinkId": "String",
  "providerPaymentUrl": "String",
  "providerStatus": "String",
  "status": "pending | paid | completing | completed | cancelled | expired | failed",
  "amount": "Number",
  "currency": "INR",
  "upiId": "String",
  "shopName": "String",
  "upiLink": "String",
  "billingPayload": "Object",
  "summary": "Object",
  "completedSaleId": "ObjectId | null",
  "expiresAt": "Date",
  "paidAt": "Date | null",
  "completedAt": "Date | null",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

## REST API Endpoints

Base URL: `http://127.0.0.1:5000/api`

### Health

- `GET /health` - API health check

### Products

- `POST /products` - Add product
- `GET /products` - Get product list (search/filter/pagination)
- `GET /products/barcode/:barcode` - Barcode lookup
- `PUT /products/:id` - Update product details
- `PATCH /products/:id/stock` - Update stock (add/deduct/set)
- `DELETE /products/:id` - Deactivate product

### Billing and Sales

- `POST /billing/process` - Process bill, deduct stock, store sale, log inventory
- `GET /sales` - Transaction history (optional date filters)
- `GET /sales/summary` - Daily/weekly/monthly/custom report

### Payments (UPI)

- `POST /payments/upi/session` - Create provider-backed UPI payment session and QR data
- `GET /payments/upi/session/:sessionId/status` - Poll payment status
- `POST /payments/upi/session/:sessionId/complete` - Finalize billing after payment confirmation
- `POST /payments/upi/webhook` - Provider webhook callback endpoint

### Inventory

- `GET /inventory/overview` - Inventory metrics and low-stock list
- `GET /inventory/low-stock` - Low stock products by threshold
- `GET /inventory/logs` - Inventory update history

## Setup Instructions

## 1) Prerequisites

- Node.js 18+
- MongoDB running locally or remote MongoDB URI

## 2) Backend Setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend runs on `http://127.0.0.1:5000`.

## 3) Frontend Setup

Option A (recommended): use VS Code Live Server extension and open `frontend/index.html`.

Option B:

```bash
# From project root
npx serve frontend -l 5500
```

Then open `http://127.0.0.1:5500`.

## 4) CORS

By default backend uses:

- `CLIENT_ORIGIN=http://127.0.0.1:5500`

Update this in `backend/.env` if your frontend runs on a different origin.

## 5) UPI Gateway Setup (for auto payment completion)

Add these in `backend/.env`:

- `UPI_ID` - receiving UPI ID shown in fallback link
- `SHOP_NAME` - display name in UPI flow
- `UPI_SESSION_TIMEOUT_SEC` - modal/session timeout (default 120)
- `RAZORPAY_KEY_ID` - provider key id
- `RAZORPAY_KEY_SECRET` - provider key secret
- `RAZORPAY_WEBHOOK_SECRET` - webhook signature secret

If Razorpay keys are missing, app still supports manual UPI confirmation using fallback QR/link, but auto-status cannot be guaranteed.

## API Payload Examples

### Add Product

`POST /api/products`

```json
{
  "name": "Milk 1L",
  "price": 58,
  "stock": 45,
  "barcode": "8901234567890",
  "category": "Dairy"
}
```

### Process Billing

`POST /api/billing/process`

```json
{
  "items": [
    { "productId": "680f2f8a8e3b7f12f6e8d001", "quantity": 2 },
    { "barcode": "8901234567890", "quantity": 1 }
  ],
  "paymentMethod": "cash",
  "paidAmount": 200,
  "tax": 5,
  "discount": 0,
  "cashier": "Counter 1"
}
```

### Stock Update

`PATCH /api/products/:id/stock`

```json
{
  "mode": "add",
  "quantity": 10,
  "referenceType": "restock",
  "note": "Received supplier shipment"
}
```

## Real-Time and Offline Behavior

- Online sale:
  - backend validates stock and processes bill transactionally
  - stock is deducted immediately
  - sale and inventory logs are stored in MongoDB
- Offline sale:
  - app caches sale payload to LocalStorage queue
  - local cached inventory is reduced for continuity
  - queued sales auto-sync when internet is restored

## Scalability Notes

- Backend uses modular routes/controllers/models for clean extension.
- MongoDB indexes on barcode, bill number, and timestamps support faster queries.
- Billing uses MongoDB transactions to keep sale and stock updates consistent.
- Architecture supports adding auth, multi-store support, GST invoices, and cloud deployment.

## Recommended Next Enhancements

- Authentication and role-based access (cashier/admin)
- GST invoice templates and PDF export
- Supplier and purchase order module
- Redis caching for high-throughput stores
- WebSocket live counter updates across multiple terminals
