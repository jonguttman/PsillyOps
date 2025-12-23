# Application Physical Exam

**Patient:** PsillyOps / TripDAR System  
**Exam Date:** December 22, 2024  
**Examiner:** Senior Staff Engineer (AI-assisted)

---

## 1. Vital Signs (High-Level Health)

### Overall Complexity
**Moderate to High** — but appropriate for what the system does.

This is a vertically integrated operations platform covering inventory, production, QR/seal generation, partner management, and consumer-facing transparency. The complexity is earned, not accidental.

### Cognitive Load for New Contributors
**Moderate** — with good entry points.

The system has clear layering (API routes → services → database), consistent patterns, and now a `SYSTEM_MAP.md` that orients newcomers. The seal/QR subsystem is the densest area; the ops UI is straightforward.

### Architectural Coherence
**Strong** — pieces fit together well.

The service layer pattern is followed consistently. Business logic stays out of routes. The separation between "internal ops" and "public-facing" routes is clean. The seal system is intentionally isolated from the rest.

### Stability vs Experimentation Balance
**Healthy tilt toward experimentation** — which is appropriate for the project's stage.

The seal tuner, AI command features, and experience survey system are clearly experimental. Core inventory/production flows are more stable. This is the right balance for an evolving product.

---

## 2. Weight & Mass

### Measurements

| Category | Count |
|----------|-------|
| Database models | 51 |
| Service files | 45 |
| API routes | ~132 |
| UI pages (TSX) | ~116 |
| Total service code | ~23,800 lines |
| Schema size | ~1,265 lines |

### Where Mass is Concentrated

**Heavy areas (by design):**
- **Label system** (`labelService.ts` — 2,706 lines) — Complex SVG manipulation, placement logic, print rendering
- **AI command system** (`aiCommandService.ts` — 2,062 lines) — Natural language parsing, intent routing, safety boundaries
- **Production system** (`productionService.ts` + `productionRunService.ts` — 2,544 lines combined) — Batch lifecycle, step tracking, material allocation
- **Seal rendering** (`sealSporeFieldService.ts` + `sealQrRenderer.ts` — 1,664 lines combined) — Deterministic visual generation

**Observation:** The heaviest services correspond to the most complex business domains. This is expected and healthy.

### Potentially Overweight Areas

**`labelService.ts` (2,706 lines)** — This is the largest single service. It handles:
- SVG parsing and manipulation
- Element placement calculations
- Print job orchestration
- Version management
- QR injection

This could be split into smaller concerns (e.g., `labelRenderService`, `labelPlacementService`), but it's not urgent. The code is well-organized internally.

---

## 3. Skeletal Structure (Architecture)

### Major Subsystems

```
┌─────────────────────────────────────────────────────────────┐
│                     PUBLIC SURFACES                         │
│  /qr/[token]  /seal/[token]  /verify/[token]  /tripdar/*   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     OPS APPLICATION                         │
│  Products │ Materials │ Inventory │ Production │ Orders    │
│  Seals    │ Labels    │ QR Tokens │ Transparency│ Partners │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     SERVICE LAYER                           │
│  45 services — ALL business logic lives here                │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     DATA LAYER                              │
│  Prisma ORM → PostgreSQL (51 models)                        │
└─────────────────────────────────────────────────────────────┘
```

### Load-Bearing Structures
- **`loggingService.ts`** — Every significant action flows through here (157 `logAction` calls across 27 services)
- **`qrTokenService.ts`** — Central to all QR/seal resolution
- **`inventoryService.ts`** — Core to production and order fulfillment
- **Prisma schema** — Single source of truth for all data relationships

### Flexible Areas
- Seal tuner and presets (experimental, isolated)
- AI command system (can evolve without affecting core flows)
- Experience/survey system (consumer-facing, independent)
- Partner portal (separate auth, separate concerns)

### Signs of Structural Asymmetry
**Minor:** The seal system has its own constants file (`seal.ts`, `sealPresets.ts`) and type file (`sealConfig.ts`), while other domains share `enums.ts`. This is appropriate isolation, not inconsistency.

---

## 4. Musculature (Core Capabilities)

### What the App is Especially Strong At

**1. Audit Logging**
The `logAction` pattern is used consistently across 27 services. Field-level diffs, auto-tagging, IP/user-agent tracking. This is mature infrastructure.

**2. QR Token Resolution**
The opaque token system (`qr_XXXX`) with server-side resolution is well-designed. Tokens can point to different entities, be revoked, track scans — all without changing printed codes.

**3. Service Layer Discipline**
API routes are thin. Business logic stays in services. This is enforced culturally, not technically, but it's been followed consistently.

**4. Seal Determinism**
Same token + version = identical SVG forever. The checksum validation on the base SVG, the hash-based spore generation, the explicit versioning — this is careful engineering.

### Well-Factored Systems
- `productionRunService.ts` — Step lifecycle, assignment, health flags all in one place
- `qrRedirectService.ts` — Clean fallback chain logic
- `transparencyService.ts` — Good separation of record management vs display

---

## 5. Circulatory System (Data Flow)

### How Data Moves

**Order-to-Production Flow:**
```
Order Created → Allocation Check → Production Order → Batch Created →
Step Execution → QC → Inventory Created → Order Fulfilled
```

**Seal Generation Flow:**
```
Token Created → Config Selected → QR Rendered → Spore Field Generated →
Base SVG Loaded → Elements Injected → Final SVG Output
```

**Scan Resolution Flow:**
```
Token Scanned → qrTokenService.resolve() → scanResolverService.getContext() →
Route to appropriate page (production run, transparency, material, etc.)
```

### Bottlenecks
**None critical.** The service layer is stateless; database is the only shared state.

### Pressure Points
- **Label rendering** — SVG manipulation is CPU-intensive. Large print jobs could be slow.
- **Spore field generation** — 32,000–80,000 particles computed per seal. Cached by token, but first render is expensive.

### Clean vs Turbulent Flow
- **Clean:** Inventory movements, production steps, order lifecycle
- **Slightly turbulent:** AI command routing (many intents, complex parsing)

---

## 6. Nervous System (Complexity & Sensitivity)

### Fragile or Tightly Coupled Areas

**1. Seal Base SVG**
The `tripdar_seal_base_and_text.svg` file is checksummed. Any modification breaks determinism. This is intentional fragility — it forces explicit version bumps.

**2. QR Mode Separation**
`QrRenderMode.SEAL` vs `QrRenderMode.LABEL` must never be mixed. The rendering algorithms are incompatible.

**3. Production Step Ordering**
Steps have gap-free integer `order` values with unique constraints. Reordering requires careful transaction handling.

### Areas Where Small Changes Have Large Effects
- `loggingService.ts` — Changes affect audit trail for everything
- `qrTokenService.ts` — Changes affect all QR resolution
- `sealGeneratorService.ts` — Changes affect all seal output

### Places Requiring Extra Care
- Prisma migrations (51 models with complex relations)
- Base preset definitions (saved presets reference these)
- Error code definitions (API contracts depend on them)

---

## 7. Immune System (Defenses & Safety)

### Error Handling Robustness
**Good.** Centralized `AppError` class with typed error codes. `handleApiError()` provides consistent API responses. Zod validation errors are caught and formatted.

### Guardrails Against Misuse
- Role-based access control (ADMIN, PRODUCTION, WAREHOUSE, REP)
- Partner isolation (partners only see their own data)
- AI command boundaries (can propose but not auto-execute production changes)
- Token revocation with reasons

### Observability

| Aspect | Status |
|--------|--------|
| Action logging | ✅ Excellent (157 logAction calls) |
| Console logging | ⚠️ Light (15 console.log/error calls in services) |
| Error tracking | ⚠️ Basic (console.error, no external service) |
| Performance monitoring | ❌ Not present |

**Observation:** The audit logging is excellent for business actions. Technical observability (performance, errors) could be stronger for production debugging.

---

## 8. Growth Patterns

### Where the System is Naturally Growing

**1. Seal/QR Visual System**
The tuner, presets, and export features are actively evolving. This is intentional experimentation.

**2. Experience/Survey System**
TripDAR experience collection, vibe vocabulary, prediction profiles — this is a growing consumer-facing feature set.

**3. Partner Portal**
Binding sessions, product assignment, seal sheet management — expanding B2B capabilities.

### Intentional vs Reactive Growth
- **Intentional:** Seal tuner, production runs, transparency records
- **Reactive:** Some AI command handlers feel like they were added to solve specific requests

### Early Signs of Technical Debt

**1. Large UI Components**
`SealTunerPanel.tsx` (1,405 lines), `LabelPreviewButton.tsx` (1,335 lines), `AiCommandBar.tsx` (1,201 lines) — these could benefit from extraction into smaller components.

**2. Service Size Variance**
Services range from 81 lines (`vibeVocabularyService.ts`) to 2,706 lines (`labelService.ts`). The large ones aren't problematic yet, but they're approaching the point where splitting would help.

**3. Mobile Components**
17 files in `components/mobile/` — this is a parallel UI layer that could drift from the main ops UI patterns.

---

## 9. Energy & Fatigue

### Areas That Likely Slow Development

**1. Seal Visual Iteration**
Before the tuner existed, changing seal parameters required code changes and rebuilds. The tuner solved this, but the underlying services are still complex to modify.

**2. Label Placement Logic**
`labelService.ts` has intricate SVG manipulation. Changes require understanding coordinate systems, viewBox transformations, and print scaling.

**3. AI Command Expansion**
Adding new AI intents requires touching multiple places: intent definitions, routing logic, execution handlers.

### Repeated Patterns That Cause Friction
- Manual role checks in API routes (could be middleware)
- Similar CRUD patterns across services (no shared abstraction, but also no strong need for one)

### Cognitive Fatigue Points
- Understanding the full seal rendering pipeline (5+ services involved)
- Tracing a QR scan through resolution → context → display
- Navigating the 51-model schema

---

## 10. Doctor's Notes (Gentle Recommendations)

### Low-Impact, High-Benefit Improvements

**1. 🥗 Nutrition: Add Technical Observability**
Consider adding basic performance timing to expensive operations (seal generation, label rendering). Even `console.time`/`console.timeEnd` would help identify slowdowns.

**Priority:** Can wait, but useful before scaling.

**2. 🏃 Exercise: Extract Large Components**
`SealTunerPanel.tsx` could split into:
- `TunerPreview.tsx`
- `TunerControls.tsx`
- `TunerLabNotebook.tsx`

This would make the tuner easier to maintain and test.

**Priority:** Next time you're in there anyway.

**3. 🧘 Posture: Standardize Mobile Patterns**
The `components/mobile/` folder has good components, but they don't share a style guide with the ops UI. Consider a shared design token file or component library.

**Priority:** Before mobile becomes a primary interface.

**4. 💊 Supplement: Add Integration Tests for Critical Paths**
The seal generation and QR resolution paths are critical and complex. A few integration tests would catch regressions early.

**Priority:** Deserves attention soon (before major refactors).

**5. 😴 Rest: Document AI Command Intents**
The AI command system has many intents scattered across the service. A simple intent registry or documentation would help future maintainers.

**Priority:** Can wait until AI features stabilize.

---

## Overall Health Summary

### Diagnosis

**Healthy and growing fast, with localized density.**

The system has a strong skeletal structure (service layer, logging, QR tokens) and good immune defenses (error handling, audit trails, role-based access). The seal/label subsystems are dense but intentionally isolated. Growth is mostly intentional, with minor signs of organic accumulation in the AI command area.

### Prognosis

**Excellent** — with attention to the following:

1. Keep the service layer discipline as the system grows
2. Split large components when they become painful, not before
3. Add observability before you need it for debugging
4. Protect the seal determinism invariants

### Patient Instructions

- Continue current exercise regimen (iterative development, tuner-based experimentation)
- Maintain healthy diet (small, focused commits; clear PR descriptions)
- Schedule follow-up in 3–6 months to reassess growth patterns
- No surgery required at this time

---

*Exam complete. Patient is cleared for continued development.*

