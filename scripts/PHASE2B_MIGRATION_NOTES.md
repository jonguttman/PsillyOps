# Phase 2B Migration Notes

## Important Assumption

**Phase 2B assumes no legacy TripDAR seal tokens exist.**

All SealSheet records are created exclusively via Phase 2A generation (`/api/seals/generate`).

## Migration Steps

1. Run Prisma migration: `npx prisma migrate dev --name phase2b_partner_layer`
2. Run VibesProfile migration: `npx prisma migrate dev` (if migrating PredictionProfile)
3. No retrofit script needed - all SealSheets are created at generation time

## What Phase 2B Does NOT Do

Phase 2B intentionally does NOT implement:
- Mobile batch scanning
- Timed scan windows
- Anti-sharing enforcement
- Device-level binding locks
- Full binding UX (placeholder UI only)

These are implemented in Phase 2C+.

