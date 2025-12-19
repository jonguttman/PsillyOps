# PsillyOps - Inventory Management System

Complete inventory management system for mushroom supplement production.

## Features

- ✅ **Product & Material Management** - Full catalog with BOMs
- ✅ **Automatic Allocation** - FIFO-based order allocation
- ✅ **MRP Engine** - Shortage detection and automated ordering
- ✅ **Production Tracking** - Batch lifecycle with QR codes
- ✅ **Purchase Management** - Vendor POs and receiving
- ✅ **Intelligent Logging** - Complete audit trail with field-level diffs
- ✅ **Role-Based Access** - ADMIN, PRODUCTION, WAREHOUSE, REP
- ✅ **Real-time Dashboards** - Inventory, orders, and production metrics

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL

# 3. Generate Prisma client
npx prisma generate

# 4. Push schema to database
npm run db:push

# 5. Seed database with test data
npm run db:seed

# 6. Start development server
npm run dev
```

### Test Accounts

After seeding, login with:
- **Admin**: `admin@psillyops.com` / `password123`
- **Production**: `john@psillyops.com` / `password123`
- **Warehouse**: `mike@psillyops.com` / `password123`
- **Sales Rep**: `sarah@psillyops.com` / `password123`

## Documentation

- **[User Manual](docs/USER_MANUAL.md)** - Complete user guide for all roles
- **[Developer Manual](docs/DEV_MANUAL.md)** - Technical architecture and API docs

## Technology Stack

- **Next.js 14+** - React framework with App Router
- **TypeScript** - Type safety
- **PostgreSQL** - Database
- **Prisma** - ORM with migrations
- **NextAuth.js v5** - Authentication
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library

## Project Structure

```
/app            # Next.js routes (Ops App, Rep Portal, QR views)
/components     # React components
/lib            
  /services     # ALL business logic (allocation, MRP, production, etc.)
  /auth         # Authentication & RBAC
  /db           # Prisma client
  /utils        # Helpers
/prisma         # Database schema and migrations
/docs           # Documentation
```

## Key Workflows

### Order-to-Production Flow

1. **Rep creates order** → System allocates inventory (FIFO)
2. **Shortage detected** → Production order created automatically
3. **Material check** → Purchase orders created for shortages
4. **Warehouse receives** → Materials restocked
5. **Production completes** → Finished goods added to inventory
6. **Order ships** → Inventory fulfilled

### Batch Tracking

1. Create batch from production order
2. Track through stages (Grinding → Mixing → Filling → Packaging → QC → Released)
3. Assign makers for traceability
4. Complete batch → Creates finished goods inventory
5. QR code for full traceability

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run db:push      # Push schema changes to database
npm run db:seed      # Seed database with test data
npm run db:studio    # Open Prisma Studio (database GUI)
```

## Environment Variables

```bash
DATABASE_URL="postgresql://user:password@host:5432/dbname"
NEXTAUTH_SECRET="your_secret_key"
NEXTAUTH_URL="http://localhost:3000"
```

## Deployment

### Vercel + Railway

1. **Connect repository to Vercel**
2. **Create PostgreSQL database on Railway**
3. **Set environment variables in Vercel**
4. **Deploy**: `git push` (auto-deploys)

See [Developer Manual](docs/DEV_MANUAL.md) for detailed deployment instructions.

## License

Proprietary - All rights reserved

## Support

For questions or support, contact your system administrator.






