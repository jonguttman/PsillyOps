# SYSTEM_MAP.md

A gentle introduction to the TripDAR / PsillyOps system architecture.

---

## What This System Is

This is an inventory and production management system for a mushroom supplement company, but with a twist: it includes a **visual authentication seal** that uses sophisticated QR rendering to create product certification marks that are both beautiful and scannable.

The system handles the normal stuff you'd expect—materials, vendors, production orders, inventory tracking—but it also generates and manages **TripDAR seals**: circular, radar-aesthetic certification marks that embed QR codes into organic-looking spore clouds. These seals go on product packaging, connect to transparency data, and optionally collect consumer experience reports.

This is different from a normal QR system because the codes aren't just functional rectangles—they're art. The visual design matters as much as the scan reliability. The system treats them as physical artifacts that must render identically every time and survive printing at 1" diameter.

---

## The Big Pieces

Think of the system as several conceptual areas that work together but stay separate:

### **Core Operations (The Business)**
Handles products, materials, vendors, purchase orders, inventory movements, and production planning. This is the "normal ERP stuff" that keeps manufacturing running. If you removed all the seal/QR features, this would still be a complete production management system.

**What it doesn't do:** Make assumptions about what you're producing. It's category-agnostic.

### **Production Workflow (The Factory Floor)**
Manages production runs with mobile-friendly QR-driven checklists. Workers scan a code, see their assigned steps, clock in/out of tasks, and mark them complete. Designed to work on phones in messy environments.

**What it doesn't do:** Replace human judgment. Steps can be skipped with reasons, and supervisors can override.

### **Seal Generation (The Art Engine)**
Creates the visual TripDAR seals. Takes a token string and configuration parameters, outputs an SVG. Uses deterministic rendering so the same token always produces an identical seal. Includes a tuning panel for experimenting with visual styles.

**What it doesn't do:** Know anything about products or users. It's a pure generator—give it a token, get back a seal.

### **QR Token Management (The Link Layer)**
Creates and tracks opaque tokens (like `qr_2x7kP9mN4vBcRtYz8LqW5j`) that connect to products, batches, production runs, or materials. Logs every scan, handles expiry, supports revocation. Tokens can point to different things depending on context.

**What it doesn't do:** Store URLs. The token is resolved server-side, so you can change what it points to without reprinting.

### **Transparency & Experience (The Consumer Side)**
Public-facing pages where consumers scan seals to see product origin info, batch data, and lab results. Optionally prompts for experience surveys in a calm, privacy-respecting way.

**What it doesn't do:** Make assumptions about product effects. Surveys use neutral language and dimensional sliders, not claims.

### **Labels & Print (The Physical Bridge)**
Handles product label design with QR placement, generates print jobs, and exports PDFs with cut guides. Keeps track of label versions so you can see what was printed when.

**What it doesn't do:** Mix label QRs and seal QRs. They use separate rendering paths because they have different requirements.

### **Permissions & Partners (The Access Layer)**
Controls who can see what. Internal users have role-based access (admin, production, warehouse, sales). External partners can log in to see their assigned products and seals but nothing else.

**What it doesn't do:** Share data between partners. Each partner sees only their own stuff.

---

## How Data Flows (At a Human Level)

Here's the lifecycle from a product perspective:

**A product gets created** with a SKU, name, and bill of materials. It knows which raw materials it needs and in what quantities.

**A production run starts** when you need to make more. The run gets a QR token. Workers scan it on their phones, see the checklist, and work through steps. Each step completion is logged with timestamps.

**When production finishes**, you get finished goods inventory. Those units go into specific storage locations and are tracked by batch.

**A seal gets generated** for the batch or product. The seal uses a unique token, renders as an SVG with an embedded QR code hidden in a spore cloud texture. The seal's visual parameters come from presets that have been tuned for print reliability.

**Seals get printed** on sheets with cut guides. The print job is logged so you know how many were made. Each seal has the same token but is part of a numbered sheet.

**Consumers scan the seal** on the finished product. The token resolves to a transparency page showing batch info, ingredients, strain details, and maybe a prompt to share their experience. Each scan is logged.

**If something goes wrong**, tokens can be revoked with a reason, and they'll show an appropriate message instead of the normal page.

---

## Where Things Live (Gentle Pointers)

Here's how the codebase is organized conceptually:

### **`lib/services/`** — Core Logic That Actually Does Things
This is where all business logic lives. If you need to understand *how* something works—allocation, MRP calculations, seal generation, QR rendering—it's here. Services are pure functions that take data in, do work, and return results. They don't know about HTTP or React.

**Examples:** `sealGeneratorService.ts`, `qrTokenService.ts`, `inventoryService.ts`, `productionRunService.ts`

### **`lib/constants/`** — Opinionated Defaults and Presets
Seal geometry, zone boundaries, preset configurations for visual styles. If something feels like a "magic number," it's probably defined here with an explanation.

**Examples:** `seal.ts` (geometry constants), `sealPresets.ts` (visual algorithm variants)

### **`lib/types/`** — Shared Interfaces and Enums
TypeScript definitions for config objects, enums for statuses and modes, interfaces for API responses.

### **`app/ops/`** — Internal Tools for Staff
Pages and routes for people running the business. Product management, production boards, seal tuning, inventory views. Protected by role-based access.

### **`app/partner/`** — External Partner Portal
Minimal interface for partners to see their assigned products and generate seals. Separate login, separate permissions.

### **`app/qr/` and `app/seal/`** — What the Outside World Scans
Public-facing pages that resolve tokens. No authentication required. Show transparency info, optionally collect experience data.

### **`app/api/`** — HTTP Entry Points
API routes grouped by domain. Very thin—validate input, call service layer, return JSON. Almost no logic here.

### **`components/`** — UI Building Blocks
React components organized by feature. Client-side interactivity, forms, tables, mobile layouts.

### **`prisma/schema.prisma`** — Database Structure
The canonical data model. Products, materials, inventory, users, QR tokens, seals, production runs—everything that persists.

### **`docs/`** — Human Documentation
User manual, developer manual, changelog, and the seal development log (which explains the visual evolution in detail).

---

## Things That Are Easy to Break (Read Before Touching)

### **Seal Determinism**
The seal generator must produce identical output for the same token + version forever. If you change the base SVG, constants, or rendering algorithm, old seals won't match. This is intentional—seals are physical artifacts. Changes require version bumps.

**Why this matters:** A company might print 10,000 seals. If you change the generator, rescanning one won't match the database record.

### **QR Mode Separation (SEAL vs LABEL)**
There are two QR rendering paths: one for seals (dot-based, artistic, embedded in spore clouds) and one for labels (standard square QR, maximum readability). They are explicitly separated by the `QrRenderMode` enum.

**Why this matters:** Seal rendering optimizes for aesthetics and uses module masking. Label rendering optimizes for scan speed and uses vanilla QR codes. Mixing them will break one or the other.

### **Service Layer Boundaries**
Services should never import from `app/` or depend on HTTP context. They take data in, return data out. This keeps them testable and reusable.

**Why this matters:** If you put business logic in API routes, you can't call it from scripts, background jobs, or tests without mocking HTTP.

### **Token Opacity**
QR tokens are opaque strings. The system never encodes URLs or product IDs into the token itself. Tokens are resolved server-side.

**Why this matters:** If tokens were transparent (like encoding `/product/123`), you couldn't change the destination without reprinting. Opaque tokens let you redirect without physical changes.

### **Preset System**
Seal presets are not just parameter tweaks—they represent different algorithms (dot-zones, module-masked, material-unified). Changing a preset affects rendering logic.

**Why this matters:** Presets are versioned. If you modify one, existing seals using that preset won't regenerate identically.

### **Spore Field Node Count**
The spore field used to be SVG dots. It hit browser node limits and crashed. Now it's a raster PNG embedded as a single `<image>` node. Don't convert it back to SVG dots.

**Why this matters:** 80,000 `<circle>` elements breaks parsers. One `<image>` with 80,000 pixels works fine.

---

## If You're New, Start Here

Depending on what you want to do:

### **"I want to change how seals look"**
Start with the Seal Tuner at `/ops/seals`. It's an interactive panel where you can adjust parameters and see results immediately. Understand the preset system first (read `sealPresets.ts`), then look at the spore field service to see how zones work.

### **"I want to improve scan reliability"**
Read the seal development log (`TRIPDAR_SEAL_DEVELOPMENT_LOG.md`). It explains the evolution from basic QR to module-masked spore fields. Then look at the tuner to experiment with quiet core, edge buffers, and light module opacity.

### **"I want to add a new preset"**
Clone an existing preset in `sealPresets.ts`, adjust parameters, and give it a descriptive name. Test it in the tuner, export PDFs at different sizes, and verify scans with real phones before deploying.

### **"I want to understand how production tracking works"**
Start with `productionRunService.ts` to see step lifecycle logic. Then look at the mobile production run page at `/qr/[token]` to see how workers interact with it. Check the schema for `ProductionRun` and `ProductionRunStep`.

### **"I want to add a new QR token type"**
Look at `qrTokenService.ts` to see how tokens are created and resolved. Add your new entity type to the `LabelEntityType` enum in Prisma, then add resolution logic in `scanResolverService.ts`.

### **"I just want to understand the big picture"**
You're already doing it. Read this document, skim the user manual for workflows, then look at the database schema to see how entities relate. Don't try to read code yet—understand the concepts first.

---

## What This Document Is Not

This is **not** full documentation. It won't teach you how to use the system, how to deploy it, or how to fix specific bugs.

This is **not** a spec. It doesn't define requirements or acceptance criteria.

This is **not** a walkthrough. It won't explain every file or function.

**This is a map.** It's here to reduce cognitive load when you first encounter this codebase. It tells you what exists, why it exists, and where to look when you need to dig deeper.

Think of it as a friendly orientation session from a colleague who wants you to feel less overwhelmed.

---

## Final Notes

The system is built with care for:
- **Determinism** (same input = same output, forever)
- **Separation of concerns** (services don't know about HTTP)
- **Auditability** (everything logged with timestamps and diffs)
- **Graceful degradation** (if something breaks, fail clearly, not silently)

It's okay to feel intimidated by large codebases. Start small. Pick one concept, explore it, and expand from there. The structure is intentional—once you understand the pattern, the rest follows.

If you're stuck, look for service files. They're where the real work happens, and they're written to be read by humans.

Welcome to the codebase. Take your time.

---

*Last updated: December 22, 2024*

