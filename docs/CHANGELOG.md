# PsillyOps Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### TripDAR Experience Mode Support
- **ExperienceMode Enum**: Added `MICRO` and `MACRO` experience modes to distinguish between microdose and macro journey experiences
- **Prediction Profiles**: Prediction profiles now support mode-specific predictions (products can have both MICRO and MACRO profiles)
- **Product Default Mode**: Products now have a `defaultExperienceMode` field (defaults to MACRO) that determines which mode is used when not explicitly specified
- **Mode-Specific Vibe Vocabulary**: Vibe labels (Transcend, Energize, Create, Transform, Connect) now have mode-specific wording:
  - **MICRO**: "Subtle uplift", "Clarity / energy", "Creative flow", "Perspective shift", "Emotional openness"
  - **MACRO**: "Mystical / beyond-self", "Stimulation / intensity", "Visionary / imagination", "Breakthrough / dissolution", "Connection / unity"
- **Survey Mode Selection**: When a product has both MICRO and MACRO profiles, users are prompted to select which mode they used before starting the survey
- **Mode Lock-In**: Once mode is selected in the survey, all questions use mode-specific labels and the review is stored with the selected mode
- **TripDAR Dashboard**: Dashboard now shows breakdowns by experience mode (MICRO vs MACRO totals and weekly submissions)
- **Review Browser**: Added experience mode filter and display column in the review browser
- **Export Support**: CSV/JSON exports now include `experienceMode` field for ML-ready data
- **Backward Compatibility**: All existing prediction profiles and reviews are automatically assigned MACRO mode (safe migration)

### Materials Management
- **Edit Materials**: Metadata fields (name, category, notes, vendor) are now editable on existing materials
- **Archive Materials**: Soft delete materials with `archivedAt` timestamp; archived materials hidden by default with toggle to show
- **Delete Materials**: Guarded permanent deletion only for archived materials with no inventory, PO, or BOM dependencies

### Labels & QR Codes
- Added auto-tiled letter-size label sheets for printing (8.5×11in with 0.25in margins)
- Printing now generates token-based QR codes (one token per physical label)
- Label preview now matches print layout using a fixed dummy token (no token creation/storage)
- QR codes are rendered as vector SVG and optimized for small labels (URL-only, error correction level `L`, high contrast)
- Labels automatically rotate 90° when it increases sheet capacity (no scaling)
- **Auto-generate QR placeholder**: SVGs without `<g id="qr-placeholder">` now auto-generate a fallback placeholder at render time (bottom-right corner, 0.75in for labels ≥2in wide, 0.5in otherwise)

### Production Runs
- Required-step markers + inline skip justification display; dashboard production attention summary.

## [0.14.2] - 2025-12-14

### Added
- **AI navigation + lookup intelligence (read-only)**:
  - Commands can open Ops screens (Inventory, Activity, Purchase Orders)
  - Commands can open best-match entities (Strain, Material, Product)
- **AI confirmed creation (explicit buttons only)**:
  - `PROPOSE_CREATE` confirmation card for creating Strains/Materials
  - Create happens only after user clicks **Create**
- **Strain detail route**: New page for viewing strain details and linked products

### Changed
- **Canonical strain creation route** is now `/strains/new`
  - `/strains` is list + management
  - Backward compatibility preserved for older links
- **AI prefill UX**: Prefilled inputs show helper text “Suggested by AI — review and edit before saving”
- **Activity Log wording**: AI navigation summaries use “AI prepared …” phrasing

### New Routes
- `GET /strains/new` - Add Strain (canonical)
- `GET /strains/[id]` - Strain detail (ADMIN)

### API Changes
- `POST /api/ai/command`
  - Now supports responses:
    - `type: NAVIGATION` (immediate routing)
    - `type: PROPOSE_CREATE` (confirmation required)
  - Added confirmed-create call path:
    - Request includes `{ confirm: true, logId, proposedAction }`

### UI Changes
- `AiCommandBar` now renders an inline confirmation card for `PROPOSE_CREATE`
- Dashboard AI input supports the same confirmation flow

### Activity Log Events
- `ai_navigate_add_entity` - AI prepared add form (prefill)
- `ai_navigate_entity` - AI prepared navigation to screen/entity
- `ai_propose_create_entity` - AI proposed a creation (no write)
- `ai_create_entity_confirmed` - AI created entity after explicit confirmation

### Files Modified / Added (high-signal)
- Modified:
  - `lib/services/aiCommandService.ts`
  - `app/api/ai/command/route.ts`
  - `components/ai/AiCommandBar.tsx`
  - `components/dashboard/DashboardAiInput.tsx`
  - `app/(ops)/materials/new/page.tsx`
  - `app/(ops)/strains/page.tsx`
  - `app/(ops)/strains/new/page.tsx`
- Added:
  - `app/(ops)/strains/[id]/page.tsx`
  - `app/(ops)/strains/StrainsHashRedirectClient.tsx`

## [0.14.1] - 2025-12-14

- Supply Watch dashboard card
- Inventory adjustments surfaced in dashboard + activity
- Explicit reseed requirement after Prisma migrations (`npx prisma db seed`)

## [0.14.0] - 2025-12-14

### Added
- **Production Runs (Phase 5)**:
  - Product-level production step templates (editable, ordered, gap-free)
  - Production Runs that snapshot templates into immutable run steps
  - Canonical run QR routing via `/qr/{token}` (single token per run)
  - Mobile-friendly production run workflow (scan → checklist → start/stop/complete/skip)
  - Run step overrides (pre-start only): add/remove/reorder steps + required/optional (run-only)
  - Step assignment: workers claim steps; only the assignee can act (ADMIN override)
  - “My Work” view for assigned steps
  - Run health flags (required skips, stalled steps, blocked runs) with UI warnings
- **AI (proposal-only)**
  - `PROPOSE_CREATE_PRODUCTION_RUN` (confirmed creation only)
  - `PROPOSE_RUN_EDIT` (confirmed run edits only)

### Activity Log Events
- `production_step_template_created|updated|deleted|reordered`
- `production_run_steps_modified`
- `production_step_assigned` / `production_step_reassigned`
- `ai_propose_run_edit` / `ai_propose_run_edit_confirmed`

## [0.15.0] - 2024-12-13

### Summary

**Enhanced Label Preview (Phase 1)** - Adds label size override, unified preview metadata, and improved QR positioning controls. All changes are render-time only; original SVG templates are never mutated.

### Added

#### Label Size Override (Preview Mode)
- **Toggle control** in preview modal to enable size override
- **Width and height inputs** with unit selector (inches / mm)
- **Native dimensions display** showing original SVG size
- **Reset button** to revert to native dimensions
- Size override applies at render time only - original SVG unchanged

#### Unified Preview Metadata Response
- Preview APIs now return JSON with both SVG content and metadata:
  ```json
  {
    "svg": "...",
    "meta": {
      "widthIn": 2.5,
      "heightIn": 3.0,
      "hasPlaceholder": true,
      "placeholderBox": { "x": 10, "y": 20, "width": 100, "height": 100 },
      "isAutoGenerated": false
    }
  }
  ```
- Sheet preview includes both `sheetMeta` and `labelMeta`
- Backwards compatible: `format=svg` returns raw SVG for legacy clients

#### QR Position Controls
- **Reset QR to Default** button: Resets scale and offset to 0
- Shows hint about auto-generated vs designer-placed placeholder
- Improved labeling and UX for position controls

### Changed

#### API Updates
- **`POST /api/labels/preview`**: Now accepts `labelWidthIn`, `labelHeightIn` params; returns JSON by default
- **`POST /api/labels/preview-sheet`**: Now accepts size overrides; returns unified JSON response

#### Service Layer
- `renderLabelPreviewWithMeta()` - New function returning SVG + metadata
- `getLabelMetadata()` - Extract dimensions and placeholder info from SVG
- `applyLabelSizeOverride()` - Non-destructive render-time scaling via viewBox

#### Component Updates
- `LabelPreviewButton.tsx` - Updated to handle JSON response, added size override UI

### Technical Notes

#### Non-Destructive Design
Label size override is treated as a layout instruction applied at render time:
- Original SVG templates are never mutated
- System wraps/scales content via viewBox transform logic
- Stored files remain unchanged

#### Constraints (Unchanged)
- No manual grid controls
- No label scaling to fit sheets (rotation only)
- QR codes remain URL-only, vector SVG, ECC-L
- Print output must match preview exactly

### Files Modified
- `lib/services/labelService.ts` - Added metadata functions, size override logic
- `app/api/labels/preview/route.ts` - Unified JSON response with metadata
- `app/api/labels/preview-sheet/route.ts` - Added size override support
- `components/labels/LabelPreviewButton.tsx` - Size override UI, reset button

### Phase 2: Visual QR Drag/Resize

Added visual drag-and-drop interface for QR positioning:

#### New Component: `QRBoxOverlay.tsx`
- Renders draggable/resizable box overlay on label preview
- Blue dashed border indicates QR position
- Drag anywhere on box to move QR
- Drag bottom-right corner to resize
- Shows real-time size indicator (e.g., "0.75in")
- Warning indicator when QR < 0.6in (scan reliability concern)
- Offset display shows current position

#### UX Improvements
- Hint text: "Drag the blue box to move QR · Drag corner to resize"
- Overlay only shown in single-label mode (not sheet preview)
- Constrained to label bounds
- Syncs with slider/nudge controls (changes update in real-time)

### Phase 2.5: Smart QR Placement

Added intelligent QR positioning with one-click optimization:

#### Smart Initial Placement
- Auto-generated placeholders now default to bottom-right corner
- Smart placement only applies when user hasn't manually positioned QR
- Respects saved values (never auto-overwrites user changes)

#### One-Click Actions
- **Maximize QR (Safe)**: Centers QR at maximum size with 0.1in margin
- **Suggest Better Placement**: Moves QR to optimal position based on label layout

#### Absolute QR Box Model
- Dragging/resizing now updates absolute position (xIn, yIn, widthIn, heightIn)
- Offset/scale derived from box position (not edited directly)
- More intuitive mental model for positioning

#### Service Layer Helpers
```typescript
suggestQrPlacement({ labelWidthIn, labelHeightIn }) → QrBoxPosition
calculateMaxQrSize({ labelWidthIn, labelHeightIn }) → QrBoxPosition
qrBoxToOffsetScale({ qrBox, placeholderBox }) → { qrScale, qrOffsetX, qrOffsetY }
offsetScaleToQrBox({ qrScale, qrOffsetX, qrOffsetY, placeholderBox }) → QrBoxPosition
```

### Phase 2.6: Dead-Space Detection

Added visual guidance for better QR placement:

#### Suggestion Zones
- "Show zones" checkbox reveals recommended placement regions
- Translucent green boxes show: bottom-right, bottom-left, top-right, top-left, center
- Click any zone to move QR there instantly
- Zones avoid overlapping current QR position

#### Heuristic-Based (Not Geometric)
- Fast, predictable zone detection
- No collision engine or heavy computation
- Biased toward bottom-right (convention)

### Scope Notes
- Label size override and QR controls are preview-only
- Persistence to `LabelTemplateVersion` deferred to Phase 3
- Never auto-saves suggestions without user consent

## [0.14.0] - 2024-12-13

### Summary

**Phase 4: Operational History, Accountability & Supply Flow** - Provides complete visibility into "What happened?", "Why did it happen?", and "What do we need to buy?" through a comprehensive Activity Log, full Purchase Order management with receiving workflow, and enhanced dashboard supply awareness.

### Added

#### Activity Log Page (`/activity`)
- **Full Activity Timeline**: Unified view showing Time, Actor, Action, Entity, and Quick links
- **Smart Filters**:
  - Entity type (Product, Material, Batch, Inventory, PO, Order, Label, System)
  - Actor (User dropdown + System option)
  - Time range (Last 24 hours default, 7 days, 30 days, All time)
  - Action category (Created, Status Changes, Quantity Changes, Movements, QR Scans, AI Commands, Shortages)
- **Expandable Rows**: Click to show detailed diff, related entities, AI context
- **Entity Deep Links**: Direct links to relevant entity pages
- **Pagination**: Load more with infinite scroll support
- **Lightweight API**: No full joins, lazy resolution for performance

#### Purchase Orders Module (`/purchase-orders`)
- **Complete PO Lifecycle Management**:
  - DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED → CANCELLED
  - Status badges with color coding
  - Progress bars for partial receipts
- **PO List Page**: Table with PO #, Vendor, Status, Items, Value, Expected Delivery, Created date
- **PO Detail Page**:
  - Header with PO#, Status, Action buttons (Submit, Receive)
  - Summary card with vendor info, expected delivery, notes
  - Line Items table with ordered/received quantities, unit costs, status
  - Receiving panel with quantity inputs per line
  - Activity timeline embedded (PO-specific events)
- **Create PO Page**: Form with vendor selector, delivery date, dynamic line items
- **Receiving Workflow**:
  - Append-only receipt tracking (each receipt logged as event)
  - Validation: received qty ≤ ordered qty, cannot receive on CANCELLED/DRAFT
  - Creates inventory records via `receiveMaterials()`
  - Updates material stock quantities
  - Automatic status transitions (SENT → PARTIALLY_RECEIVED → RECEIVED)

#### Dashboard Enhancements
- **Supply Watch Card**: New dashboard component showing:
  - Materials below reorder point (count + link)
  - Open purchase orders count
  - Days since last PO received
- **Recent Activity Enhanced**: Now includes Purchase activity, Inventory adjustments, Redirect changes

#### Menu Reorganization
- **Ops Section**: Dashboard, Scan QR, Products, Materials, Inventory, Production, Orders, **Purchasing** (new)
- **Labels Section**: Templates
- **QR Section**: Redirect Rules (ADMIN only)
- **System Section** (collapsed by default): Activity, Strains, Vendors, Help
- Naming convention: "Purchasing" in menu (how people talk), "Purchase Orders" as page title (what they see)

#### Service Layer: `purchaseOrderService.ts`
- **Core Functions**:
  - `createPurchaseOrder(params, userId)` - Create draft PO
  - `updatePurchaseOrder(id, data, userId)` - Update DRAFT only
  - `submitPurchaseOrder(id, userId)` - DRAFT → SENT transition
  - `receivePurchaseOrderItems(poId, items, locationId, userId)` - Append-only receiving
  - `cancelPurchaseOrder(id, reason, userId)` - Cancel with audit
  - `getPurchaseOrder(id)` - Get detail with relations
  - `listPurchaseOrders(filters)` - Query with filters
  - `calculatePOTotal(lineItems)` - Compute total value
  - `getPOStatusColor(status)` - Badge color helper

#### API Endpoints
- **Purchase Orders**:
  - `GET /api/purchase-orders` - List with status, vendor, date filters
  - `POST /api/purchase-orders` - Create new PO
  - `GET /api/purchase-orders/[id]` - Get detail
  - `PATCH /api/purchase-orders/[id]` - Update PO
  - `DELETE /api/purchase-orders/[id]` - Cancel PO
  - `POST /api/purchase-orders/[id]/submit` - Submit to vendor
  - `POST /api/purchase-orders/[id]/receive` - Receive items

- **Activity**:
  - `GET /api/activity?startDate=&endDate=&tags=` - Enhanced with date range and tag filters
  - Supports `userId=system` for filtering system actions (null userId)

### Changed
- **SidebarNav**: Reorganized into OPS, LABELS, QR, SYSTEM sections with persistence
- **Dashboard**: Added `SupplyWatchCard` component, reorganized layout
- **Activity API**: Now supports date range filters (`startDate`, `endDate`) and action category via tags
- **loggingService**: Updated to handle `userId: null` filter for system actions

### New Activity Log Events
- `purchase_order_created` - PO created
- `purchase_order_updated` - PO fields updated
- `purchase_order_submitted` - DRAFT → SENT
- `purchase_order_received` - Items received (partial or full)
- `purchase_order_cancelled` - PO cancelled

### Components Created
- **Activity Module**:
  - `components/activity/ActivityLogFilters.tsx` - Filter toolbar
  - `components/activity/ActivityLogRow.tsx` - Expandable activity row
  - `app/(ops)/activity/ActivityLogClient.tsx` - Main client component with state

- **Purchase Orders Module**:
  - `app/(ops)/purchase-orders/page.tsx` - PO list (server)
  - `app/(ops)/purchase-orders/PurchaseOrdersClient.tsx` - PO list (client)
  - `app/(ops)/purchase-orders/[id]/page.tsx` - PO detail (server)
  - `app/(ops)/purchase-orders/[id]/PurchaseOrderDetailClient.tsx` - PO detail (client)
  - `app/(ops)/purchase-orders/new/page.tsx` - Create PO (server)
  - `app/(ops)/purchase-orders/new/NewPurchaseOrderClient.tsx` - Create PO (client)

- **Dashboard**:
  - `components/dashboard/SupplyWatchCard.tsx` - Supply awareness card

### Role-Based Access
| Feature | Admin | Production | Warehouse | Rep |
|---------|-------|------------|-----------|-----|
| View Activity Log | ✅ | ✅ | ✅ | ❌ |
| Create Purchase Order | ✅ | ❌ | ✅ | ❌ |
| Submit Purchase Order | ✅ | ❌ | ✅ | ❌ |
| Receive Items | ✅ | ❌ | ✅ | ❌ |
| Cancel Purchase Order | ✅ | ❌ | ❌ | ❌ |
| View Supply Watch | ✅ | ✅ | ✅ | ❌ |

### Technical Notes
- **Receiving is Append-Only**: Each receipt creates an event in ActivityLog, quantities derived from sum
- **Inventory Integration**: Receiving creates inventory via `receiveMaterials()` and updates material stock
- **Activity Log Performance**: Lightweight queries with lazy resolution, no heavy joins
- **QR Token Links**: Standardized on `/qr/[tokenId]` (matching Phase 3)

### Design Decisions Applied
1. **QR Token Routes**: Use `/qr/[tokenId]` for consistency with Phase 3 implementation
2. **Activity API Design**: Keep lightweight - return entityType, entityId, summary, tags; UI resolves names lazily
3. **Receiving Workflow**: Treat each receive as an event (append-only), not a mutation overwrite
4. **Menu Naming**: "Purchasing" in menu label, "Purchase Orders" as page title, `PurchaseOrder` as entity name
5. **Deferred Items**: Vendor performance analytics, automatic PO generation, cost rollups, advanced alerts

### Migration Notes
- No schema changes required - all models already existed in database
- Run `npm run dev` to see new Activity Log and Purchase Orders pages
- Existing purchase order data (if any) will display correctly

## [0.13.0] - 2024-12-13

### Summary

**Phase 3: QR Operational UX** - Makes QR tokens actionable in daily operations by adding real-time scan visibility, comprehensive QR detail pages, AI command integration, and a dedicated internal scan page.

### Added

#### Dashboard: Recent QR Scans
- **`RecentQRScans` component** on dashboard showing last 20 scans
- Columns: Time (relative), Token short hash, Entity (type + name), Destination (resolution type), Status
- Auto-refresh every 30 seconds + refresh on window focus
- Click row to navigate to QR detail page
- New API endpoint: `GET /api/qr-tokens/recent-scans`

#### QR Detail Page (`/qr/[tokenId]`)
- **Header**: QR preview, token ID, status badge, Copy URL, Test Redirect button
- **Section A: QR Context** (read-only): Token metadata, entity link, label template/version, scan count, last scanned, effective redirect resolution
- **Section B: Scan History**: Filterable table (24h/7d/30d/all) with timestamp, resolution type, destination, rule applied
- **Section C: Redirect Controls**: Token-level override form, quick presets (Tripdar, Fungapedia, Instagram, Recall), revoke token (Admin only)
- **Section D: Annotations**: Append-only notes with add form, immutable list showing timestamp, user, message
- **Active Rule Info**: Panel showing group rule details if applicable

#### AI Command Bar: QR Ingestion
- Detects QR URL or token patterns in input (`/qr/qr_[A-Za-z0-9]+` or `qr_[A-Za-z0-9]{22}`)
- Resolves token and displays QR context card with:
  - Entity name, type, status
  - Scan count, redirect type, label version
  - Current redirect destination
  - Quick action buttons to navigate to detail, entity, etc.
- New API endpoint: `POST /api/qr-tokens/resolve-context`

#### Internal Scan Page (`/scan`)
- Camera scan button (placeholder - requires QR scanning library)
- Paste from clipboard button
- URL/token text input with resolve button
- On resolve: QR summary card, stats (scans, redirect type, version), action buttons (Open Detail, Test Redirect, View Entity, Send to AI)
- Added to sidebar navigation under Operations

#### Service Layer Additions
- `getRecentQRScans(limit)` - Fetches recent scans with enriched entity data
- `getQRDetail(tokenId)` - Comprehensive token details with entity name, redirect resolution
- `getQRScanHistory(tokenId, range)` - Scan history with time range filtering
- `addQRNote(tokenId, message, userId)` - Append-only note creation
- `getQRNotes(tokenId)` - Retrieve notes for a token

### Changed
- Sidebar navigation: Added "Scan QR" link to Operations section
- AI Command Bar examples now include hint for QR pasting

### New Activity Log Events
- `qr_token_override_set` - Token redirect override applied
- `qr_token_override_cleared` - Token redirect override removed
- `qr_token_note_added` - Note added to QR token

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/qr-tokens/recent-scans` | GET | Recent scans for dashboard |
| `/api/qr-tokens/resolve-context` | POST | Resolve QR to context for AI |

### Role-Based Access
| Feature | View | Actions |
|---------|------|---------|
| Dashboard Recent Scans | ADMIN, PRODUCTION, WAREHOUSE | — |
| QR Detail Page | All authenticated | — |
| Add Note | All authenticated | OPS+ |
| Redirect Controls | ADMIN, PRODUCTION | ADMIN, PRODUCTION |
| Revoke Token | ADMIN | ADMIN |
| Internal Scan Page | All authenticated | All authenticated |

## [0.12.0] - 2024-12-13

### Summary

**Phase 3: QR Visibility & Control** - Added operator-facing visibility and control for the QR system including a comprehensive Token Inspector, enhanced redirect management UI with filters, and sidebar navigation reorganization.

### Added

#### Sidebar Navigation
- **Restructured navigation** with collapsible sections
- **localStorage persistence** for section collapsed/expanded state
- **SYSTEM section** (collapsed by default) containing: Labels, QR Redirects, Strains, Vendors
- Removed cluttered top navigation bar

#### QR Token Inspector Component
- **`components/qr/QRTokenInspector.tsx`** - Reusable inspector showing:
  - Token list with masked token values
  - Status badges (ACTIVE/REVOKED/EXPIRED)
  - Resolution type (TOKEN/GROUP/DEFAULT) with rule name
  - Destination URL with external link
  - Scan count and last scan time
  - Expandable row details with full token, printed date, label version
  - Recent scan history (last 5 entries)
- **Stats strip**: Total, Active, Revoked, Expired counts + Total Scans
- **Status filter**: Filter by ACTIVE, REVOKED, EXPIRED, or All
- **Actions** (Admin only):
  - Set redirect override (token-level)
  - Clear override
  - Revoke token

#### Token Inspector Integration
- Embedded in **Product detail page** (`/products/[id]`)
- Embedded in **Batch detail page** (`/batches/[id]`)
- Embedded in **Inventory detail page** (`/inventory/[id]`) for product inventory

#### Enhanced QR Redirect Management
- **Filters toolbar**: Scope type (All/Product/Batch/Inventory/Version), Active toggle, Domain filter
- **Overlap warnings**: Alerts when multiple active rules exist for the same scope
- **Improved status display**: Active, Scheduled, Expired Window, Inactive states
- **Entity links**: Target names now link to entity detail pages
- **Visual improvements**: Better spacing, icons, responsive design

#### New API Endpoints
- **`GET /api/qr-tokens/for-entity`** - Fetch tokens for an entity with resolved destinations and scan histories
- **`POST /api/qr-tokens/[id]/override`** - Set token-level redirect override
- **`DELETE /api/qr-tokens/[id]/override`** - Clear token-level override

#### Activity Logging
- `qr_token_override_set` - When admin sets a token redirect override
- `qr_token_override_cleared` - When admin clears a token override

### Changed
- Moved Labels, QR Redirects to SYSTEM section in sidebar (collapsed by default)
- QR Redirect page now shows all filter options in a toolbar
- Sidebar sections now persist collapsed state in localStorage

### Technical Notes
- No schema changes - all new features use existing QRToken and QRRedirectRule models
- No changes to QR resolution logic - precedence order preserved
- All new endpoints follow existing auth/RBAC patterns

## [0.11.0] - 2024-12-13

### Summary

**QR Redirect System Phase 2** - Full admin UI for managing redirect rules, token detail pages with scan history and annotations, and entity-level QR behavior panels on product/batch/inventory pages.

### Phase 1 Corrections Applied
- **Enforced single active rule per scope**: Creating a duplicate rule now fails with a clear error requiring explicit deactivation
- **Deterministic rule resolution**: All lookups use `orderBy: { createdAt: 'desc' }` for consistent ordering
- **Enriched scan logging**: All scans now log `resolutionType` (TOKEN/GROUP/DEFAULT) and `redirectUrl` at scan time
- **Documentation updated**: Clarified that QR codes are never reprinted and all changes are audited/reversible

### Added

#### Admin UI - QR Redirect Management
- **`/qr-redirects`** - Full redirect rules management page
  - Table with scope, target, URL, status, time window, affected token count, creator
  - Deactivate action for active rules
  - Stats showing active rules, total rules, affected tokens

#### Redirect Rule Creation UX
- **`/qr-redirects/new`** - Create new redirect rules
  - Scope selector (Product/Batch/Inventory/Template Version)
  - Entity selection with dropdowns showing existing active rules
  - URL input, optional reason, optional time window
  - Validation preventing duplicate active rules

#### QR Token Detail Page
- **`/qr-tokens/[id]`** - Token detail with history and annotation
  - Token metadata: entity, version, status, scan count, timestamps
  - Current redirect resolution (TOKEN/GROUP/DEFAULT) with destination
  - Scan history table with timestamps, resolution type, destination
  - Admin-only annotation form (append-only notes stored as activity logs)

#### Entity-Level QR Behavior Panels
- Added to **Product**, **Batch**, and **Inventory** detail pages
- Shows active redirect rule (if any) with destination and time window
- Displays affected token count
- Actions: Create redirect / Deactivate redirect (admin only)
- Does not list individual tokens

#### Activity Logging
- `qr_token_note_added` - When admin adds annotation to a token
- Enhanced `qr_token_scanned` with `resolutionType` and `redirectUrl` fields

### Changed
- Scan logging moved from `resolveToken()` to QR resolver page for enriched metadata
- All scans now logged (not just redirected ones) with resolution details

## [0.10.0] - 2024-12-13

### Summary

**Group-Based QR Redirect Rules (Phase 1)** - Added the ability to redirect QR scans for entire groups (by entity or label version) without modifying individual tokens. Supports campaigns, recalls, and analytics use cases with zero reprints required.

### Core Principles

- **Group-based redirects**: Apply redirects to entire products, batches, or label versions
- **Zero reprints**: Redirects apply retroactively to already-printed labels
- **Precedence chain**: Token → Rule → Default routing
- **Admin-only**: Rules managed via API (no UI in Phase 1)
- **Audit trail**: All rule changes and redirect scans are logged

### Added

#### Prisma Schema Updates

**Updated Model:**
- `QRToken` - Added `redirectUrl: String?` for token-level redirect override

**New Model:**
- `QRRedirectRule` - Group-based redirect rules
  - Fields: `id`, `entityType`, `entityId`, `versionId`, `redirectUrl`, `active`, `reason`, `startsAt`, `endsAt`, `createdById`, `createdAt`
  - Scope selectors: Either `entityType + entityId` OR `versionId` (exactly one required)
  - Indexes on `[entityType, entityId]`, `versionId`, `active`

**Updated Models:**
- `User` - Added relation to `QRRedirectRule[]`

#### New Files Created

```
lib/services/
└── qrRedirectService.ts         # Redirect rule management (NEW)

app/api/qr-redirects/
├── route.ts                     # Create/list redirect rules (NEW)
└── [id]/
    └── deactivate/
        └── route.ts             # Deactivate redirect rule (NEW)
```

#### Service Layer (`lib/services/qrRedirectService.ts`)

**Rule Lookup:**
- `findActiveRedirectRule({ entityType, entityId, versionId })` - Find matching active rule respecting time windows

**Rule Management:**
- `createRedirectRule(params, userId)` - Create rule with scope validation
- `deactivateRedirectRule(id, userId)` - Soft-deactivate rule

**Query Functions:**
- `getRedirectRule(id)` - Get rule by ID
- `listRedirectRules(options)` - List with filters
- `getRulesForEntity(entityType, entityId)` - Get rules for entity
- `getRulesForVersion(versionId)` - Get rules for version

#### API Endpoints

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/qr-redirects` | POST | ADMIN | Create redirect rule |
| `/api/qr-redirects` | GET | ADMIN | List redirect rules |
| `/api/qr-redirects/[id]/deactivate` | POST | ADMIN | Deactivate rule |

#### QR Token Resolver Updates (`/app/qr/[token]/page.tsx`)

Enhanced resolver with three-level precedence:
1. Check `QRToken.redirectUrl` (token-level)
2. Check active `QRRedirectRule` (group-level)
3. Fallback to default entity routing

#### Activity Logging

New logged events:
- `qr_redirect_rule_created` - Rule created
- `qr_redirect_rule_deactivated` - Rule deactivated
- `qr_token_scanned` - Token scanned with redirect (includes destination)

Tags: `['qr', 'redirect', 'rule', 'created' | 'deactivated']`, `['qr', 'label', 'scan', 'redirect', source]`

### Explicit Non-Goals (Phase 1)

The following are NOT included in this phase:

- ❌ UI for creating/editing rules
- ❌ Scheduling UI for time windows
- ❌ Analytics dashboards for redirect performance
- ❌ Cron jobs for rule expiration
- ❌ Consumer-facing redirect pages

### Migration Notes

- Run `npx prisma db push` to apply schema changes
- No breaking changes to existing functionality
- Existing QR tokens continue to work with default routing
- Rules can be created via API immediately after migration

---

## [0.9.0] - 2024-12-12

### Summary

**Explicit Strain Support** - Added strain lookup table for categorizing products by their active ingredient source. Enables strain-specific products (e.g., "Mighty Caps - Penis Envy"), AI command resolution (e.g., "PE" → "Penis Envy"), and safe CSV product import.

### Core Principles

- **SKU = Product remains the core rule**: No ProductVariant model introduced
- **Strain is optional**: Existing products continue working unchanged
- **AI-friendly resolution**: Short codes and aliases resolve to strain IDs
- **Import-safe**: CSV import validates strains before insertion
- **Backward compatible**: No breaking changes to existing functionality

### Added

#### Prisma Schema Updates

**New Model:**
- `Strain` - Strain lookup table
  - Fields: `id`, `name` (unique), `shortCode` (unique), `aliases` (JSON), `active`, `createdAt`
  - Relation to `Product[]`
  - Index on `shortCode` for fast AI resolution

**Updated Models:**
- `Product` - Added `strainId: String?` with relation to `Strain`
  - Index on `strainId` for filtering

#### New Files Created

```
lib/services/
└── strainService.ts              # Strain CRUD and resolution (NEW)

app/api/strains/
├── route.ts                      # List/create strains (NEW)
└── [id]/
    └── route.ts                  # Get/update/archive strain (NEW)

app/api/products/import/
└── route.ts                      # CSV bulk import endpoint (NEW)

app/(ops)/strains/
└── page.tsx                      # Strain management page (NEW)
```

#### Service Layer (`lib/services/strainService.ts`)

**Strain Operations:**
- `listStrains(filter?)` - List strains with optional inactive filter and search
- `getStrain(id)` - Get strain with associated products
- `getStrainByCode(shortCode)` - Get by short code (case-insensitive)
- `getStrainByName(name)` - Get by name (case-insensitive)
- `resolveStrainRef(ref)` - AI resolution: shortCode → name → partial → aliases
- `createStrain(data, userId?)` - Create with logging
- `updateStrain(id, data, userId?)` - Update with logging
- `archiveStrain(id, userId?, force?)` - Soft delete with product check

#### AI Integration (`lib/services/aiCommandService.ts`)

**Enhanced Product Resolution:**
- `resolveProductRef()` now detects strain references in product names
- `parseProductWithStrain()` extracts product part and strain ID from input
- Supports patterns:
  - "Mighty Caps - Penis Envy" → product + strain
  - "MC-PE" → product code + strain code
  - "Mighty Caps PE" → product + strain code
- Falls back to existing resolution if no strain detected

#### API Routes

**Strain Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/strains` | All users | List strains |
| POST | `/api/strains` | ADMIN only | Create strain |
| GET | `/api/strains/[id]` | All users | Get strain detail |
| PATCH | `/api/strains/[id]` | ADMIN only | Update strain |
| DELETE | `/api/strains/[id]` | ADMIN only | Archive strain |

**Product Import Endpoint:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/products/import` | ADMIN only | CSV bulk import |

**CSV Format:**
```csv
name,sku,strain,unit,reorder_point,wholesale_price,default_batch_size
Mighty Caps - Penis Envy,MC-PE,PE,jar,50,24.99,100
Mighty Caps - Golden Teacher,MC-GT,GT,jar,50,24.99,100
```

- Strain column accepts name or shortCode (case-insensitive)
- Validates all strains exist before insertion
- Rejects duplicate SKUs (in database and within file)
- Uses transaction for atomic insert
- Returns row-level error summary

#### UI Updates

**Products List (`/products`):**
- Added strain column with shortCode badge
- Added strain filter dropdown
- "Clear" link to reset filter

**Product Detail (`/products/[id]`):**
- Strain badge in header (shortCode: name)
- Strain field in details grid
- Strain dropdown in edit mode
- Activity logging on strain change

**New Product (`/products/new`):**
- Strain dropdown with all active strains
- Optional field - "No strain selected" default

**Strains Management (`/strains`):**
- ADMIN-only page
- Create form with name, shortCode, aliases
- Table with name, shortCode, aliases, product count, status
- Archive/restore actions
- Help text explaining strain usage

#### Seed Data Updates

**Pre-seeded Strains:**
- Penis Envy (PE)
- Golden Teacher (GT)
- Albino Penis Envy (APE)
- Full Moon Party (FMP)
- Lions Mane (LM)
- Reishi (RE)
- Cordyceps (CORD)
- Chaga (CHAG)

**Example Products with Strains:**
- Mighty Caps - Penis Envy (MC-PE) → strainId: PE
- Mighty Caps - Golden Teacher (MC-GT) → strainId: GT
- Mighty Caps - Full Moon Party (MC-FMP) → strainId: FMP
- Lion's Mane Focus Capsules → strainId: LM
- Reishi Calm Capsules → strainId: RE
- Cordyceps Energy Capsules → strainId: CORD

### Activity Logging

New logged events:
- `strain_created` - New strain added (ActivityEntity.SYSTEM)
- `strain_updated` - Strain details changed (ActivityEntity.SYSTEM)
- `strain_archived` - Strain archived (ActivityEntity.SYSTEM)
- `strain_updated` - Product strain changed (ActivityEntity.PRODUCT)
- `products_imported` - CSV import completed (ActivityEntity.SYSTEM)

Tags: `['strain', 'created' | 'updated' | 'archived']`, `['product', 'strain', 'updated']`, `['product', 'import', 'csv']`

### Explicit Non-Goals

The following are explicitly NOT included:
- ProductVariant model (SKU = Product)
- Genetic lineage tracking
- Lab results / potency data
- Compliance labeling
- Terpene profiles
- Cannabinoid percentages
- Polymorphic strain systems

### Migration Notes

- Run `npx prisma db push` to apply schema changes
- Run `npx prisma db seed` to add strain data
- Existing products will have `strainId: null` (backward compatible)
- No forced backfill required
- AI commands continue to work without strain

---

## [0.8.0] - 2024-12-12

### Summary

**QR Token System** - Implemented a tokenized QR code system where each physical label has a unique opaque token. All resolution happens server-side, enabling revocation, recall messaging, per-label traceability, and future extensibility.

### Core Principles

- **Unique token per physical label**: Each printed label gets its own traceable identity
- **Opaque tokens**: QR codes contain only a token URL, not embedded data
- **Server-side resolution**: All meaning and behavior resolved at scan time
- **Revocation support**: Tokens can be invalidated without changing physical labels
- **Recall capability**: Bulk revocation by entity enables product recalls
- **Print-time only**: QR tokens are created strictly at label print time and represent physical label instances

### Added

#### Prisma Schema Updates

**New Enum:**
- `QRTokenStatus` - Token states (ACTIVE, REVOKED, EXPIRED)

**New Model:**
- `QRToken` - Unique token per printed label
  - Fields: `id`, `token` (unique opaque string), `status`, `entityType`, `entityId`
  - `versionId` - Links to LabelTemplateVersion for traceability
  - `printedAt`, `expiresAt`, `revokedAt`, `revokedReason`
  - `scanCount`, `lastScannedAt` - Lightweight analytics
  - `createdByUserId` - Audit trail
  - Indexes on `token`, `entityType+entityId`, `status`, `versionId`, `printedAt`

**Updated Models:**
- `User` - Added relation to `QRToken[]`
- `LabelTemplateVersion` - Added relation to `QRToken[]`

#### New Files Created

```
lib/services/
└── qrTokenService.ts           # Token generation, resolution, revocation (NEW)

lib/types/
└── enums.ts                    # Added QRTokenStatus enum (UPDATED)

app/qr/
└── [token]/
    └── page.tsx                # Public token resolver page (NEW)

app/api/qr-tokens/
├── batch/
│   └── route.ts                # Bulk token creation (NEW)
├── [id]/
│   └── revoke/
│       └── route.ts            # Single token revocation (NEW)
└── revoke-by-entity/
    └── route.ts                # Bulk revocation by entity (NEW)

app/api/labels/
└── render-with-tokens/
    └── route.ts                # Render labels with tokens (NEW)
```

#### Token Generation

- Format: `qr_<22-char-base62-string>` (e.g., `qr_2x7kP9mN4vBcRtYz8LqW5j`)
- Cryptographically random using Node.js `crypto.randomBytes()`
- ~131 bits of entropy, URL-safe, no embedded meaning
- `qr_` prefix for easy validation

#### Service Layer (`lib/services/qrTokenService.ts`)

**Token Generation:**
- `generateToken()` - Create cryptographically random token
- `isValidTokenFormat(token)` - Validate token format

**Token Lifecycle:**
- `createToken(params)` - Create single token
- `createTokenBatch(params)` - Create N tokens for batch printing
- `resolveToken(tokenValue)` - Resolve token to entity (scan endpoint)
- `revokeToken(id, reason, userId)` - Revoke single token
- `revokeTokensByEntity(params)` - Bulk revoke for recalls

**Query Functions:**
- `getToken(id)` - Get token by internal ID
- `getTokenByValue(token)` - Get token by public value
- `getTokensForEntity(entityType, entityId)` - List tokens for entity
- `getTokensForVersion(versionId)` - List tokens by label version
- `getTokenStats(entityType, entityId)` - Token statistics

**URL Helpers:**
- `buildTokenUrl(token, baseUrl)` - Build scannable URL
- `getBaseUrl()` - Get configured base URL

#### Label Service Integration (`lib/services/labelService.ts`)

**New Functions:**
- `renderLabelWithToken(params)` - Render single label with token-based QR
- `renderLabelsWithTokens(params)` - Render multiple labels with unique tokens
- `generateQRCodeFromUrl(url)` - Generate QR from simple URL

#### API Endpoints

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/qr-tokens/batch` | POST | ADMIN/PRODUCTION/WAREHOUSE | Create tokens in batch |
| `/api/qr-tokens/[id]/revoke` | POST | ADMIN only | Revoke single token |
| `/api/qr-tokens/revoke-by-entity` | POST | ADMIN only | Bulk revoke by entity |
| `/api/labels/render-with-tokens` | POST | ADMIN/PRODUCTION/WAREHOUSE | Render labels with tokens |

#### Public Resolver Page (`/qr/[token]`)

**Behavior:**
1. Validate token format
2. Look up token in database
3. If not found → 404 page
4. If REVOKED → Info page with reason and contact info
5. If EXPIRED → Info page with expiration notice
6. If ACTIVE → Increment scan count, redirect to entity page

**Entity Redirects:**
- PRODUCT → `/qr/product/[entityId]`
- BATCH → `/qr/batch/[entityId]`
- INVENTORY → `/qr/inventory/[entityId]`

### Activity Logging

New logged events:
- `qr_tokens_created` - Batch token creation
- `qr_token_scanned` - Token resolved and scan counted
- `qr_token_revoked` - Single token revocation
- `qr_tokens_bulk_revoked` - Entity-wide revocation

Tags: `['qr', 'label', 'print' | 'scan' | 'revoke' | 'bulk']`

### Explicit Non-Goals (Phase 1)

The following are deferred to future phases:
- Consumer-facing scan dashboards
- Fraud/clone detection
- Geographic scan analytics
- Automated expiration background jobs
- Token reassignment
- Custom payload per token

### Design Decisions

**Token creation timing:**
- QR tokens are created ONLY at label render time via `/api/labels/render-with-tokens`
- The standalone `/api/qr-tokens/batch` route is restricted to ADMIN only and marked deprecated
- This ensures tokens always represent physical printed labels

**Scan logging:**
- Activity logs are created only on the first scan of each token
- Subsequent scans still increment `scanCount` but don't create log entries
- This prevents activity log bloat while preserving audit trail for first use

**Shared rendering helper:**
- Both `/api/labels/render` and `/api/labels/render-with-tokens` use `renderLabelsShared()`
- This enables future consolidation into a single endpoint

### Migration Notes

- Run `npx prisma db push` to apply schema changes
- Existing label prints (before this update) continue to work with legacy QR URLs
- New label prints will use token-based QR system
- No breaking changes to existing functionality

---

## [0.7.0] - 2024-12-12

### Summary

**Label Templates + Versioning + Dynamic QR System** - Added a comprehensive label management system for uploading SVG templates, managing versions, and printing labels with dynamically injected QR codes.

### Core Principles

- **Labels uploaded, not designed**: PsillyOps is a label archive and renderer, not a design tool
- **Version immutability**: Every version is preserved, never overwritten
- **Dynamic QR codes**: Generated at print time, always pointing to live data
- **Storage abstraction**: Prepared for future cloud storage migration
- **SVG source of truth**: PDF rendering deferred to Phase 2

### Added

#### New Files Created

```
lib/services/
├── labelStorage.ts             # Storage abstraction with LocalLabelStorage (NEW)
└── labelService.ts             # Label business logic and QR injection (NEW)

app/(ops)/labels/
└── page.tsx                    # Label management page (NEW)

app/api/labels/
├── templates/
│   ├── route.ts                # List/create templates (NEW)
│   └── [id]/
│       ├── route.ts            # Get/update template (NEW)
│       └── versions/
│           └── route.ts        # Create version with upload (NEW)
├── versions/
│   └── [id]/
│       └── activate/
│           └── route.ts        # Activate/deactivate version (NEW)
└── render/
    └── route.ts                # Render SVG with QR injection (NEW)

components/labels/
├── LabelUploadForm.tsx         # Version upload modal (NEW)
├── LabelPreviewButton.tsx      # Preview modal (NEW)
└── PrintLabelButton.tsx        # Print modal with version selector (NEW)
```

#### Prisma Schema Updates (`prisma/schema.prisma`)

**New Enums:**
- `LabelEntityType` - PRODUCT, BATCH, INVENTORY, CUSTOM

**Updated Enums:**
- `ActivityEntity` - Added LABEL for activity logging

**New Models:**
- `LabelTemplate` - Stores label template metadata
  - Fields: `id`, `name`, `entityType`, `createdAt`, `updatedAt`
  - Relation to `LabelTemplateVersion[]`
  - Index on `entityType`

- `LabelTemplateVersion` - Stores immutable version records
  - Fields: `id`, `templateId`, `version`, `fileUrl`, `qrTemplate`, `isActive`, `notes`, `createdAt`
  - Unique constraint on `[templateId, version]`
  - Indexes on `templateId`, `isActive`

#### Label Storage Abstraction

```typescript
interface LabelStorage {
  save(templateId, version, file, ext): Promise<string>
  load(fileUrl): Promise<Buffer>
  delete(fileUrl): Promise<void>
  exists(fileUrl): Promise<boolean>
}
```

- `LocalLabelStorage` implementation for filesystem
- Configurable via `LABEL_STORAGE_PATH` environment variable
- Default path: `./storage/labels/`

#### QR Payload Format

Structured JSON payloads for QR codes:

```typescript
interface QRPayload {
  type: 'PRODUCT' | 'BATCH' | 'INVENTORY';
  id: string;
  code: string;
  url: string;
}
```

#### API Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/labels/templates` | GET | List all templates |
| `/api/labels/templates` | POST | Create template |
| `/api/labels/templates/[id]` | GET | Get template with versions |
| `/api/labels/templates/[id]` | PATCH | Update template name |
| `/api/labels/templates/[id]/versions` | POST | Upload new version |
| `/api/labels/versions/[id]/activate` | PATCH | Activate/deactivate version |
| `/api/labels/render` | POST | Render SVG with QR injection |

#### UI Enhancements

- **Labels Management Page** (`/labels`):
  - Create templates by entity type
  - Upload SVG versions with notes
  - Activate/deactivate versions
  - Preview rendered labels

- **Print Labels Button** added to:
  - Batch detail page
  - Inventory detail page
  - Product detail page

- **Navigation**: Added "Labels" link to main navigation

#### Validation Schemas (`lib/utils/validators.ts`)

- `createLabelTemplateSchema`
- `updateLabelTemplateSchema`
- `createLabelVersionSchema`
- `renderLabelSchema`
- `qrPayloadSchema`

### Activity Logging

New logged events:
- `label_template_created`
- `label_version_uploaded`
- `label_version_activated`
- `label_version_deactivated`
- `labels_printed`

### Phase 2 (Deferred)

- PDF rendering (currently uses browser SVG + native print)
- Batch label sheets (multiple labels per page)
- Printer calibration helpers
- GS1/UPC barcode support

---

## [0.6.0] - 2024-12-12

### Summary

**Wholesale Pricing, Invoicing & Shipping Manifests** - Added lightweight operational accounting features for tracking wholesale prices, generating invoices, and creating packing slips. This is document-based (not payment-based) with prices snapshotted at order submission.

### Core Principles

- **Document-based, not payment-based**: No payments, taxes, or ledgers
- **Price snapshots**: Prices captured at order submission, preserved for invoicing
- **Invoices derived from orders**: Generated after order is shipped
- **PDFs only**: Downloadable, printable documents

### Added

#### New Files Created

```
lib/services/
└── invoiceService.ts           # Invoice generation and PDF creation (NEW)

app/(ops)/orders/
├── page.tsx                     # Orders list page (ENHANCED)
└── [id]/
    ├── page.tsx                 # Order detail page (NEW)
    └── OrderDocuments.tsx       # Client component for document actions (NEW)

app/api/invoices/
├── route.ts                     # List invoices endpoint (NEW)
├── [orderId]/
│   └── route.ts                 # Generate invoice endpoint (NEW)
└── [id]/
    └── pdf/
        └── route.ts             # Download invoice PDF (NEW)

app/api/orders/[id]/
└── manifest/
    └── route.ts                 # Download packing slip PDF (NEW)
```

#### Prisma Schema Updates (`prisma/schema.prisma`)

**New Models:**
- `Invoice` - Stores invoice records for shipped orders
  - Fields: `id`, `invoiceNo` (unique), `orderId`, `retailerId`, `issuedAt`, `subtotal`, `notes`
  - Indexes on `orderId`, `retailerId`, `invoiceNo`, `issuedAt`

**Updated Models:**
- `Product` - Added `wholesalePrice: Float?` for default unit pricing
- `OrderLineItem` - Added `unitWholesalePrice: Float?` and `lineTotal: Float?` for price snapshots
- `RetailerOrder` - Added relation to `Invoice[]`
- `Retailer` - Added relation to `Invoice[]`
- `ActivityEntity` enum - Added `INVOICE` value

#### TypeScript Enum Updates (`lib/types/enums.ts`)

- Added `INVOICE = 'INVOICE'` to `ActivityEntity` enum

#### Service Layer

**New `lib/services/invoiceService.ts` (340 lines):**
- `generateInvoice(params)` - Create invoice for shipped order with snapshotted prices
- `generateInvoicePdf(invoiceId)` - Generate PDF buffer for invoice download
- `generateManifestPdf(orderId)` - Generate packing slip PDF for any order
- `generateInvoiceNumber()` - Create unique invoice number (INV-YYYYMMDD-XXXX)
- `getInvoice(invoiceId)` - Get invoice by ID with relations
- `getInvoiceByOrderId(orderId)` - Get invoice by order ID
- `getInvoices(filters?)` - List invoices with optional filters
- `getOrdersAwaitingInvoice()` - Get shipped orders without invoices
- `countOrdersAwaitingInvoice()` - Count orders awaiting invoice

**Updated `lib/services/orderService.ts`:**
- `submitOrder()` enhanced to snapshot wholesale prices:
  - Loops through line items
  - Captures `product.wholesalePrice` to `lineItem.unitWholesalePrice`
  - Calculates `lineItem.lineTotal = unitPrice × quantityOrdered`

**Updated `lib/services/aiCommandService.ts`:**
- Added `GenerateInvoiceCommand` type definition
- Added `GenerateManifestCommand` type definition
- Extended `AICommandInterpretation` union type
- Added command mapping in `mapRawResultToCommand()`
- Added resolver logic in `resolveCommandReferences()`
- Added validation in `validateCommand()`
- Added `executeGenerateInvoice()` handler
- Added `executeGenerateManifest()` handler
- Updated `getCommandTag()` with 'invoice' and 'shipping' tags

**Updated `lib/services/aiClient.ts`:**
- Added `parseInvoiceCommand()` function for natural language parsing
- Updated help text in error messages
- Supports patterns:
  - "Generate invoice for order ORD-123"
  - "Invoice Leaf order"
  - "Invoice Mighty Caps"
  - "Create packing slip for The Other Path order"
  - "Manifest for order ORD-456"

#### API Routes

**Invoice Endpoints:**

| Method | Route | Handler | Description |
|--------|-------|---------|-------------|
| POST | `/api/invoices/[orderId]` | `POST` | Generate invoice for order (Admin only) |
| GET | `/api/invoices/[orderId]` | `GET` | Get invoice for specific order |
| GET | `/api/invoices/[id]/pdf` | `GET` | Download invoice as PDF |
| GET | `/api/invoices` | `GET` | List all invoices |
| GET | `/api/invoices?awaiting=true` | `GET` | List orders awaiting invoice |

**Manifest Endpoint:**

| Method | Route | Handler | Description |
|--------|-------|---------|-------------|
| GET | `/api/orders/[id]/manifest` | `GET` | Download packing slip PDF |

#### UI Updates

**New Order Detail Page (`app/(ops)/orders/[id]/page.tsx`):**
- Complete order detail view with:
  - Header with order number, status badge, retailer info
  - Summary cards: Order Total, Allocation status, Invoice status
  - Line items table with product, qty, allocated, unit price, total
  - Order timeline showing creation, approval, shipping, invoicing events
  - Sidebar with retailer contact info
  - Documents section with action buttons
  - Order details card with tracking number

**New OrderDocuments Component (`app/(ops)/orders/[id]/OrderDocuments.tsx`):**
- Client component for document actions
- "Generate Invoice" button (disabled if invoice exists or not shipped)
- "Download Invoice PDF" button
- "Download Packing Slip" button
- Loading states and error handling
- Success/failure feedback messages

**Enhanced Orders List Page (`app/(ops)/orders/page.tsx`):**
- Complete table view with columns:
  - Order number (link to detail)
  - Retailer name
  - Status badge
  - Item count
  - Total value
  - Invoice status badge
  - Created date
- Invoice status badges:
  - ✓ Invoiced (green)
  - Awaiting (amber)
  - — (gray)

**Updated Product Detail Page (`app/(ops)/products/[id]/page.tsx`):**
- Added Wholesale Price field to view mode (5 columns now)
- Added Wholesale Price input to edit mode
- Currency input with $ prefix
- Displays "Not set" when null

**Updated Product API (`app/api/products/[id]/route.ts`):**
- PATCH handler accepts `wholesalePrice` field
- Parses as float, allows null

**Updated Dashboard (`app/(ops)/dashboard/page.tsx`):**
- Added query for `ordersAwaitingInvoice`
- Added query for `awaitingInvoiceCount`
- Passes new props to AlertsPanel and StatsStrip

**Updated AlertsPanel (`components/dashboard/AlertsPanel.tsx`):**
- Added `ordersAwaitingInvoice` prop
- New alert item: "X orders awaiting invoice"
- Emerald indicator dot
- Link to Orders page

**Updated StatsStrip (`components/dashboard/StatsStrip.tsx`):**
- Added `awaitingInvoiceCount` prop
- New stat: "Awaiting Invoice"
- Grid now 5 columns on desktop

#### Dependencies

**Added to `package.json`:**
```json
{
  "dependencies": {
    "pdfkit": "^0.15.0"
  },
  "devDependencies": {
    "@types/pdfkit": "^0.13.0"
  }
}
```

### Changed

- `Product` model now has optional `wholesalePrice` field
- `OrderLineItem` model stores snapshot pricing
- Product detail shows 5 columns in view mode
- Product API PATCH endpoint accepts `wholesalePrice`
- Orders submitted after this update will have price snapshots
- Dashboard displays invoice-related alerts and stats
- AI command system supports invoice/manifest generation

### Migration Notes

- Run `npx prisma db push` to apply schema changes
- Existing orders will have null `unitWholesalePrice` and `lineTotal`
- Set wholesale prices on products before creating new orders
- Invoices can only be generated for orders submitted after this update (with snapshotted prices)

---

## [0.5.0] - 2024-12-12

### Summary

**AI Command Console & Document Ingest** - Implemented an AI-powered command system for natural language inventory operations and document parsing capabilities.

### Added

#### Prisma Schema Updates

**New Models:**
- `AICommandLog` - Tracks natural language command interpretation and execution
  - Fields: inputText, normalized, status, aiResult, executedPayload, error, appliedAt
  - Indexes on status and createdAt
- `AIDocumentImport` - Tracks document-based imports (invoices, receipts, batch sheets)
  - Fields: sourceType, originalName, contentType, textPreview, status, confidence, aiResult
  - Indexes on status and createdAt

**Updated Models:**
- `User` - Added relations to `AICommandLog[]` and `AIDocumentImport[]`

#### Service Layer

**New `aiClient.ts`:**
- `interpretNaturalLanguageCommand()` - Parse text to structured command
- `parseDocumentContent()` - Parse document to multiple commands
- Basic pattern matching fallback when AI provider not configured

**New `aiCommandService.ts`:**
- `interpretCommand()` - Full pipeline: AI call → type mapping → reference resolution → log creation
- `executeInterpretedCommand()` - Route to domain services with validation and logging
- `resolveCommandReferences()` - Map fuzzy references to database IDs
- Resolver helpers for materials, products, retailers, batches, locations, vendors
- Typed command unions: `ReceiveMaterialCommand`, `MoveInventoryCommand`, `AdjustInventoryCommand`, `CreateRetailerOrderCommand`, `CompleteBatchCommand`, `CreateMaterialCommand`

**New `aiIngestService.ts`:**
- `createDocumentImport()` - Parse document text and create import record
- `listDocumentImports()` - Query imports with pagination and filters
- `getDocumentImport()` - Get single import details
- `applyDocumentImport()` - Execute all parsed commands
- `rejectDocumentImport()` - Mark import as rejected

#### API Routes

**Command Endpoint:**
- `POST /api/ai/command` - Interpret and optionally execute natural language command

**Ingest Endpoints:**
- `POST /api/ai/ingest` - Create new document import
- `GET /api/ai/ingest` - List document imports
- `GET /api/ai/ingest/[id]` - Get import details
- `POST /api/ai/ingest/[id]/apply` - Apply all commands
- `POST /api/ai/ingest/[id]/reject` - Reject import

#### UI Components

**AI Command Bar (`components/ai/AiCommandBar.tsx`):**
- Modal dialog with keyboard shortcut (Cmd+K)
- Two-step flow: Interpret → Confirm & Execute
- Example commands display
- Resolved reference preview
- Success/error states

**AI Ingest Page (`app/(ops)/ai-ingest/page.tsx`):**
- Paste textarea for document input
- Recent imports list with status badges
- Detail panel with parsed commands
- Apply/Reject action buttons
- Raw JSON preview for debugging

#### RBAC Updates

- Added `ai` resource permissions:
  - `command`: ADMIN, PRODUCTION, WAREHOUSE
  - `ingest`: ADMIN, PRODUCTION, WAREHOUSE
  - `view`: ADMIN, PRODUCTION, WAREHOUSE, REP
- Added `canUseAICommand()` and `canUseAIIngest()` helper functions

#### Logging Integration

- AI commands log to ActivityLog with entityType: SYSTEM
- Tags: `['ai_command', 'inventory']` (domain-specific)
- Domain-level logging preserved through existing services

### Changed

- Updated ops layout to include AI Command button in header
- Added AI Ingest link to navigation

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
