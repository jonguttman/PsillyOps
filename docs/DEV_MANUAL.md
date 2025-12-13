# PsillyOps Developer Manual

**Version 1.0.0**  
**Last Updated: December 2024**

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Service Layer](#service-layer)
   - [Label Sheet Composition & QR Strategy](#label-sheet-composition--qr-strategy)
6. [API Routes](#api-routes)
7. [Authentication & Authorization](#authentication--authorization)
8. [Intelligent Logging System](#intelligent-logging-system)
9. [Development Workflow](#development-workflow)
10. [Deployment](#deployment)
11. [Tooltip System](#tooltip-system)
12. [Environment Variables](#environment-variables)

---

## Architecture Overview

PsillyOps follows a **strict three-layer architecture**:

```
┌─────────────────────────────────────────┐
│          UI Components Layer            │
│  (No business logic, display only)      │
└──────────────┬──────────────────────────┘
               │ fetch/actions
┌──────────────▼──────────────────────────┐
│          API Routes Layer               │
│  (Validate → Call Service → Return)     │
└──────────────┬──────────────────────────┘
               │ service calls
┌──────────────▼──────────────────────────┐
│          Service Layer                  │
│  (ALL business logic lives here)        │
└──────────────┬──────────────────────────┘
               │ prisma queries
┌──────────────▼──────────────────────────┐
│          PostgreSQL Database            │
│  (Single source of truth)               │
└─────────────────────────────────────────┘
```

### Key Principles

1. **Strict Layering**: API routes ONLY validate input, call services, return JSON
2. **Service Layer**: ALL business logic (allocation, MRP, calculations) in `/lib/services`
3. **Database Truth**: All data read from PostgreSQL, no client-side caching
4. **Intelligent Logging**: Every action logged with field-level diffs and auto-tags
5. **Type Safety**: TypeScript throughout, Prisma for type-safe database access

---

## Technology Stack

### Core Framework
- **Next.js 14+** - React framework with App Router
- **TypeScript** - Type safety throughout
- **React 19** - UI library

### Database & ORM
- **PostgreSQL** - Primary database
- **Prisma** - Type-safe ORM with migrations

### Authentication
- **NextAuth.js v5** (Auth.js) - Authentication with JWT sessions
- **bcryptjs** - Password hashing

### UI & Styling
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - Component library
- **Radix UI** - Headless UI primitives

### QR Codes
- **qrcode** - QR code generation
- **html5-qrcode** - Browser-based QR scanning

### Utilities
- **Zod** - Schema validation
- **date-fns** - Date formatting and manipulation

### Deployment
- **Vercel** - Frontend and API hosting
- **Railway/Supabase** - PostgreSQL database hosting

---

## Project Structure

```
/Users/jonathanguttman/PsillyOps/
├── app/                          # Next.js App Router
│   ├── (ops)/                    # Ops App (internal users)
│   │   ├── products/             # Product management
│   │   ├── materials/            # Material management
│   │   ├── vendors/              # Vendor management
│   │   ├── inventory/            # Inventory operations
│   │   ├── production/           # Production orders
│   │   ├── batches/              # Batch tracking
│   │   ├── orders/               # Retailer orders
│   │   ├── purchase-orders/      # Material POs
│   │   ├── analytics/            # Reports & dashboards
│   │   └── activity/             # Activity feed
│   ├── (rep)/                    # Rep Portal (sales reps)
│   │   ├── retailers/            # Retailer management
│   │   └── orders/               # Order creation
│   ├── qr/                       # QR code views
│   │   ├── batch/[batchId]/      # Batch QR view
│   │   ├── inventory/[id]/       # Inventory QR view
│   │   └── scan/                 # QR scanner page
│   ├── api/                      # API Routes (thin layer)
│   │   ├── auth/                 # NextAuth routes
│   │   ├── products/             # Product CRUD
│   │   ├── materials/            # Material CRUD
│   │   ├── inventory/            # Inventory operations
│   │   ├── orders/               # Order management
│   │   ├── batches/              # Batch operations
│   │   ├── production-orders/    # Production management
│   │   ├── purchase-orders/      # PO management
│   │   ├── activity/             # Activity logs
│   │   ├── analytics/            # Analytics endpoints
│   │   └── cron/                 # Scheduled jobs
│   ├── globals.css               # Global styles
│   └── layout.tsx                # Root layout
├── components/                   # React components
│   ├── ui/                       # shadcn/ui components
│   ├── shared/                   # Shared components
│   ├── products/                 # Product-specific
│   ├── inventory/                # Inventory-specific
│   ├── orders/                   # Order-specific
│   └── qr/                       # QR components
├── lib/                          # Core libraries
│   ├── db/                       # Database
│   │   └── prisma.ts             # Prisma client singleton
│   ├── auth/                     # Authentication
│   │   ├── auth.ts               # NextAuth config
│   │   └── rbac.ts               # Role-based access control
│   ├── services/                 # SERVICE LAYER (all business logic)
│   │   ├── loggingService.ts     # Intelligent logging
│   │   ├── allocationService.ts  # Order allocation (FIFO)
│   │   ├── mrpService.ts         # Material requirements planning
│   │   ├── productionService.ts  # Batch lifecycle
│   │   ├── inventoryService.ts   # Stock operations
│   │   ├── orderService.ts       # Order workflows
│   │   ├── costingService.ts     # Product costing
│   │   └── vendorService.ts      # Vendor scorecards
│   ├── utils/                    # Utilities
│   │   ├── errors.ts             # Error handling (shared model)
│   │   ├── validators.ts         # Zod schemas
│   │   └── formatters.ts         # Display formatting
│   └── types/                    # TypeScript types
│       └── enums.ts              # Canonical enums
├── prisma/                       # Prisma ORM
│   ├── schema.prisma             # Database schema (14+ models)
│   ├── seed.ts                   # Seed data script
│   └── migrations/               # Migration history
├── docs/                         # Documentation
│   ├── USER_MANUAL.md            # End-user documentation
│   └── DEV_MANUAL.md             # This file
├── middleware.ts                 # Route protection
├── next.config.ts                # Next.js config
├── tailwind.config.ts            # Tailwind config
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dependencies
└── .env                          # Environment variables
```

---

## Database Schema

### Core Models (14+ Entities)

#### Users & Authentication
- **User**: System users with roles (ADMIN, PRODUCTION, WAREHOUSE, REP)

#### Products & Materials
- **Product**: Finished goods SKUs
- **RawMaterial**: Ingredients and components
- **Vendor**: Material suppliers
- **MaterialVendor**: Many-to-many relationship with pricing
- **BOMItem**: Bill of Materials (product → materials mapping)

#### Inventory & Locations
- **Location**: Physical/logical storage locations
- **InventoryItem**: Stock records (products and materials)
  - Tracks: quantity on hand, quantity reserved, status, batch linkage

#### Production
- **ProductionOrder**: Work orders to manufacture products
- **Batch**: Individual production runs with traceability
- **BatchMaker**: Many-to-many (batch → users who made it)

#### Orders & Purchasing
- **Retailer**: Customers
- **RetailerOrder**: Sales orders from retailers
- **OrderLineItem**: Order line details with allocation info
- **PurchaseOrder**: Material purchase orders to vendors
- **PurchaseOrderLineItem**: PO line details

#### Logging & Analytics
- **ActivityLog**: Comprehensive audit trail with diffs and tags

### Key Relationships

```mermaid
erDiagram
    Product ||--o{ BOMItem : "has materials"
    BOMItem }o--|| RawMaterial : "uses"
    Product ||--o{ Batch : "produced as"
    Batch ||--o{ InventoryItem : "creates"
    Batch }o--o{ User : "made by"
    RetailerOrder ||--o{ OrderLineItem : "contains"
    OrderLineItem }o--|| Product : "orders"
    PurchaseOrder ||--o{ PurchaseOrderLineItem : "contains"
    PurchaseOrderLineItem }o--|| RawMaterial : "purchases"
    Vendor ||--o{ PurchaseOrder : "receives"
```

### Canonical Enums

Defined in both `prisma/schema.prisma` and `lib/types/enums.ts`:

- **UserRole**: ADMIN, PRODUCTION, WAREHOUSE, REP
- **OrderStatus**: DRAFT, SUBMITTED, APPROVED, IN_FULFILLMENT, SHIPPED, CANCELLED
- **ProductionStatus**: PLANNED, IN_PROGRESS, COMPLETED, CANCELLED
- **BatchStatus**: PLANNED, IN_PROGRESS, QC_HOLD, RELEASED, EXHAUSTED, CANCELLED
- **InventoryType**: PRODUCT, MATERIAL
- **InventoryStatus**: AVAILABLE, RESERVED, DAMAGED, SCRAPPED
- **PurchaseOrderStatus**: DRAFT, SENT, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
- **ActivityEntity**: PRODUCT, MATERIAL, BATCH, ORDER, PRODUCTION_ORDER, PURCHASE_ORDER

---

## Service Layer

The service layer contains **ALL business logic**. No logic in API routes or UI components.

### Core Services

#### loggingService.ts
**Intelligent activity logging with field-level diffs**

```typescript
logAction({
  entityType: ActivityEntity.ORDER,
  entityId: orderId,
  action: 'submitted',
  userId: session.user.id,
  summary: 'Order ORD-001 submitted by Sarah',
  before: { status: 'DRAFT' },
  after: { status: 'SUBMITTED' },
  details: { shortages: 2 },
  tags: ['submitted', 'shortage']
});
```

**Features:**
- Automatic field-level diff calculation
- Auto-generated tags based on action type
- Human-readable summaries
- Filterable activity feed

#### allocationService.ts
**Order allocation using FIFO**

```typescript
allocateOrder(orderId, userId);
// Returns: allocation result with shortages
```

**Logic:**
1. Query available inventory (status=AVAILABLE, product match)
2. Order by batch production date (FIFO)
3. Allocate quantities, update `quantityReserved`
4. Calculate shortages
5. Store allocation details on order line items

#### mrpService.ts
**Material Requirements Planning**

```typescript
// Check material requirements for production
checkMaterialRequirements(productId, quantity);

// Create production orders for shortages
createProductionOrdersForShortages(shortages, userId);

// Create POs for material shortages
createPurchaseOrdersForMaterialShortages(materialShortages, userId);

// Scheduled reorder point check
checkReorderPoints(userId);
```

**MRP Flow:**
1. Order submitted with shortage
2. Create production order for shortage
3. Calculate BOM requirements
4. Detect material shortages
5. Create purchase orders grouped by vendor

#### productionService.ts
**Batch lifecycle management**

```typescript
createBatch({ productId, plannedQuantity, ... });
updateBatchStatus(batchId, status, userId);
assignMakers(batchId, makerIds, userId);
completeBatch({ batchId, actualQuantity, locationId, ... });
```

**Completion Flow:**
1. Update batch: actualQuantity, status=RELEASED
2. Create InventoryItem at destination location
3. Update linked production order progress
4. Log completion with full details

#### inventoryService.ts
**Stock adjustments and movements**

```typescript
adjustInventory({ inventoryId, deltaQuantity, reason, userId });
moveInventory({ inventoryId, toLocationId, quantity, userId });
receiveMaterials({ materialId, quantity, locationId, userId });
```

#### orderService.ts
**End-to-end order workflows**

```typescript
createOrder(params);
submitOrder(orderId, userId);  // Triggers allocation + MRP
approveOrder(orderId, userId);
shipOrder({ orderId, trackingNumber, userId });
cancelOrder(orderId, userId);
```

### AI Services

#### aiClient.ts
**Pluggable AI provider abstraction**

```typescript
// Currently stubbed with basic pattern matching
interpretNaturalLanguageCommand(text: string): Promise<RawAICommandResult>
parseDocumentContent(text: string, context: string): Promise<RawAIDocumentResult>
```

**To integrate a real AI provider:**
1. Replace the stub implementations in `aiClient.ts`
2. Add your API key to environment variables
3. Update the functions to call OpenAI/Anthropic/etc.
4. The rest of the system will work without changes

#### aiCommandService.ts
**Natural language command interpretation and execution**

```typescript
// Interpret text into a typed command
const { log, command } = await interpretCommand(text, userId);

// Execute after user confirmation
const result = await executeInterpretedCommand(command, { userId, logId: log.id });
```

**Command Types (discriminated union):**
```typescript
type AICommandInterpretation =
  | ReceiveMaterialCommand    // "Purchased PE for 500"
  | MoveInventoryCommand      // "Move 40 Herc to FG"
  | AdjustInventoryCommand    // "Adjust LM down by 30g"
  | CreateRetailerOrderCommand // "Leaf ordered 10 Herc"
  | CompleteBatchCommand      // "Batch HERC-44 yield 842"
  | CreateMaterialCommand;    // "New material cacao powder"
```

**Reference Resolution:**
The service resolves fuzzy references to database IDs:
- `resolveMaterialRef("PE")` → finds "Penis Envy" material
- `resolveProductRef("Herc")` → finds "Hercules" product
- `resolveLocationRef("FG")` → finds "Finished Goods" location

**Adding new commands:**
1. Define a new command type with required args
2. Add to the `AICommandInterpretation` union
3. Add a case to `mapRawResultToCommand()`
4. Add validation in `validateCommand()`
5. Add execution handler `execute{CommandName}()`

#### aiIngestService.ts
**Document parsing and batch command execution**

```typescript
// Create import from pasted/uploaded text
const docImport = await createDocumentImport(text, 'PASTE', userId);

// List imports with filters
const { items, total } = await listDocumentImports({ status: 'PENDING_REVIEW' });

// Apply all commands from a document
const result = await applyDocumentImport(importId, userId);

// Reject if commands are incorrect
await rejectDocumentImport(importId, 'Incorrect data', userId);
```

---

## Label Sheet Composition & QR Strategy

PsillyOps label printing is intentionally **sheet-based** and **token-QR-based** for laser cutting and scan reliability. This section documents the parts that are easy to accidentally break.

### Core Design Rules (Do Not Break)

- **Printing always uses token URLs**: one token per physical label, QR encodes only `${baseUrl}/qr/${token}`
- **Preview never creates/stores tokens**: preview uses a fixed dummy token `qr_PREVIEW_TOKEN_DO_NOT_USE`
- **QR must be vector SVG** (not PNG/data URLs) and uses **errorCorrectionLevel `L`**
- **No scaling**: labels are never scaled to “fit more”
- **Letter sheets**: 8.5 × 11 in with 0.25 in margins on all sides
- **Rotation**: labels rotate 90° only when it increases capacity

### Shared Letter-Sheet Composer (Service Layer)

Implementation lives in `lib/services/labelService.ts` and is shared by preview and printing.

Responsibilities:
- **Physical size parsing**: reads the label SVG root `width`/`height` and converts to inches  
  - Supported units: `in`, `mm`, `cm`, `px` (assumes `px = 96dpi`)
  - Throws a clear validation error if size cannot be determined
- **Auto-tiling math** for letter sheets  
  - Sheet: `8.5in × 11in`, margin: `0.25in` → usable: `8.0in × 10.5in`
  - Computes capacity for both orientations (0° and 90°) and picks the higher
- **ID collision prevention (critical)**  
  - Every embedded label instance has its SVG IDs prefixed (gradients, clipPaths, masks, etc.)
  - References are rewritten as well: `id=...`, `url(#...)`, `href="#..."`, `xlink:href="#..."`

### Why Vector QR Is Mandatory

Small physical labels are scan-limited by print resolution and module density. Vector QR:
- stays sharp at any print DPI
- avoids blur from raster scaling
- improves scan success on small labels

### Endpoint Differences (Do Not Confuse These)

- `POST /api/labels/render-with-tokens`
  - Returns **individual label SVGs** plus token metadata
  - Creates tokens at render time
  - Useful for integrations that want per-label SVGs

- `POST /api/labels/render-letter-sheets`
  - Returns **letter-size sheet SVGs** (`sheets[]`) composed from token-rendered labels
  - Always creates one token per label instance
  - Intended for printing workflows

- `POST /api/labels/preview-sheet`
  - Returns **the first letter-size sheet SVG only**
  - Uses dummy token (`qr_PREVIEW_TOKEN_DO_NOT_USE`) and does **not** create tokens
  - Includes layout metadata via headers: cols/rows/perSheet/rotation/totalSheets

---

## API Routes

**CRITICAL**: API routes follow strict layering:

```typescript
// app/api/orders/[id]/submit/route.ts
export async function POST(req: NextRequest, { params }) {
  try {
    // 1. Validate input
    const session = await auth();
    if (!session) {
      return Response.json({ code: 'UNAUTHORIZED', ... }, { status: 401 });
    }

    // 2. Call service (ALL logic here)
    const result = await submitOrder(params.id, session.user.id);

    // 3. Return JSON
    return Response.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
```

### Error Handling

All errors use shared error model:

```typescript
interface ApiError {
  code: string;
  message: string;
  details?: any;
}
```

Services throw `AppError`:

```typescript
throw new AppError(
  ErrorCodes.INSUFFICIENT_INVENTORY,
  'Not enough stock to allocate'
);
```

API routes catch and convert:

```typescript
return handleApiError(error);  // Returns proper JSON + status
```

---

## Authentication & Authorization

### NextAuth.js v5 Configuration

Located in `lib/auth/auth.ts`:

```typescript
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      async authorize(credentials) {
        // Validate user, check password
        // Return user object
      }
    })
  ],
  callbacks: {
    jwt({ token, user }) {
      // Add role to token
    },
    session({ session, token }) {
      // Add role to session
    }
  }
});
```

### Role-Based Access Control (RBAC)

Defined in `lib/auth/rbac.ts`:

```typescript
export const PERMISSIONS = {
  products: {
    create: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.PRODUCTION, UserRole.WAREHOUSE, UserRole.REP]
  },
  inventory: {
    adjust: [UserRole.ADMIN, UserRole.WAREHOUSE],
    move: [UserRole.ADMIN, UserRole.WAREHOUSE, UserRole.PRODUCTION]
  },
  // ... more resources
};

hasPermission(userRole, 'inventory', 'adjust');  // true/false
```

### Route Protection

Middleware in `middleware.ts`:

```typescript
export default auth((req) => {
  if (!req.auth && !isPublicRoute) {
    return NextResponse.redirect('/login');
  }
  // Role-specific checks
});
```

### Using Auth in API Routes

```typescript
const session = await auth();
if (!session) {
  return Response.json({ code: 'UNAUTHORIZED', ... }, { status: 401 });
}

if (!hasPermission(session.user.role, 'inventory', 'adjust')) {
  return Response.json({ code: 'FORBIDDEN', ... }, { status: 403 });
}
```

---

## Intelligent Logging System

Every significant action must call `logAction()`.

### Features

**Field-Level Diffs:**
```typescript
logAction({
  before: { status: 'DRAFT', quantity: 100 },
  after: { status: 'SUBMITTED', quantity: 100 }
});
// Stores: diff: { status: ['DRAFT', 'SUBMITTED'] }
```

**Auto-Generated Tags:**
- `shortage`, `risk` → shortage-related actions
- `movement` → location transfers
- `allocation` → inventory allocations
- `quality` → QC holds
- `system` → automated actions
- `manual` → user-initiated
- `qr_scan` → QR code scans

**Human-Readable Summaries:**
```typescript
generateSummary({
  userName: 'Sarah',
  action: 'moved',
  entityName: '42 Hercules caps',
  details: { from: 'Packaging', to: 'Finished Goods' }
});
// Result: "Sarah moved 42 Hercules caps from Packaging to Finished Goods"
```

### Querying Activity Logs

```typescript
const logs = await getActivityFeed({
  entityType: ActivityEntity.BATCH,
  entityId: batchId,
  limit: 50
});
```

---

## Development Workflow

### Initial Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd PsillyOps

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL

# 4. Generate Prisma client
npx prisma generate

# 5. Push schema to database
npm run db:push

# 6. Seed database
npm run db:seed

# 7. Start development server
npm run dev
```

### Database Commands

```bash
# Push schema changes (no migration)
npm run db:push

# Generate migration
npx prisma migrate dev --name your_migration_name

# Seed database
npm run db:seed

# Open Prisma Studio (database GUI)
npm run db:studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset
```

### Development Server

```bash
npm run dev  # Starts on http://localhost:3000
```

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Next.js + TypeScript rules
- **Formatting**: Follow existing patterns
- **Comments**: Document complex business logic in services

### Adding New Features

**1. Add to Service Layer**
```typescript
// lib/services/yourService.ts
export async function yourBusinessLogic(params) {
  // All logic here
  await logAction({ ... });  // Always log
}
```

**2. Create API Route**
```typescript
// app/api/your-endpoint/route.ts
export async function POST(req) {
  // Validate → Call Service → Return JSON
}
```

**3. Add UI Component**
```typescript
// components/your-feature/YourComponent.tsx
// No business logic, just display
```

### Testing

**Manual Testing:**
1. Use seed data for consistent test state
2. Test workflows end-to-end
3. Check activity logs for audit trail
4. Verify permissions per role

**Automated Testing (Future):**
- Unit tests for services
- Integration tests for API routes
- E2E tests for critical workflows

---

## Deployment

### Vercel Deployment

**1. Connect Repository:**
- Link GitHub/GitLab repo to Vercel
- Vercel auto-detects Next.js

**2. Environment Variables:**
Set in Vercel dashboard:
```
DATABASE_URL=your_postgres_url
NEXTAUTH_SECRET=your_secret_key
NEXTAUTH_URL=https://your-domain.vercel.app
CRON_SECRET=your_cron_secret
```

**3. Build Settings:**
- Build Command: `next build`
- Output Directory: `.next`
- Install Command: `npm install`

**4. Deploy:**
```bash
git push  # Auto-deploys to Vercel
```

### Database Hosting

**Railway:**
```bash
# Create PostgreSQL database
# Copy connection string to DATABASE_URL
```

**Supabase:**
```bash
# Create project
# Use pooler connection string for DATABASE_URL
```

### Cron Jobs

Configure in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/reorder-check",
      "schedule": "0 0 * * *"
    }
  ]
}
```

### Post-Deployment

```bash
# Run migrations on production database
npx prisma migrate deploy

# (Optional) Seed production with initial data
# Be careful - only run once!
npm run db:seed
```

### Local-Only Development Note (SQLite)

PsillyOps can be developed entirely using a local SQLite database for convenience.  
This mode is recommended during early development for maximum speed, zero setup, and no network dependencies.

**Key points:**
- `.env` should use `file:./dev.db` for `DATABASE_URL`
- No cloud database is required while developing locally
- All Prisma migrations and `db push` operations will apply to the local SQLite file
- Production deployment can later switch to a managed database (Railway, Turso, etc.) without affecting local development
- The codebase is already compatible with both SQLite (local) and PostgreSQL (production)

You may continue working locally and revisit production configuration later.

---

## Tooltip System

PsillyOps includes a lightweight contextual tooltip system to reduce cognitive load on complex UI elements.

### Architecture

The tooltip system is intentionally simple (V1 scope):

- **Static content**: All tooltip text defined in a single registry file
- **No service layer**: Role filtering happens at render time
- **Local state**: Each tooltip manages its own visibility
- **No global provider**: Components are self-contained

### Core Files

| File | Purpose |
|------|---------|
| `lib/data/tooltips.ts` | Static tooltip content registry |
| `components/ui/Tooltip.tsx` | Base tooltip component |
| `components/ui/TooltipWrapper.tsx` | Smart wrapper with role filtering |
| `components/ui/StatusBadge.tsx` | Status badges with built-in tooltips |

### Usage

```tsx
import TooltipWrapper, { TooltipIcon } from '@/components/ui/TooltipWrapper';

// Basic usage
<TooltipWrapper tooltipId="ai-command-input" userRole={session.user.role}>
  <button>Action</button>
</TooltipWrapper>

// With help icon
<label className="flex items-center gap-1">
  Field Name
  <TooltipWrapper tooltipId="field-help" userRole={userRole}>
    <TooltipIcon />
  </TooltipWrapper>
</label>
```

### Adding New Tooltips

1. Add entry to `lib/data/tooltips.ts`:

```typescript
'my-tooltip-id': {
  id: 'my-tooltip-id',
  title: 'Tooltip Title',
  content: 'Explanation text...',
  helpLink: '/help#section',  // optional
  roles: [UserRole.ADMIN, UserRole.PRODUCTION],
  examples: ['Example 1', 'Example 2']  // optional
}
```

2. Wrap UI element with `TooltipWrapper`:

```tsx
<TooltipWrapper tooltipId="my-tooltip-id" userRole={userRole}>
  <MyComponent />
</TooltipWrapper>
```

### Positioning

Only `top` (default) and `bottom` positioning supported:

```tsx
<TooltipWrapper tooltipId="..." position="bottom">
```

### Accessibility

All tooltips include:
- `role="tooltip"` attribute
- `aria-describedby` linking
- Keyboard support (Tab to focus, Escape to close)
- `prefers-reduced-motion` respected
- Touch device support (click to toggle)

### Non-Goals (V1)

These features are explicitly out of scope:
- Tooltip analytics
- Admin tooltip editor
- Global tooltip state
- Localization
- Left/right positioning
- Collision detection

---

## Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL="postgresql://user:password@host:5432/dbname"

# NextAuth
NEXTAUTH_SECRET="generate_with_openssl_rand_base64_32"
NEXTAUTH_URL="http://localhost:3000"  # Production: https://your-domain.com

# Optional
CRON_SECRET="secret_for_cron_jobs"
SYSTEM_USER_ID="admin_user_id_for_system_actions"
NODE_ENV="development"
```

### Generating Secrets

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate CRON_SECRET
openssl rand -base64 32
```

---

## API Documentation

### Key Endpoints

**Orders:**
- `GET /api/orders` - List orders
- `POST /api/orders` - Create order
- `POST /api/orders/:id/submit` - Submit & allocate
- `POST /api/orders/:id/ship` - Ship order

**Inventory:**
- `GET /api/inventory` - List inventory
- `POST /api/inventory/adjust` - Adjust stock
- `POST /api/inventory/move` - Move between locations

**Production:**
- `POST /api/batches` - Create batch
- `POST /api/batches/:id/complete` - Complete batch
- `GET /api/production-orders` - List production orders

**Purchasing:**
- `POST /api/purchase-orders` - Create PO
- `POST /api/purchase-orders/:id/receive` - Receive materials

**Activity:**
- `GET /api/activity` - Activity feed with filters

**Analytics:**
- `GET /api/analytics/costing/:productId` - Product cost breakdown
- `GET /api/analytics/vendor-scorecards` - Vendor performance

**Cron:**
- `GET /api/cron/reorder-check` - Run reorder point check

---

## Extending the System

### Adding a New Entity

1. **Update Prisma Schema**
```prisma
model YourEntity {
  id        String   @id @default(cuid())
  name      String
  // ... fields
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

2. **Create Service**
```typescript
// lib/services/yourEntityService.ts
export async function createYourEntity(params) {
  const entity = await prisma.yourEntity.create({ ... });
  await logAction({ ... });
  return entity.id;
}
```

3. **Create API Route**
```typescript
// app/api/your-entities/route.ts
export async function POST(req) {
  const session = await auth();
  const body = await req.json();
  const id = await createYourEntity(body);
  return Response.json({ id });
}
```

4. **Add UI Components**
```tsx
// components/your-entities/YourEntityForm.tsx
```

### Adding Permissions

Edit `lib/auth/rbac.ts`:

```typescript
export const PERMISSIONS = {
  // ... existing
  yourResource: {
    create: [UserRole.ADMIN],
    update: [UserRole.ADMIN],
    delete: [UserRole.ADMIN],
    view: [UserRole.ADMIN, UserRole.WAREHOUSE]
  }
};
```

---

## Performance Considerations

- **Database Indexes**: All foreign keys and frequently queried fields indexed
- **Query Optimization**: Use Prisma `include` judiciously
- **Pagination**: Implement on large lists (inventory, orders, logs)
- **Caching**: Avoid in favor of database truth, but consider for static data

---

## Security Best Practices

- ✅ Passwords hashed with bcrypt
- ✅ JWT sessions with secret rotation
- ✅ RBAC on all API routes
- ✅ Input validation with Zod
- ✅ SQL injection prevention via Prisma
- ✅ CSRF protection via Next.js middleware
- ✅ Secrets in environment variables (never committed)

---

## Support & Contribution

For questions or contributions:
1. Review this manual and USER_MANUAL.md
2. Check activity logs for debugging
3. Contact dev team lead

---

**End of Developer Manual**

