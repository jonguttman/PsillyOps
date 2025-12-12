# PsillyOps Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.0] - 2024-12-12

### Summary

**Inventory + Production Module** - Full implementation of inventory management with movement tracking, reservations, and expiry handling. Complete production order lifecycle with material requirements, work centers, production templates, yield/loss tracking, QC workflow, and labor logging.

### Added

#### Prisma Schema Updates

**New Enums:**
- `UnitOfMeasure` - Standardized unit values (GRAM, KILOGRAM, MILLILITER, LITER, UNIT, EACH, PACK, BOX)
- `MovementType` - Inventory movement classification (ADJUST, MOVE, CONSUME, PRODUCE, RECEIVE, RETURN, RESERVE, RELEASE)
- `QCStatus` - Quality control states (NOT_REQUIRED, PENDING, HOLD, PASSED, FAILED)

**Updated Enums:**
- `ProductionStatus` - Added `BLOCKED` status for production order workflow
- `InventoryStatus` - Added `QUARANTINED` status for QC-related holds
- `ActivityEntity` - Added `INVENTORY`, `WORK_CENTER` values for activity logging

**New Models:**
- `InventoryMovement` - Full audit trail for all stock changes with type, quantity, locations, reason, and reference
- `ProductionOrderMaterial` - Material requirements per production order with required, issued, and shortage quantities
- `WorkCenter` - Production work center management (name, description, active status)
- `ProductionTemplate` - Reusable production templates with default batch sizes and instructions
- `LaborEntry` - Time tracking for batch production (worker, minutes, role, notes)
- `UnitConversion` - Unit conversion multipliers for future BOM calculations

**Updated Models:**
- `InventoryItem` - Added `unitCost`, `source` fields; added index on `expiryDate`
- `Batch` - Added `manufactureDate`, `expirationDate`, `expectedYield`, `actualYield`, `lossQty`, `lossReason`, `qcStatus`; added index on `qcStatus`
- `ProductionOrder` - Added `batchSize`, `scheduledDate`, `startedAt`, `completedAt`, `workCenterId`, `templateId`; added relations to WorkCenter, ProductionTemplate, ProductionOrderMaterial
- `RawMaterial` - Added `shelfLifeDays`, `expiryWarningDays` for expiry management
- `User` - Added relation to `LaborEntry`
- `Product` - Added relation to `ProductionTemplate`

#### Service Layer

**Extended `inventoryService.ts`:**
- `getInventoryList(filter)` - Paginated inventory list with filtering by type, location, status, expiry
- `getInventoryDetail(inventoryId)` - Single item with movement history
- `reserveInventory()` - Increment quantityReserved with RESERVE movement
- `releaseReservation()` - Decrement quantityReserved with RELEASE movement
- `consumeMaterial()` - FIFO consumption by expiry date with CONSUME movements
- `produceFinishedGoods()` - Create inventory from batch with PRODUCE movement
- `getMovementHistory()` - Query movement records
- Enhanced `adjustInventory()`, `moveInventory()`, `receiveMaterials()` with movement tracking

**Extended `productionService.ts`:**
- `getProductionOrderList(filter)` - List with status, product, work center, date filters
- `getProductionOrderDetail(orderId)` - Full detail with materials, batches, labor
- `createProductionOrder()` - Create with BOM-based material requirements
- `startProductionOrder()` - Set IN_PROGRESS status and startedAt timestamp
- `blockProductionOrder()` - Block with reason
- `completeProductionOrder()` - Complete when all batches released
- `calculateMaterialRequirements()` - Refresh material requirements from BOM
- `issueMaterials()` - Consume materials via FIFO, update issuedQty
- `setBatchQCStatus()` - Update QC status with inventory quarantine handling
- `addLaborEntry()` / `getLaborEntries()` - Labor time tracking
- `getBatchDetail()` - Full batch detail with labor, movements
- Enhanced `createBatch()`, `completeBatch()`, `updateBatch()` with yield/QC fields

**New `workCenterService.ts`:**
- `listWorkCenters()` - List all work centers
- `getWorkCenter()` - Detail with active production orders
- `createWorkCenter()` - Create with logging
- `updateWorkCenter()` - Update with logging
- `archiveWorkCenter()` - Soft delete with active order check

**New `productionTemplateService.ts`:**
- `listProductionTemplates()` - List with product filter
- `getProductionTemplate()` - Detail with product BOM and recent orders
- `createProductionTemplate()` - Create for product
- `updateProductionTemplate()` - Update with logging
- `archiveProductionTemplate()` - Soft delete
- `getTemplatesForProduct()` - Product-specific template list

#### API Routes

**Inventory API:**
- `GET /api/inventory` - List inventory with filters
- `GET /api/inventory/[id]` - Inventory detail with movements
- `POST /api/inventory/reserve` - Reserve inventory
- `POST /api/inventory/release` - Release reservation
- Enhanced `/api/inventory/adjust` and `/api/inventory/move` with movement tracking

**Production Orders API:**
- `GET /api/production-orders` - List with status and date filters
- `POST /api/production-orders` - Create production order
- `GET /api/production-orders/[id]` - Production order detail
- `POST /api/production-orders/[id]/start` - Start production
- `POST /api/production-orders/[id]/complete` - Complete production
- `POST /api/production-orders/[id]/block` - Block with reason
- `POST /api/production-orders/[id]/issue-materials` - Issue materials to order

**Batches API:**
- `GET /api/batches/[id]` - Batch detail with yield, QC, labor, movements
- `PATCH /api/batches/[id]` - Update batch fields
- `GET /api/batches/[id]/labor` - List labor entries
- `POST /api/batches/[id]/labor` - Add labor entry
- `POST /api/batches/[id]/qc` - Update QC status

**Work Centers API:**
- `GET /api/work-centers` - List work centers
- `POST /api/work-centers` - Create work center
- `GET /api/work-centers/[id]` - Work center detail
- `PATCH /api/work-centers/[id]` - Update work center
- `DELETE /api/work-centers/[id]` - Archive work center

**Production Templates API:**
- `GET /api/production-templates` - List templates
- `POST /api/production-templates` - Create template
- `GET /api/production-templates/[id]` - Template detail
- `PATCH /api/production-templates/[id]` - Update template
- `DELETE /api/production-templates/[id]` - Archive template

#### UI Pages

**Inventory UI (`/inventory`):**
- Full inventory list with On Hand, Reserved, Available columns
- Filtering by Type, Location, Status, Search
- Expiry date display with warning colors
- Detail page with movement history
- Move Stock and Adjust Stock forms

**Production UI (`/production`):**
- Kanban board with PLANNED, IN_PROGRESS, BLOCKED, COMPLETED columns
- Order cards with product, progress bar, status tags, shortage indicators
- Summary stats (total, in progress, blocked, completed this week)
- New Production Order form with product, quantity, batch size, dates, work center, template
- Production Order Detail with overview, material requirements, batches, actions

**Batches UI (`/batches`):**
- Batch list with status, QC status, quantities, production order link
- Filtering by status, product, search
- Batch Detail page with:
  - Yield card (expected, actual, loss, variance)
  - QC card with status update form
  - Labor card with add entry form and totals
  - Movements card with full history
  - Inventory card showing finished goods
  - Complete Batch form with yield/loss/QC options

#### Validators & RBAC

**New Validators (`lib/utils/validators.ts`):**
- `createProductionOrderSchema`, `updateProductionOrderSchema`
- `startProductionOrderSchema`, `completeProductionOrderSchema`, `blockProductionOrderSchema`
- `issueMaterialsSchema`
- `updateBatchSchema`, `setBatchQCStatusSchema`
- `reserveInventorySchema`, `releaseInventorySchema`, `inventoryListFilterSchema`
- `createWorkCenterSchema`, `updateWorkCenterSchema`
- `createProductionTemplateSchema`, `updateProductionTemplateSchema`
- `addLaborEntrySchema`

**Updated RBAC (`lib/auth/rbac.ts`):**
- `inventory` - Added `reserve`, `release` permissions
- `production` - Added `start`, `block`, `issueMaterials` permissions
- `batches` - Added `qc`, `labor` permissions
- New `workCenters` resource with create/update/delete/view
- New `templates` resource with create/update/delete/view

### Changed

- Production order now uses `ProductionOrderMaterial` model instead of JSON for material requirements
- Batch completion now creates inventory via `produceFinishedGoods()` with movement tracking
- All inventory mutations now create `InventoryMovement` records for audit trail
- QC status changes can quarantine/release associated inventory

### Technical Notes

- All movement tracking uses FIFO by expiry date for material consumption
- Inventory reservations prevent over-allocation while allowing visibility
- QC HOLD/FAILED status automatically quarantines batch inventory
- QC PASSED status releases quarantined inventory to AVAILABLE
- Production order completion requires all active batches to be RELEASED

---

## [0.3.0] - 2024-12-11

### Summary

**Materials + Vendors Module** - Complete implementation of material management with categories, multi-vendor support, cost history tracking, attachments, and QR codes. Full vendor management with performance scorecards.

### Added

#### Prisma Schema Updates

**New Enum:**
- `MaterialCategory` enum added to the data model - Categorizes materials (RAW_BOTANICAL, ACTIVE_INGREDIENT, EXCIPIENT, FLAVORING, PACKAGING, LABEL, SHIPPING, OTHER)

**Updated Models:**
- `RawMaterial` - Added `category` (MaterialCategory), `moq` (Float), `description` (String?) fields; added relations to `costHistory` and `attachments`
- `Vendor` - Added `contactName` field for tracking primary contact person; added relation to `costHistory`
- `MaterialVendor` enhanced with `price` (via lastPrice), `moq`, `leadTimeDays`, `preferred` flag, and `notes`; added index on `preferred` for query optimization
- `ActivityEntity` enum - Added `VENDOR` value for activity logging

**New Models:**
- `MaterialCostHistory` - Time-series tracking of material price changes with vendor, source (MANUAL, PO, IMPORT), and timestamp
- `MaterialAttachment` - Stores document links (fileName, fileUrl, fileType) for COA, MSDS, Spec sheets

#### Preferred Vendor Logic

- Enforced single preferred vendor per material at the service layer
- Setting a vendor as preferred automatically unsets prior preferred vendors for that material
- Preferred vendor price is used as default cost for:
  - Material list display
  - BOM cost rollups for product costing
  - Purchase order line item defaults
- When no preferred vendor is set, system falls back to lowest available price

#### Service Layer

**New File: `lib/services/materialService.ts`**
- `getMaterialWithVendors(id)` - Full material data with vendor relationships, inventory, and cost history
- `setPreferredVendor(materialId, vendorId)` - Toggle preferred vendor with automatic unset of others
- `clearPreferredVendor(materialId)` - Remove preferred vendor designation
- `recordCostChange(materialId, vendorId, price, source)` - Create cost history entry
- `getMaterialCostHistory(materialId)` - Retrieve price history
- `calculateMaterialCost(materialId)` - Get current cost from preferred vendor or lowest price
- `getMaterialsList(includeInactive)` - List all materials with vendor info
- `createMaterial(data, userId)` - Create new material with logging
- `updateMaterial(id, data, userId)` - Update material with diff logging
- `archiveMaterial(id, userId)` - Soft delete material
- `upsertMaterialVendor(data, userId)` - Create or update material-vendor relationship
- `removeMaterialVendor(id, userId)` - Delete material-vendor relationship

#### API Routes

**New API routes created:**

**Materials API:**
- `GET /api/materials` - List all materials with vendor info
- `POST /api/materials` - Create new material
- `GET /api/materials/[id]` - Get material detail with vendors, inventory, cost history
- `PATCH /api/materials/[id]` - Update material
- `DELETE /api/materials/[id]` - Archive material (soft delete)

**Vendors API:**
- `GET /api/vendors` - List all vendors with material counts
- `POST /api/vendors` - Create new vendor
- `GET /api/vendors/[id]` - Get vendor detail with materials and POs
- `PATCH /api/vendors/[id]` - Update vendor
- `DELETE /api/vendors/[id]` - Archive vendor (soft delete)

**Material-Vendor API:**
- `POST /api/material-vendors` - Create material-vendor relationship with optional preferred flag
- `PATCH /api/material-vendors/[id]` - Update relationship (price, MOQ, lead time, preferred, notes)
- `DELETE /api/material-vendors/[id]` - Remove relationship (does not delete vendor or cost history)

**Cost History API:**
- `GET /api/material-cost-history/[materialId]` - Get price history for material
- `POST /api/material-cost-history/[materialId]` - Add new cost entry (called automatically on price changes)

**Attachments API:**
- `GET /api/material-attachments/[materialId]` - List attachments for material
- `POST /api/material-attachments/[materialId]` - Add attachment (URL-based, fileName + fileUrl + fileType)
- `DELETE /api/material-attachments/[materialId]/[attachmentId]` - Remove attachment link (does not delete external file)

#### UI Pages - Materials

**Material List Page (`/materials`):**
- Table view with Name, Category, SKU, Preferred Vendor, Cost, Lead Time, Reorder Point
- Category badges with color coding
- Summary stats (total materials, with vendor, used in BOMs)
- "New Material" button

**Material Create Page (`/materials/new`):**
- Form with all material fields
- Category and unit dropdowns
- Validation and error handling

**Material Detail Page (`/materials/[id]`):**
- Header with SKU, category, and active badges
- Edit mode toggle via query parameter
- Overview card with all material details
- Inventory summary with location breakdown
- Vendors card with pricing and preferred indicators
- Cost history timeline
- Attachments list with add/remove
- BOM usage table
- QR code link

**Material Vendors Page (`/materials/[id]/vendors`):**
- Manage vendor relationships for a material
- Add new vendor with price, MOQ, lead time
- Inline edit existing relationships
- Set/change preferred vendor

**Client Components:**
- `ArchiveButton` - Confirmation dialog for archive
- `SetPreferredButton` - Quick action to set preferred vendor
- `AddAttachmentForm` - Modal for adding URL-based attachments
- `VendorRelationshipRow` - Inline editing for vendor rows

#### UI Pages - Vendors

**Vendor List Page (`/vendors`):**
- Table view with Name, Contact, Email, Phone, Materials Count, Lead Time
- Summary stats (total vendors, with materials, total POs)
- "New Vendor" button

**Vendor Create Page (`/vendors/new`):**
- Form with all vendor fields
- Contact info and business terms

**Vendor Detail Page (`/vendors/[id]`):**
- Header with active badge
- Contact info section
- Business info section
- Materials supplied table with pricing
- Performance scorecard (last 90 days)
- Recent purchase orders table

**Client Components:**
- `ArchiveButton` - Confirmation dialog for archive

#### QR Support

**Material QR Page (`/qr/material/[materialId]`):**
- Public page with basic material info (name, category, SKU, description)
- Authenticated internal view with stock levels, pricing, and vendor info
- Category and SKU badges with color coding
- Low stock warning indicator when below reorder point
- Link to full detail page (internal users only)
- Role-based data redaction:
  - Unauthenticated: Basic info only, no pricing/stock/vendor
  - Internal users (Admin, Production, Warehouse): Full access
  - REP users: Limited view, sensitive purchasing details hidden

#### Navigation

- Ops navigation updated to include Materials and Vendors modules
- Materials accessible from top-level Ops sidebar at `/materials`
- Vendors accessible from top-level Ops sidebar at `/vendors`

### Changed

- Updated `lib/types/enums.ts` with `MaterialCategory` and `VENDOR` in `ActivityEntity`
- Updated seed data with categories, vendor relationships, cost history, and attachments

### Security

- All API routes protected with session auth
- REP role returns 403 Forbidden for all material/vendor APIs
- ADMIN, PRODUCTION, WAREHOUSE roles allowed
- QR pages show limited info for unauthenticated users

### Documentation

- **USER_MANUAL.md**: Added comprehensive Material Management and Vendor Management sections
- **CHANGELOG.md**: Added v0.3.0 entry
- **IMPLEMENTATION_SUMMARY.md**: Updated with new architecture

---

## [0.2.0] - 2024-12-11

### Summary

**Product Management Module** - Complete CRUD functionality for products including detail views, inline editing, BOM management, and soft-delete archiving.

### Added

#### Product Detail Page (`app/(ops)/products/[id]/page.tsx`)

Full-featured product detail view with multiple sections:

- **Header Section**
  - Product name with SKU badge
  - Archive status indicator (when applicable)
  - Edit, Archive, and Back navigation buttons

- **Product Details Card**
  - Unit of Measure display
  - Reorder Point value
  - Lead Time in days
  - Default Batch Size

- **Inventory Summary Card**
  - Total quantity on hand (aggregated)
  - Breakdown by storage location
  - Real-time inventory data from `InventoryItem` table

- **BOM (Bill of Materials) Card**
  - Table of materials with name, SKU, and quantity per unit
  - "Edit BOM" button linking to BOM editor

- **Recent Production Card**
  - Last 5 production orders for this product
  - Order number, quantity, status badge, and creation date
  - Status color coding (PLANNED, IN_PROGRESS, COMPLETED, CANCELLED)

- **Edit Mode**
  - Toggle via `?edit=true` query parameter
  - Inline form replacing static display fields
  - All fields editable: name, SKU, unit, reorder point, lead time, batch size
  - Server action for saving changes
  - Automatic redirect after save

#### New Product Page (`app/(ops)/products/new/page.tsx`)

Product creation form with:

- **Form Fields**
  - Name (required)
  - SKU (required, must be unique)
  - Unit of Measure (dropdown: jar, bottle, pouch, bag, box, case, unit, each, pack)
  - Reorder Point (optional, default 0)
  - Lead Time Days (optional, default 0)
  - Default Batch Size (optional)

- **Behavior**
  - Server action for form submission
  - SKU uniqueness validation
  - Redirect to `/products` on success
  - Field-level validation hints

#### BOM Editor Page (`app/(ops)/products/[id]/bom/page.tsx`)

Interactive BOM management interface:

- **Current Materials Section**
  - Table with material name, SKU, unit, and quantity per unit
  - Inline edit for each row
  - Remove button with confirmation dialog

- **Add Material Section**
  - Dropdown of available materials (excludes already-added)
  - Quantity per unit input
  - Add button to append to BOM

- **Server Actions**
  - `addBOMItem` - Create new BOM entry
  - `updateBOMItem` - Modify quantity
  - `removeBOMItem` - Soft-delete BOM entry

#### API Endpoints

**POST `/api/products`**
```typescript
// Request Body
{
  name: string;           // Required
  sku: string;            // Required, unique
  unitOfMeasure: string;  // Required
  reorderPoint?: number;  // Default: 0
  leadTimeDays?: number;  // Default: 0
  defaultBatchSize?: number;
}

// Response: 201 Created
{ id, name, sku, unitOfMeasure, ... }
```

**PATCH `/api/products/[id]`**
```typescript
// Request Body (all fields optional)
{
  name?: string;
  sku?: string;
  unitOfMeasure?: string;
  reorderPoint?: number;
  leadTimeDays?: number;
  defaultBatchSize?: number;
}

// Response: 200 OK
{ id, name, sku, ... }
```

**DELETE `/api/products/[id]`**
```typescript
// Soft delete - sets active: false
// Response: 200 OK
{ success: true, message: "Product archived" }
```

#### Client Components

- **`ArchiveButton.tsx`** - Client component with confirmation dialog for archive action
- **`BOMItemRow.tsx`** - Client component for inline editing of BOM quantities

#### Server Actions

- `updateProduct` - Update product fields with `revalidatePath`
- `archiveProduct` - Set product active to false
- `addBOMItem` - Create BOM entry
- `updateBOMItem` - Update BOM quantity
- `removeBOMItem` - Deactivate BOM entry

### Changed

#### Products List Page (`app/(ops)/products/page.tsx`)

- **"New Product" Button**: Changed from `<button>` to `<Link href="/products/new">`
- **"View" Links**: Changed from `/ops/products/${id}` to `/products/${id}`

#### Ops Layout (`app/(ops)/layout.tsx`)

- Updated all navigation links to use correct paths without `/ops/` prefix
- Dashboard link now points to `/dashboard`

### Fixed

- **404 on New Product**: Button was non-functional, now navigates correctly
- **404 on View Product**: Links used incorrect `/ops/` prefix
- **Navigation Paths**: All sidebar links now work correctly

### Security

- All routes protected with `auth()` check
- REP role redirected to home page
- ADMIN, PRODUCTION, WAREHOUSE roles allowed
- API endpoints validate session and role

### Documentation

- **USER_MANUAL.md**: Added comprehensive Product Management section
  - Product List page documentation
  - Product Detail page with all sections
  - Edit Mode workflow
  - Archive functionality
  - New Product creation
  - BOM Editor usage
  - Inventory Summary explanation
  - Recent Production explanation
  - Role-based access table
  - Sequence diagram for product creation
  - Data flow diagram for Product → BOM → Materials

- **IMPLEMENTATION_SUMMARY.md**: Updated with
  - Products API routes
  - Server actions list
  - Client components
  - File structure updates
  - Implementation metrics

- **CHANGELOG.md**: Created with
  - Keep a Changelog format
  - Semantic versioning
  - Detailed change documentation
  - File changes summary

---

## [0.1.1] - 2024-12-11

### Added

#### Admin Dashboard
- **Dashboard Page** (`/dashboard`)
  - Auth-protected route for ADMIN users only
  - Navigation grid with links to all Ops sections
  - Welcome message with admin name

#### Ops Placeholder Pages
- Created placeholder pages for all missing Ops routes:
  - `/materials` - Materials management
  - `/vendors` - Vendor management
  - `/inventory` - Inventory management
  - `/orders` - Order management
  - `/production` - Production management
  - `/purchase-orders` - Purchase order management
  - `/activity` - Activity log
  - `/batches` - Batch management
  - `/locations` - Location management
  - `/analytics` - Analytics dashboard

### Fixed

- Fixed navigation links in Ops layout to use correct paths (removed `/ops/` prefix)
- Fixed Dashboard link to point to `/dashboard` instead of `/ops`

---

## [0.1.0] - 2024-12-10

### Added

- Initial PsillyOps implementation
- Complete Prisma schema with 17 models
- NextAuth.js v5 authentication with 4 user roles
- Service layer with business logic
- API routes for orders, inventory, batches, activity
- Ops layout with navigation
- Login page with test credentials
- Comprehensive seed data
- User Manual and Developer Manual documentation

---

## File Changes Summary

### v0.3.0 Files

**New Files:**
- `app/(ops)/materials/page.tsx` - Materials list page
- `app/(ops)/materials/new/page.tsx` - Material creation form
- `app/(ops)/materials/[id]/page.tsx` - Material detail with edit mode
- `app/(ops)/materials/[id]/ArchiveButton.tsx` - Archive confirmation
- `app/(ops)/materials/[id]/SetPreferredButton.tsx` - Set preferred vendor
- `app/(ops)/materials/[id]/AddAttachmentForm.tsx` - Add attachment modal
- `app/(ops)/materials/[id]/vendors/page.tsx` - Vendor relationship management
- `app/(ops)/materials/[id]/vendors/VendorRelationshipRow.tsx` - Inline editing
- `app/(ops)/vendors/page.tsx` - Vendors list page
- `app/(ops)/vendors/new/page.tsx` - Vendor creation form
- `app/(ops)/vendors/[id]/page.tsx` - Vendor detail with scorecard
- `app/(ops)/vendors/[id]/ArchiveButton.tsx` - Archive confirmation
- `app/api/materials/route.ts` - Materials API (GET/POST)
- `app/api/materials/[id]/route.ts` - Materials API (GET/PATCH/DELETE)
- `app/api/vendors/route.ts` - Vendors API (GET/POST)
- `app/api/vendors/[id]/route.ts` - Vendors API (GET/PATCH/DELETE)
- `app/api/material-vendors/route.ts` - Material-vendor API (POST)
- `app/api/material-vendors/[id]/route.ts` - Material-vendor API (PATCH/DELETE)
- `app/api/material-cost-history/[materialId]/route.ts` - Cost history API
- `app/api/material-attachments/[materialId]/route.ts` - Attachments API
- `app/api/material-attachments/[materialId]/[attachmentId]/route.ts` - Delete attachment
- `app/qr/material/[materialId]/page.tsx` - Material QR view
- `lib/services/materialService.ts` - Material business logic

**Modified Files:**
- `prisma/schema.prisma` - Added MaterialCategory enum, MaterialCostHistory, MaterialAttachment models
- `prisma/seed.ts` - Added material categories, vendor relationships, cost history, attachments
- `lib/types/enums.ts` - Added MaterialCategory, VENDOR to ActivityEntity
- `docs/USER_MANUAL.md` - Added Materials and Vendors sections
- `docs/CHANGELOG.md` - Added v0.3.0 entry
- `IMPLEMENTATION_SUMMARY.md` - Added Materials + Vendors module documentation

### v0.2.0 Files

**New Files:**
- `app/(ops)/products/[id]/page.tsx`
- `app/(ops)/products/[id]/ArchiveButton.tsx`
- `app/(ops)/products/[id]/bom/page.tsx`
- `app/(ops)/products/[id]/bom/BOMItemRow.tsx`
- `app/(ops)/products/new/page.tsx`
- `app/api/products/route.ts`
- `app/api/products/[id]/route.ts`
- `docs/CHANGELOG.md`

**Modified Files:**
- `app/(ops)/products/page.tsx` - Fixed navigation links
- `app/(ops)/layout.tsx` - Fixed navigation paths
- `docs/USER_MANUAL.md` - Added product management documentation
- `IMPLEMENTATION_SUMMARY.md` - Added technical details

### v0.1.1 Files

**New Files:**
- `app/dashboard/page.tsx`
- `app/(ops)/materials/page.tsx`
- `app/(ops)/vendors/page.tsx`
- `app/(ops)/inventory/page.tsx`
- `app/(ops)/orders/page.tsx`
- `app/(ops)/production/page.tsx`
- `app/(ops)/purchase-orders/page.tsx`
- `app/(ops)/activity/page.tsx`
- `app/(ops)/batches/page.tsx`
- `app/(ops)/locations/page.tsx`
- `app/(ops)/analytics/page.tsx`

**Modified Files:**
- `app/(ops)/layout.tsx` - Fixed navigation links

---

## Upcoming Features

- [x] Materials CRUD pages ✓ (v0.3.0)
- [x] Vendors CRUD pages ✓ (v0.3.0)
- [ ] Inventory management UI
- [ ] Order management UI
- [ ] Production order workflow
- [ ] Purchase order workflow
- [x] QR code scanning for materials ✓ (v0.3.0)
- [ ] Activity log with filters
- [ ] Analytics dashboard
- [ ] Binary file upload for attachments

---

**Maintained by**: PsillyOps Development Team
