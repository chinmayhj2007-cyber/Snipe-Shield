# 🛡️ SnipeShield (Snipe-Shield)

> **Avishkar'26 Real-Time Online Auction & Bidding Platform**  
> An enterprise-grade, real-time auction ecosystem engineered to prevent bid-sniping, guarantee fair market discovery, and secure digital escrow transactions.

[![Next.js 15](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20RLS-emerald?style=flat&logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-cyan?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌟 Key Highlights & Engineering Innovations

### 1. ⏱️ FAIRClose™ Dynamic Anti-Sniping Engine
Traditional auction platforms suffer from automated bot snipe attacks in the final milliseconds. SnipeShield introduces **FAIRClose™**:
- Any bid placed within the final **30-second window** dynamically extends the auction duration by **+30 seconds**.
- Fully authoritative at the database level with PostgreSQL triggers and row-level locking (`FOR UPDATE SKIP LOCKED`).
- Prevents sub-second network racing and ensures human bidders have adequate time to respond to competitive price changes.

### 2. 🤖 AutoBid AI & Intelligent Proxy Bidding
- Bidders can configure high-ceiling proxy limits.
- The system automatically places incremental bids on behalf of the user up to their specified threshold only when contested.
- Incorporates sub-millisecond tie-breaking logic and transaction rollback protection.

### 3. 🌐 Server-Authoritative Countdown & Expiration
- Timers sync against `/api/time` server clock reference with sub-second drift compensation.
- Automated closing powered by **Supabase `pg_cron`** calling `public.close_expired_auctions()` every minute.
- Proactive on-demand closing hooks on catalog queries and detail views ensure instantaneous state transitions (`active` → `ended`) without browser dependency.

### 4. 🔒 ShieldLock™ Escrow & Fraud Defense
- Cryptographic verification of asset provenance via Asset Passports.
- Integrated Cloudflare Turnstile CAPTCHA mitigation against automated crawler and bot networks.
- Winner checkout pipeline with order tracking and Razorpay payment integration.

### 5. 👥 Role-Segregated Portals
- **Bidder Studio**: Live ticker, streaming bid history, watchlist, saved proxy bids, and won auction settlements.
- **Seller Studio**: Instant listing wizard, reserve price controls, live buyer engagement telemetry, and settlement payouts.

---

## 🏗️ System Architecture

```mermaid
graph TD
    Client[Web Client: Next.js 15 + React 19] -->|REST / Server Actions| NextServer[Next.js App Server]
    Client -->|WebSocket Channel| SupabaseRT[Supabase Realtime Engine]
    NextServer -->|Server Authoritative Time| TimeAPI[/api/time]
    NextServer -->|PostgreSQL Wire| SupabaseDB[(PostgreSQL Database)]
    
    subgraph "Supabase DB & Cron Engine"
        SupabaseDB -->|Triggers| FairClose[FAIRClose Anti-Snipe Trigger]
        SupabaseDB -->|Locking Engine| PlaceBid[place_bid_v2 RPC]
        CronJob[pg_cron: * * * * *] -->|Every Minute| CloseExpired[close_expired_auctions RPC]
        CloseExpired -->|Create Order| OrdersTable[(Orders)]
    end
```

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15 (App Router, React Server Components) |
| **Frontend** | React 19, Tailwind CSS, Lucide Icons, Framer Motion |
| **Backend & DB** | Supabase (PostgreSQL 15), Row Level Security (RLS) |
| **Realtime** | Supabase Realtime Channels (PostgreSQL publication stream) |
| **Job Scheduling** | Supabase `pg_cron` |
| **Payments** | Razorpay Checkout SDK |
| **Bot Protection** | Cloudflare Turnstile |

---

## 🛠️ Quick Start & Local Setup

### Prerequisites
- Node.js 18+ or 20+
- npm or pnpm

### 1. Clone the Repository
```bash
git clone https://github.com/chinmayhj2007-cyber/Snipe-Shield.git
cd Snipe-Shield
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the root directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_turnstile_site_key
TURNSTILE_SECRET_KEY=your_turnstile_secret_key

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📊 Core Database Procedures

- `place_bid_v2(p_auction_id, p_bidder_id, p_amount)`: Atomic bid placement, reserve price validation, and FAIRClose 30s extension.
- `close_expired_auctions()`: Idempotent batch closure of expired auctions, order creation for top bidder, and notification dispatch.
- `close_auction_if_expired(p_auction_id)`: Instant on-demand single auction finalization.

---

## 🛡️ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. Built with ❤️ for **Avishkar'26**.
