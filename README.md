# Titiabar Udyog — Inventory & Order Management

Multi-branch inventory and order management system for factory/trading operations.

## Features

- Multiple branches with separate stock, orders, and users
- Three stock categories: Raw Materials, Finished Goods, Trading Items
- Ledger-based stock (IN, OUT, RESERVE, RELEASE, ADJUSTMENT)
- Order flow: create → reserve stock → submit → deduct stock
- Receipt / challan printing
- Excel import for inventory master lists
- Admin dashboard with branch comparison
- Role-based access (Admin / Branch User)

## Tech Stack

- Next.js 15 (App Router)
- Prisma + PostgreSQL (Supabase)
- Tailwind CSS
- JWT session cookies

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your Supabase Postgres credentials:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` — Supabase pooled connection string
- `DIRECT_URL` — Direct connection for migrations
- `SESSION_SECRET` — Random 32+ character secret

### 3. Push database schema

```bash
npm run db:push
```

### 4. Seed sample data

```bash
npm run db:seed
```

Default logins after seed:
- **Admin:** `9999999999` / `admin123`
- **Branch user:** `8888888888` / `branch123`

### 5. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Excel Import Format

Upload `.xlsx` files with columns:
- `name` (or Name, Item, Item Name)
- `unit` (or Unit, UOM) — defaults to `pcs`
- `sku` (optional)

## Order Flow

1. Staff creates order → stock is **reserved** (available qty reduced, on-hand unchanged)
2. Receipt/challan can be printed
3. Staff clicks **Submit** → reserved stock becomes actual **OUT**
4. If cancelled → reservations are **released**

## Project Structure

```
src/
  app/
    (app)/          # Authenticated pages
    api/            # REST API routes
    login/          # Login page
  components/       # UI components
  lib/              # Auth, stock logic, DB, utilities
prisma/
  schema.prisma     # Database schema
  seed.ts           # Sample data
```
