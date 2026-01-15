# TripDAR Implementation Phases

## Phase 2A: Seal Generation (Complete)

**Goal**: Deterministic seal SVG generation with QR cloud integration.

**Delivered**:
- Seal generator service with deterministic output
- QR cloud injection into base SVG
- Sheet layout engine (Letter, A4, custom)
- Batch generation API
- PDF export

**Invariants**:
- Same token + version = identical SVG forever
- Generator never modifies base SVG
- No marketing copy in generator layer

---

## Phase 2B: Partner & Assignment Layer (Complete)

**Goal**: Ownership, assignment, and operational control over TripDAR Seals.

**Delivered**:
- Partner entity and user assignment
- SealSheet tracking and assignment
- PartnerProduct definitions (lightweight, no inventory)
- ExperienceBinding (seal → product)
- Unified VibesProfile model
- Partner portal (structural scaffolding)
- Partner suspension enforcement

**Critical Assumption**:
- **No legacy TripDAR seal tokens exist prior to Phase 2A**
- All SealSheet records are created exclusively via Phase 2A generation
- No retrofit or inference scripts needed

**Phase 2B Intentionally Does NOT Implement**:
- ❌ Mobile batch scanning (scan many → auto-bind)
- ❌ Timed scan windows (BindingSession model)
- ❌ Anti-sharing enforcement
- ❌ Device-level binding locks
- ❌ Batch binding operations
- ❌ Partner billing/invoicing
- ❌ Partner self-service account creation
- ❌ Partner marketplace or directory

**These are implemented in Phase 2C+.**

**SealState Resolution Precedence** (highest → lowest):
1. Token revoked/expired
2. SealSheet revoked
3. Token expired (expiresAt < now)
4. Sheet unassigned
5. Seal unbound
6. Active

**Partner Suspension Rules**:
- Suspended partners cannot:
  - Bind new seals
  - Create new PartnerProducts
  - Update products or vibes profiles
- Existing bindings:
  - Still resolve on `/seal/[token]`
  - Still render as read-only
  - History preserved

---

## Phase 2C: Mobile Batch Binding Mode (Complete)

**Goal**: Mobile-first batch binding of TripDAR Seals during production labeling.

**Delivered**:
- BindingSession model (time-boxed, 5-minute default)
- One-active-session-per-partner enforcement
- Mobile scan-and-bind UI with camera integration
- Haptic feedback (success, rebind, session end)
- Optional audio feedback (toggleable, OFF by default)
- Rebind detection with confirmation modal
- Last 5 scans display for QA/training
- Session summary on completion
- Full audit logging

**Key Invariants**:
- Only ONE active BindingSession per Partner at any time
- `already_bound` is a no-op (success haptic, no new binding, no scanCount increment)
- Rebinding requires explicit confirmation (never automatic)
- All batch bindings reference a BindingSession
- Manual bindings (Phase 2B) have `bindingSessionId = null`

**Feedback Mapping**:
| Scan Outcome | Haptic | Audio (optional) | Scanner State |
|--------------|--------|------------------|---------------|
| Bound | 1 short vibration | Soft tick | Continue |
| Already bound | 1 short vibration | Soft tick | Continue |
| Rebind detected | 2 short vibrations | Lower chime | Pause + modal |
| Invalid scan | None | None | Continue |
| Session expired | Long vibration | Optional alert | Stop |

**Timer Behavior**:
- Countdown displays MM:SS
- Amber warning at <30 seconds (no sound/vibration)
- Red critical at <10 seconds
- Auto-expires and triggers long vibration

**Phase 2C Does NOT Implement**:
- ❌ Device locking
- ❌ DRM / cryptographic enforcement
- ❌ Background scanning
- ❌ Real-time camera streaming
- ❌ Anti-sharing mechanisms

---

## Migration Notes

See `scripts/PHASE2B_MIGRATION_NOTES.md` for Phase 2B migration instructions.

### Phase 2C Migration

Run Prisma migration to add BindingSession model and ExperienceBinding extensions:
```bash
npx prisma migrate dev --name phase2c_binding_sessions
```

Audio files (optional) should be added to `public/sounds/`:
- `scan-success.mp3` (~30kb)
- `scan-rebind.mp3` (~30kb)

