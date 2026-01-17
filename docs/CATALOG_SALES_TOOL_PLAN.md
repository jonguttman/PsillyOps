# Retailer Sales Catalog Tool - Implementation Plan

## Overview

A **shareable, trackable product catalog** with unique links per retailer. No login required—just a unique URL that provides personalized catalog access with full engagement tracking.

**Example URL**: `yoursite.com/catalog/Xk9mP` → Personalized catalog for Retailer ABC

---

## Features

### Core Features
| Feature | Description |
|---------|-------------|
| **Unique Trackable Links** | Each retailer gets a unique token-based URL |
| **View Tracking** | Track catalog views and product interest |
| **No Authentication** | Frictionless access via link only |

### Enhancements (All Included)
| Feature | Description |
|---------|-------------|
| **Custom Pricing** | Per-retailer pricing overrides |
| **Product Subsets** | Show only specific products to specific retailers |
| **Branding** | Retailer name displayed in catalog header |
| **PDF Export** | Downloadable branded catalog PDF |
| **Contact Form** | In-page inquiry with name, business, follow-up contact |
| **Expiring Links** | Optional expiration date for links |
| **QR Code** | Generate QR codes for catalog links |

---

## Database Schema

### New Models

```prisma
// Status for catalog links
enum CatalogLinkStatus {
  ACTIVE
  EXPIRED
  REVOKED
}

// Main catalog link model
model CatalogLink {
  id              String            @id @default(cuid())
  token           String            @unique  // Short token: "Xk9mP" (6 chars)

  // Association
  retailerId      String
  retailer        Retailer          @relation(fields: [retailerId], references: [id])

  // Branding
  displayName     String?           // Custom display name (defaults to retailer name)

  // Custom pricing (JSON map of productId -> price)
  customPricing   Json?             // { "prod_123": 45.00, "prod_456": 89.00 }

  // Product subset (null = all products, array = specific product IDs)
  productSubset   Json?             // ["prod_123", "prod_456"] or null for all

  // Tracking
  viewCount       Int               @default(0)
  lastViewedAt    DateTime?

  // Lifecycle
  status          CatalogLinkStatus @default(ACTIVE)
  expiresAt       DateTime?         // Optional expiration
  createdAt       DateTime          @default(now())
  createdById     String
  createdBy       User              @relation(fields: [createdById], references: [id])

  // Analytics
  productViews    CatalogProductView[]
  inquiries       CatalogInquiry[]

  @@index([token])
  @@index([retailerId])
  @@index([status])
  @@index([createdById])
}

// Track individual product views per catalog link
model CatalogProductView {
  id              String      @id @default(cuid())
  catalogLinkId   String
  catalogLink     CatalogLink @relation(fields: [catalogLinkId], references: [id], onDelete: Cascade)
  productId       String
  product         Product     @relation(fields: [productId], references: [id])

  viewCount       Int         @default(0)
  lastViewedAt    DateTime    @default(now())

  @@unique([catalogLinkId, productId])
  @@index([catalogLinkId])
  @@index([productId])
}

// Contact form submissions / inquiries
model CatalogInquiry {
  id              String      @id @default(cuid())
  catalogLinkId   String
  catalogLink     CatalogLink @relation(fields: [catalogLinkId], references: [id], onDelete: Cascade)

  // Contact info captured
  contactName     String      // Name of person inquiring
  businessName    String      // Business name
  email           String
  phone           String?
  followUpWith    String?     // Who they want to follow up with

  // Inquiry details
  message         String?
  productsOfInterest Json?    // Array of product IDs they're interested in

  // Tracking
  ipAddress       String?
  userAgent       String?

  // Status
  status          InquiryStatus @default(NEW)
  respondedAt     DateTime?
  respondedById   String?
  notes           String?

  createdAt       DateTime    @default(now())

  @@index([catalogLinkId])
  @@index([status])
  @@index([createdAt])
}

enum InquiryStatus {
  NEW
  CONTACTED
  CONVERTED
  CLOSED
}
```

### Schema Changes to Existing Models

```prisma
// Add to Retailer model
model Retailer {
  // ... existing fields
  catalogLinks    CatalogLink[]
}

// Add to Product model
model Product {
  // ... existing fields
  catalogViews    CatalogProductView[]
}

// Add to User model
model User {
  // ... existing fields
  catalogLinks    CatalogLink[]
}
```

---

## Route Structure

### Public Routes (No Auth)

```
/app/(public)/catalog/
├── [token]/
│   ├── page.tsx                    # Main catalog view
│   ├── product/
│   │   └── [productId]/
│   │       └── page.tsx            # Product detail with inquiry form
│   └── pdf/
│       └── route.ts                # PDF download endpoint
```

### Admin Routes (Auth Required)

```
/app/ops/catalog-links/
├── page.tsx                        # List all catalog links
├── new/
│   └── page.tsx                    # Create new catalog link
├── [id]/
│   ├── page.tsx                    # View/edit catalog link
│   └── analytics/
│       └── page.tsx                # Detailed analytics
└── inquiries/
    └── page.tsx                    # All inquiries across links
```

---

## API Endpoints

### Public Endpoints (No Auth)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/catalog/[token]` | GET | Get catalog data, track view |
| `/api/catalog/[token]/product/[id]` | GET | Get product detail, track view |
| `/api/catalog/[token]/inquiry` | POST | Submit contact form inquiry |
| `/api/catalog/[token]/pdf` | GET | Generate and download PDF |
| `/api/catalog/[token]/qr` | GET | Get QR code image for link |

### Admin Endpoints (Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ops/catalog-links` | GET | List all catalog links |
| `/api/ops/catalog-links` | POST | Create new catalog link |
| `/api/ops/catalog-links/[id]` | GET | Get catalog link details |
| `/api/ops/catalog-links/[id]` | PATCH | Update catalog link |
| `/api/ops/catalog-links/[id]` | DELETE | Revoke/delete catalog link |
| `/api/ops/catalog-links/[id]/analytics` | GET | Get detailed analytics |
| `/api/ops/catalog-links/inquiries` | GET | List all inquiries |
| `/api/ops/catalog-links/inquiries/[id]` | PATCH | Update inquiry status |

---

## Service Layer

### `catalogLinkService.ts`

```typescript
// Token generation
function generateCatalogToken(): string
  // Generate 6-char Base62 token

// CRUD operations
function createCatalogLink(params: {
  retailerId: string;
  createdById: string;
  displayName?: string;
  customPricing?: Record<string, number>;
  productSubset?: string[];
  expiresAt?: Date;
}): Promise<CatalogLink>

function getCatalogLink(id: string): Promise<CatalogLink | null>

function updateCatalogLink(id: string, updates: Partial<CatalogLink>): Promise<CatalogLink>

function revokeCatalogLink(id: string): Promise<void>

// Public resolution
function resolveCatalogToken(token: string, metadata?: {
  ip?: string;
  userAgent?: string;
}): Promise<CatalogLinkResolution | null>
  // Returns null if invalid/expired/revoked
  // Increments viewCount, updates lastViewedAt
  // Logs to ActivityLog

// Product operations
function getCatalogProducts(catalogLinkId: string): Promise<CatalogProduct[]>
  // Returns products with custom pricing applied
  // Filters to productSubset if specified
  // Includes stock availability

function trackProductView(catalogLinkId: string, productId: string): Promise<void>
  // Upserts CatalogProductView record
  // Logs to ActivityLog

// Inquiry operations
function createInquiry(params: {
  catalogLinkId: string;
  contactName: string;
  businessName: string;
  email: string;
  phone?: string;
  followUpWith?: string;
  message?: string;
  productsOfInterest?: string[];
  ip?: string;
  userAgent?: string;
}): Promise<CatalogInquiry>

function updateInquiryStatus(id: string, status: InquiryStatus, notes?: string, respondedById?: string): Promise<CatalogInquiry>

// Analytics
function getCatalogLinkAnalytics(id: string): Promise<CatalogAnalytics>
  // Total views, unique product views, inquiries
  // Top viewed products
  // View timeline

function getProductViewsForLink(catalogLinkId: string): Promise<ProductViewSummary[]>

// PDF generation
function generateCatalogPDF(catalogLinkId: string): Promise<Buffer>
  // Branded PDF with products and pricing

// QR code generation
function generateCatalogQRCode(token: string, options?: {
  size?: number;
  format?: 'png' | 'svg';
}): Promise<Buffer | string>
```

---

## UI Components

### Public Components

```
/components/catalog/
├── CatalogHeader.tsx           # Branded header with retailer name
├── ProductGrid.tsx             # Product listing grid
├── ProductCard.tsx             # Individual product card
├── ProductDetail.tsx           # Full product view
├── InquiryForm.tsx             # Contact form
├── PriceDisplay.tsx            # Price with custom pricing support
├── StockBadge.tsx              # In Stock / Low Stock / Out of Stock
├── CatalogFooter.tsx           # Footer with contact info
└── PDFDownloadButton.tsx       # Download PDF button
```

### Admin Components

```
/components/catalog-admin/
├── CatalogLinkList.tsx         # Table of all links
├── CatalogLinkForm.tsx         # Create/edit form
├── ProductSelector.tsx         # Multi-select for product subset
├── PricingEditor.tsx           # Custom pricing editor
├── AnalyticsCards.tsx          # Stats display
├── ViewsChart.tsx              # Views over time
├── InquiryList.tsx             # Inquiry management table
├── QRCodeDisplay.tsx           # QR code preview/download
└── CopyLinkButton.tsx          # Copy URL to clipboard
```

---

## Tracking & Analytics

### Activity Log Entries

```typescript
// Catalog view
{
  entityType: 'CATALOG_LINK',
  entityId: catalogLinkId,
  action: 'catalog_viewed',
  metadata: {
    token,
    retailerId,
    retailerName,
    viewCount,
    surface: 'public'
  },
  ipAddress,
  userAgent
}

// Product view
{
  entityType: 'CATALOG_LINK',
  entityId: catalogLinkId,
  action: 'catalog_product_viewed',
  metadata: {
    token,
    retailerId,
    productId,
    productName,
    productViewCount
  },
  ipAddress,
  userAgent
}

// Inquiry submitted
{
  entityType: 'CATALOG_LINK',
  entityId: catalogLinkId,
  action: 'catalog_inquiry_submitted',
  metadata: {
    token,
    retailerId,
    inquiryId,
    contactName,
    businessName,
    productsOfInterest
  },
  ipAddress,
  userAgent
}

// PDF downloaded
{
  entityType: 'CATALOG_LINK',
  entityId: catalogLinkId,
  action: 'catalog_pdf_downloaded',
  metadata: {
    token,
    retailerId
  },
  ipAddress,
  userAgent
}
```

### Analytics Dashboard Metrics

- **Per Link**:
  - Total views
  - Unique days viewed
  - Products viewed (list with counts)
  - Inquiries submitted
  - PDF downloads
  - Last activity

- **Aggregate**:
  - Most viewed products across all links
  - Most engaged retailers
  - Conversion rate (views → inquiries)
  - Recent activity feed

---

## Files to Create

| File | Purpose |
|------|---------|
| `prisma/migrations/xxx_catalog_links.sql` | Database schema |
| `lib/services/catalogLinkService.ts` | Business logic |
| `lib/types/catalog.ts` | TypeScript types |
| `app/(public)/catalog/[token]/page.tsx` | Public catalog page |
| `app/(public)/catalog/[token]/product/[productId]/page.tsx` | Product detail |
| `app/api/catalog/[token]/route.ts` | Public catalog API |
| `app/api/catalog/[token]/product/[productId]/route.ts` | Product API |
| `app/api/catalog/[token]/inquiry/route.ts` | Inquiry submission |
| `app/api/catalog/[token]/pdf/route.ts` | PDF generation |
| `app/api/catalog/[token]/qr/route.ts` | QR code generation |
| `app/ops/catalog-links/page.tsx` | Admin list page |
| `app/ops/catalog-links/new/page.tsx` | Create link page |
| `app/ops/catalog-links/[id]/page.tsx` | Edit link page |
| `app/ops/catalog-links/inquiries/page.tsx` | Inquiries list |
| `app/api/ops/catalog-links/route.ts` | Admin CRUD API |
| `app/api/ops/catalog-links/[id]/route.ts` | Single link API |
| `app/api/ops/catalog-links/inquiries/route.ts` | Inquiries API |
| `components/catalog/*.tsx` | Public UI components |
| `components/catalog-admin/*.tsx` | Admin UI components |

## Files to Modify

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add new models and relations |
| `middleware.ts` | Add `/catalog/*` to public routes |
| `lib/types/activity.ts` | Add catalog action types (if exists) |

---

## Implementation Order

### Phase 1: Database & Core Service
1. Add schema changes to `prisma/schema.prisma`
2. Run migration
3. Create `catalogLinkService.ts`
4. Update middleware for public routes

### Phase 2: Public Catalog
1. Build catalog page with product grid
2. Build product detail page
3. Implement inquiry form
4. Add view tracking

### Phase 3: PDF & QR
1. Implement PDF generation
2. Implement QR code generation

### Phase 4: Admin Interface
1. Build catalog links list page
2. Build create/edit form
3. Build inquiry management
4. Build analytics dashboard

---

## Security Considerations

- **Token Entropy**: 6-char Base62 = ~36 bits entropy (sufficient for non-sensitive catalogs)
- **Rate Limiting**: Consider rate limiting PDF generation
- **Input Validation**: Zod schemas for all inquiry inputs
- **XSS Prevention**: Sanitize all user inputs in inquiry form
- **Data Scoping**: All public endpoints scoped by token, no direct ID access

---

## Future Enhancements (Not in Scope)

- Email notifications on new inquiries
- Standing order integration
- Product comparison feature
- Favorites/wishlist
- Multi-language support
