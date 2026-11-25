# Snipe Shield — Authoritative Backend API Documentation
**Platform**: Next.js 16 + Supabase (PostgreSQL, GoTrue Auth, Realtime, Storage, RLS)  
**Security Model**: Server-side JWT Cookie validation (`@supabase/ssr`), Role-Based Access Control (RBAC: `bidder`, `seller`, `admin`), atomic database concurrency functions (`place_bid_v2`), and Row-Level Security.

---

## 1. Authentication & Session Management

All authenticated requests rely on standard HTTP-only Supabase session cookies (`sb-<project>-auth-token`) managed securely by Next.js Server Components, Server Actions, and Route Handlers using `@supabase/ssr`.

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/auth/callback` | `GET` | Public | Exchanges OAuth or OTP code for authenticated session, seeds initial `profiles` row with role `bidder`, and safely redirects to `/dashboard`. |
| `/api/auth/verify-captcha` | `POST` | Public | Verifies Cloudflare Turnstile token server-side prior to registration or high-risk actions. |

---

## 2. Auctions API

### 2.1 Fetch Active Auctions
- **URL**: `/api/auctions`
- **Method**: `GET`
- **Auth**: Public (Optional session)
- **Role**: Any
- **Query Parameters**:
  - `status`: `'active'` (default), `'ended'`, `'cancelled'`, or `'all'`
  - `category`: Filter by category (e.g. `'Electronics'`)
  - `seller_id`: Filter by seller UUID
  - `page`: Page number (default `1`)
  - `limit`: Items per page (default `40`, max `100`)
- **Response `200 OK`**:
```json
{
  "auctions": [
    {
      "id": "7c477410-e5a1-4321-9988-abcdef123456",
      "seller_id": "99b58071-0000-0000-0000-000000000001",
      "title": "MacBook Pro M3 Max 14-inch",
      "description": "Space Black, 36GB Unified Memory, 1TB SSD.",
      "category": "Laptops",
      "condition": "Like New",
      "defect_description": null,
      "condition_proof_urls": [],
      "image_url": "https://cqehuezhaxaehynrbtct.supabase.co/storage/v1/object/public/auction-images/...",
      "image_urls": ["..."],
      "starting_price": 185000,
      "current_price": 192000,
      "min_increment": 1000,
      "highest_bidder_id": "user-uuid",
      "status": "active",
      "starts_at": "2026-11-25T10:00:00Z",
      "ends_at": "2026-11-26T10:00:00Z",
      "extensions_count": 0,
      "shipping_cost": 0,
      "views_count": 142,
      "bid_count": 8,
      "created_at": "2026-11-25T09:30:00Z"
    }
  ],
  "page": 1,
  "limit": 40,
  "count": 1
}
```

---

### 2.2 Fetch Auction Details
- **URL**: `/api/auctions/[id]`
- **Method**: `GET`
- **Auth**: Public
- **Response `200 OK`**:
```json
{
  "auction": {
    "id": "7c477410-e5a1-4321-9988-abcdef123456",
    "title": "Sony Alpha A7 IV Full-Frame Camera",
    "seller_name": "ProCam Store",
    "seller_verified": true,
    "seller_trust_score": 98,
    "category": "Cameras",
    "condition": "Scratched",
    "defect_description": "Minor cosmetic hairline scuff on the battery door hinge.",
    "condition_proof_urls": ["https://.../proof1.jpg", "https://.../proof2.jpg"],
    "current_price": 142000,
    "min_increment": 500,
    "status": "active",
    "ends_at": "2026-11-26T18:00:00Z"
  },
  "bids": [
    {
      "id": "bid-uuid",
      "bidder_id": "user-uuid",
      "amount": 142000,
      "is_auto_proxy": false,
      "bid_source": "manual",
      "created_at": "2026-11-25T17:45:10Z"
    }
  ],
  "documents": []
}
```

---

### 2.3 Create Listing (Seller Only)
- **URL**: `/api/seller/auctions`
- **Method**: `POST`
- **Auth**: Required
- **Role**: `seller` (Verified server-side via `profiles` table)
- **Request Body**:
```json
{
  "title": "iPad Pro M4 11-inch (256GB)",
  "description": "Like-new condition with original fast charger and magnetic folio.",
  "category": "Electronics",
  "condition": "Like New",
  "startingPrice": 65000,
  "minIncrement": 500,
  "reservePrice": 75000,
  "shippingCost": 0,
  "shippingDetails": "Insured BlueDart Express dispatch in 24 hours.",
  "deliveryInfo": "2-3 business days across India.",
  "returnPolicy": "7-day escrow inspection return window.",
  "antiSnipeWindowSec": 30,
  "antiSnipeExtendSec": 30,
  "maxExtensions": 10,
  "startsAt": "2026-11-26T00:00:00.000Z",
  "endsAt": "2026-11-27T00:00:00.000Z",
  "imageUrls": ["https://.../img1.jpg"],
  "defectDescription": "",
  "conditionProofUrls": []
}
```
- **Validation Rules**:
  - `condition`: Must be one of the 16 approved values.
  - If condition is defective/damaged (anything other than `Brand New`, `Like New`, `Good`), requires `conditionProofUrls.length >= 2` (max 6) and `defectDescription.length >= 5`.
  - Image URLs must belong to authenticated seller's storage bucket prefix.
- **Response `200 OK`**:
```json
{ "id": "created-auction-uuid" }
```
- **Errors**:
  - `401 Unauthorized`: Not logged in.
  - `403 Forbidden`: User role is not `seller` or account is suspended.
  - `400 Bad Request`: Validation failure.

---

### 2.4 Update Seller Listing
- **URL**: `/api/auctions/[id]`
- **Method**: `PATCH`
- **Auth**: Required
- **Role**: `seller` (Owner only)
- **Request Body**:
```json
{
  "action": "pause" // "pause" | "resume" | "cancel" | "edit",
  "title": "Updated Title",
  "description": "Updated description..."
}
```
- **Response `200 OK`**: `{ "ok": true }`

---

### 2.5 Delete / Cancel Listing
- **URL**: `/api/auctions/[id]`
- **Method**: `DELETE`
- **Auth**: Required
- **Role**: `seller` (Owner only)
- **Rules**: Cannot cancel if auction already has active bids (`bid_count > 0`).

---

## 3. Bidding & Realtime Synchronization

### 3.1 Place Atomic Bid
- **URL**: `/api/auctions/[id]/bid`
- **Method**: `POST`
- **Auth**: Required
- **Role**: `bidder` or `admin` (`seller` role is rejected with 403 to prevent shill/self-bidding)
- **Headers**: `x-idempotency-key` (optional, for network retry safety)
- **Request Body**:
```json
{
  "amount": 72000,
  "maxProxy": 80000,
  "idempotencyKey": "bid_unique_string"
}
```
- **Database Concurrency & Anti-Snipe**:
  - Executed via stored procedure `place_bid_v2` with `select ... for update` row-level lock.
  - Validates:
    - User is not suspended.
    - Auction is currently `active` and within `[starts_at, ends_at]`.
    - Seller cannot bid on own listing.
    - Bid must meet `current_price + min_increment`.
    - If bid is placed within `anti_snipe_window_sec` (e.g. last 30s), extends `ends_at` by `anti_snipe_extend_sec` (+30s) up to `max_extensions`.
  - Broadcasts Realtime payload across `supabase_realtime` channels.
- **Response `200 OK`**:
```json
{
  "success": true,
  "current_price": 72000,
  "highest_bidder_id": "user-uuid",
  "is_leading": true,
  "ends_at": "2026-11-27T00:00:30.000Z",
  "extended": true,
  "bid_count": 9
}
```

---

### 3.2 Fetch Bid History & Highest Bid
- **URL**: `/api/auctions/[id]/bid`
- **Method**: `GET`
- **Auth**: Public
- **Response `200 OK`**:
```json
{
  "auctionId": "auction-uuid",
  "currentPrice": 72000,
  "highestBidderId": "user-uuid",
  "totalBids": 9,
  "status": "active",
  "highestBid": {
    "id": "bid-uuid",
    "amount": 72000,
    "bidder_id": "user-uuid",
    "created_at": "2026-11-26T00:05:00Z"
  },
  "history": [...]
}
```

---

## 4. Auction Finalization & Winning Receipts

### 4.1 Close / Finalize Auction
- **URL**: `/api/auctions/[id]/close`
- **Method**: `POST`
- **Auth**: Authenticated user or `x-cron-secret` header matching `CRON_SECRET`.
- **Logic**:
  - Determines highest bidder.
  - Checks hidden reserve price. If unmet, marks auction `ended` without order creation.
  - If reserve is met, atomically inserts record in `orders` table (`status: 'pending_payment'`).
  - Server computes 2% platform fee: `platform_fee = round(winning_bid * 0.02, 2)`.
  - Returns `orderId` for the winner.
- **Response `200 OK`**:
```json
{
  "closed": true,
  "orderId": "order-uuid",
  "order": { "id": "order-uuid", "status": "pending_payment" }
}
```

---

### 4.2 Fetch Auction Winner
- **URL**: `/api/auctions/[id]/winner`
- **Method**: `GET`
- **Auth**: Public
- **Response `200 OK`**:
```json
{
  "auctionId": "auction-uuid",
  "status": "ended",
  "isReserveMet": true,
  "winner": {
    "userId": "user-uuid",
    "name": "Jane Doe",
    "avatarUrl": "https://...",
    "winningBid": 72000,
    "orderId": "order-uuid",
    "orderStatus": "pending_payment"
  }
}
```

---

### 4.3 Fetch Buyer Won Auctions
- **URL**: `/api/auctions/won`
- **Method**: `GET`
- **Auth**: Required (`buyer_id === user.id`)
- **Response `200 OK`**:
```json
{
  "wonAuctions": [
    {
      "id": "order-uuid",
      "auction_id": "auction-uuid",
      "winning_bid_amount": 72000,
      "platform_fee": 1440,
      "final_price": 73440,
      "status": "pending_payment",
      "auctions": { "title": "iPad Pro M4", "category": "Electronics" }
    }
  ],
  "totalWon": 1
}
```

---

### 4.4 Fetch Winner Amount-Due Receipt
- **URL**: `/api/receipts/[orderId]`
- **Method**: `GET`
- **Auth**: Required (`order.buyer_id === user.id` OR `admin`)
- **Purpose**: Amount-due / winner invoice confirmation document.
- **Server Calculation**:
  $$\text{Winning Bid} = \text{Order Winning Bid}$$
  $$\text{Platform Commission} = \text{round}(\text{Winning Bid} \times 0.02, 2)$$
  $$\text{Total Payable} = \text{Winning Bid} + \text{Platform Commission}$$
- **Response `200 OK`**:
```json
{
  "receipt": {
    "receiptId": "SS-2026-F41A92B0",
    "orderId": "order-uuid",
    "auctionId": "auction-uuid",
    "productName": "iPad Pro M4 11-inch",
    "productImage": "https://...",
    "sellerName": "Verified Seller",
    "sellerVerified": true,
    "buyerName": "Jane Doe",
    "auctionStartedAt": "2026-11-25T10:00:00Z",
    "auctionEndedAt": "2026-11-26T10:00:00Z",
    "winningBid": 72000,
    "platformFee": 1440,
    "totalPayable": 73440,
    "currency": "INR",
    "paymentStatus": "pending",
    "orderStatus": "pending_payment",
    "razorpayOrderId": null,
    "razorpayPaymentId": null,
    "createdAt": "2026-11-26T10:00:01Z"
  }
}
```

---

## 5. Image & Condition Evidence Storage

### 5.1 Upload Product Image / Evidence
- **URL**: `/api/seller/upload-image`
- **Method**: `POST`
- **Auth**: Required (`seller` role)
- **Body**: `multipart/form-data` with `file: File`
- **Constraints**:
  - Types: `image/jpeg`, `image/png`, `image/webp` (verified by magic bytes + MIME type).
  - Max Size: `5MB`.
  - Destination: `auction-images/<seller_id>/<timestamp>-<random>.<ext>`
- **Response `200 OK`**:
```json
{
  "url": "https://cqehuezhaxaehynrbtct.supabase.co/storage/v1/object/public/auction-images/seller-uuid/1764124982-abc12345.webp"
}
```

---

## 6. Escrow & Payment Preparation

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/api/payments/create-order` | `POST` | Winner / Buyer | Creates Razorpay order reference for order ID, calculating exact INR amount server-side. |
| `/api/payments/verify` | `POST` | Winner / Buyer | Verifies Razorpay payment signature via HMAC-SHA256, marks order as `paid`, and writes payment ledger record. |
| `/api/payments/webhook` | `POST` | Public (Signed) | Authoritative Razorpay webhook listener verifying `x-razorpay-signature` and recording payment idempotently. |
| `/api/orders` | `GET` | Buyer / Seller / Admin | Lists user orders with escrow fulfillment status (`pending_payment`, `paid`, `shipped`, `delivered`, `disputed`). |
| `/api/orders` | `PATCH` | Buyer / Seller | Updates courier tracking number (`seller`) or confirms delivery (`buyer`). |
| `/api/disputes` | `POST` | Buyer / Seller | Initiates formal escrow mediation dispute with reason and description. |

---

## 7. Row-Level Security (RLS) Matrix

| Table | RLS Active | Anon / Public | Authenticated Buyer | Authenticated Seller | Admin |
|---|---|---|---|---|---|
| `profiles` | ✅ Yes | Read public fields | Update own profile | Update own profile | Read/write all |
| `auctions` | ✅ Yes | Read active/ended | Read | Insert / Update / Delete own | Full access |
| `bids` | ✅ Yes | Read | Insert (via `place_bid_v2`) | Blocked on own auction | Read all |
| `orders` | ✅ Yes | None | Read own purchases | Read own sales | Read/manage all |
| `payments` | ✅ Yes | None | Read own payments | Read related sale payouts | Read all |
| `audit_logs` | ✅ Yes | None | Insert own activity | Insert own activity | Full access |
| `asset_documents` | ✅ Yes | Read public docs | Read | Insert on own auction | Verify/Audit |
