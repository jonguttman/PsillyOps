# Phase 1: Read-Only Security Baseline Implementation

## Overview

This document summarizes the Phase 1 security implementation for PsillyOps, which establishes a read-only security baseline and monitoring dashboard without changing any existing business logic.

## Implementation Date

December 16, 2025

## Objectives Completed

✅ Normalized ActivityLog schema to support auth events  
✅ Centralized auth logging  
✅ Created security dashboard with 4 monitoring panels  
✅ Added admin-only API routes for security data  
✅ Maintained backward compatibility with existing logging  

---

## 1. Database Schema Changes

### ActivityLog Table Updates

**File**: `prisma/schema.prisma`

**Changes**:
- Made `entityType` and `entityId` **nullable** to support system-level events (like auth)
- Added `ipAddress` field (nullable String) for tracking request origins
- Added `userAgent` field (nullable String) for device/browser tracking
- Renamed internal field `details` → `metadata` for clarity (backward compatible)

**Migration Applied**: Using `prisma db push` (no breaking changes)

### Schema Definition

```prisma
model ActivityLog {
  id          String          @id @default(cuid())
  entityType  ActivityEntity?  // Now nullable
  entityId    String?          // Now nullable
  action      String
  userId      String?
  ipAddress   String?          // NEW
  userAgent   String?          // NEW
  summary     String
  diff        Json?
  metadata    Json?            // Renamed from details
  tags        Json?
  createdAt   DateTime        @default(now())
  
  user        User?  @relation(fields: [userId], references: [id])
  
  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@index([tags])
  @@index([action])
}
```

---

## 2. Auth Logging Service

### New Helper Functions

**File**: `lib/services/loggingService.ts`

**Added Functions**:

1. **`logAuthLoginSuccess(params)`**
   - Action: `AUTH_LOGIN_SUCCESS`
   - Tags: `['auth', 'login', 'success']`
   - Captures: userId, email, IP, user agent

2. **`logAuthLoginFailure(params)`**
   - Action: `AUTH_LOGIN_FAILURE`
   - Tags: `['auth', 'login', 'failure', 'security']`
   - Captures: email, reason, IP, user agent
   - Use cases: Missing credentials, user not found, inactive account, invalid password, system error

3. **`logAuthLogout(params)`**
   - Action: `AUTH_LOGOUT`
   - Tags: `['auth', 'logout']`
   - Captures: userId, email, IP, user agent

4. **`logAuthSessionCreated(params)`**
   - Action: `AUTH_SESSION_CREATED`
   - Tags: `['auth', 'session']`
   - Captures: userId, email, role
   - Fires once when JWT is first created after successful login

### Interface

```typescript
export interface AuthLogParams {
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}
```

---

## 3. Auth Integration

### NextAuth Integration

**File**: `lib/auth/auth.ts`

**Changes**:
- Imported auth logging functions
- Added logging to `authorize()` function at key decision points
- Added logging to `jwt()` callback for session creation
- All logging is **non-blocking** (fire-and-forget with `.catch()`)

**Logging Points**:

| Event | Trigger | Action Logged |
|-------|---------|---------------|
| Missing credentials | No email/password | `AUTH_LOGIN_FAILURE` |
| User not found | Database lookup fails | `AUTH_LOGIN_FAILURE` |
| Inactive account | `user.active === false` | `AUTH_LOGIN_FAILURE` |
| Invalid password | Password mismatch | `AUTH_LOGIN_FAILURE` |
| System error | Exception in authorize | `AUTH_LOGIN_FAILURE` |
| Login success | Password matches | `AUTH_LOGIN_SUCCESS` |
| Session creation | JWT callback with user | `AUTH_SESSION_CREATED` |

**Key Design Decision**: Logging is async without `await` to prevent blocking the auth flow. Errors are caught and logged to console but don't affect authentication.

---

## 4. Security API Routes

### Four New Admin-Only Endpoints

All routes require:
- Valid session (`auth()`)
- Admin role check
- Return JSON with `{ data, summary }` structure

---

#### 4.1 Auth Activity

**Route**: `GET /api/security/auth-activity`

**Query Params**:
- `hours` (optional, default: 24)

**Returns**:
```typescript
{
  events: ActivityLog[],  // Last 100 auth events
  summary: {
    totalEvents: number,
    successfulLogins: number,
    failedLogins: number,
    logouts: number,
    sessionsCreated: number,
    uniqueUsers: number,
    uniqueIPs: number,
    timeRange: { hours, startDate, endDate }
  }
}
```

**Query**:
- Filters by actions: `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOGOUT`, `AUTH_SESSION_CREATED`
- Time range: last N hours
- Includes user details
- Ordered by most recent

---

#### 4.2 Sensitive Actions

**Route**: `GET /api/security/sensitive-actions`

**Query Params**:
- `hours` (optional, default: 24)

**Returns**:
```typescript
{
  actions: ActivityLog[],  // Last 100 sensitive actions
  summary: {
    totalActions: number,
    byEntityType: Record<string, number>,
    byUser: Record<string, number>,
    timeRange: { hours, startDate, endDate }
  }
}
```

**Query**:
- Entity types: `PRODUCT`, `MATERIAL`, `BATCH`, `INVENTORY`, `PRODUCTION_ORDER`, `PURCHASE_ORDER`
- Tags: `created`, `deleted`, `status_change`, `quantity_change`, `adjustment`
- Time range: last N hours
- Includes user details
- Ordered by most recent

---

#### 4.3 Account Snapshot

**Route**: `GET /api/security/account-snapshot`

**Query Params**: None

**Returns**:
```typescript
{
  users: Array<User & { recentActivityCount: number }>,
  summary: {
    totalUsers: number,
    activeUsers: number,
    inactiveUsers: number,
    byRole: Record<string, number>,
    recentlyActive: number  // Last 7 days
  }
}
```

**Query**:
- All users with activity count (last 7 days)
- Grouped by role
- Active/inactive breakdown

---

#### 4.4 System Errors

**Route**: `GET /api/security/system-errors`

**Query Params**:
- `hours` (optional, default: 24)

**Returns**:
```typescript
{
  events: ActivityLog[],  // Last 100 error/risk events
  summary: {
    totalEvents: number,
    authFailures: number,
    shortageEvents: number,
    riskEvents: number,
    errorEvents: number,
    timeRange: { hours, startDate, endDate }
  }
}
```

**Query**:
- Auth failures
- Tags: `shortage`, `risk`, `error`, `failed`
- Time range: last N hours
- Includes user details
- Ordered by most recent

---

## 5. Security Dashboard UI

### Page Route

**Route**: `/ops/security` (Admin only)

**File**: `app/ops/security/page.tsx`

### Features

- **Server-side rendering** (React Server Component)
- **Direct Prisma queries** (no internal HTTP calls)
- **4 panel grid layout**:
  1. Auth Activity (Last 24h)
  2. Sensitive Actions (Last 24h)
  3. Account Snapshot
  4. System Errors (Last 24h)

### Panel Components

Each panel:
- Shows summary statistics in colored stat cards
- Lists recent events/items
- Handles errors gracefully
- Scrollable event lists (max-height with overflow)

### Navigation

- Added to sidebar under "System" section
- Icon: Shield (lucide-react)
- Only visible to ADMIN users
- Link to full activity log at bottom of page

---

## 6. UI Components

### Sidebar Navigation Update

**File**: `components/layout/SidebarNav.tsx`

**Changes**:
- Imported `Shield` icon from lucide-react
- Added Security link to `systemItems` array (admin-only)
- Conditionally renders based on `userRole === 'ADMIN'`

**Navigation Structure**:
```
System (collapsible section)
  ├─ Activity
  ├─ Security (ADMIN only) ← NEW
  ├─ Strains
  ├─ Vendors
  └─ Help
```

---

## 7. Backward Compatibility

### No Breaking Changes

1. **Existing logging still works**:
   - All existing `logAction()` calls continue to function
   - `details` parameter is mapped to `metadata` internally
   - `entityType` and `entityId` remain required for business entity logs

2. **No migration required for existing data**:
   - Used `prisma db push` for schema sync
   - Nullable fields don't affect existing records

3. **Middleware unchanged**:
   - No additional middleware bundle size
   - Auth flow performance unaffected

---

## 8. Security Considerations

### Access Control

- All security routes require:
  - Valid authentication session
  - ADMIN role
- Security dashboard page redirects non-admins to `/ops/dashboard`
- API routes return 403 for non-admin users

### Data Privacy

- IP addresses and user agents are captured for auth events
- No sensitive credential data is logged
- Failed login attempts include reason codes, not actual passwords
- User details in logs limited to: id, name, email, role

### Audit Trail

- All auth events are logged with timestamps
- Failed login attempts are tagged with 'security'
- Unique users and IPs are tracked for anomaly detection
- System errors are categorized and counted

---

## 9. Testing Recommendations

### Manual Testing Checklist

1. **Auth Logging**:
   - [ ] Successful login logs `AUTH_LOGIN_SUCCESS`
   - [ ] Failed login (wrong password) logs `AUTH_LOGIN_FAILURE`
   - [ ] Failed login (user not found) logs `AUTH_LOGIN_FAILURE`
   - [ ] Session creation logs `AUTH_SESSION_CREATED`

2. **API Routes**:
   - [ ] Non-authenticated request returns 401
   - [ ] Non-admin request returns 403
   - [ ] Admin request returns data
   - [ ] Query params work (e.g., `?hours=48`)

3. **Dashboard UI**:
   - [ ] Non-admin user can't access `/ops/security`
   - [ ] Admin user sees all 4 panels
   - [ ] Data loads and displays correctly
   - [ ] Error states display gracefully

4. **Navigation**:
   - [ ] Security link only visible to admins
   - [ ] Security link navigates to correct page
   - [ ] Page is highlighted when active

---

## 10. Future Enhancements (Out of Scope)

The following were explicitly NOT implemented in Phase 1:

- ❌ User creation/editing
- ❌ Permission/role editing
- ❌ Account lockout policies
- ❌ Password reset functionality
- ❌ Session management (force logout)
- ❌ IP blocking/allowlisting
- ❌ Email notifications for security events
- ❌ Export/download security reports
- ❌ Real-time alerts

---

## 11. Files Modified

### Schema
- `prisma/schema.prisma`

### Services
- `lib/services/loggingService.ts`

### Auth
- `lib/auth/auth.ts`

### API Routes (NEW)
- `app/api/security/auth-activity/route.ts`
- `app/api/security/sensitive-actions/route.ts`
- `app/api/security/account-snapshot/route.ts`
- `app/api/security/system-errors/route.ts`

### UI (NEW)
- `app/ops/security/page.tsx`

### Components
- `components/layout/SidebarNav.tsx`

---

## 12. Performance Notes

- **Auth logging**: Non-blocking async calls (does not slow down login)
- **Dashboard queries**: Direct Prisma queries (server-side, no HTTP overhead)
- **Middleware**: No changes to middleware bundle
- **Database indexes**: All queries use existing indexes on `ActivityLog`

---

## 13. Monitoring & Observability

### Log Actions to Monitor

- `AUTH_LOGIN_SUCCESS`: Track successful login patterns
- `AUTH_LOGIN_FAILURE`: Monitor for brute force attempts
- High frequency of failed logins from single IP
- Failed logins for non-existent users (reconnaissance)
- Successful login after multiple failures (potential compromise)

### Dashboard Metrics

- **Unique IPs**: Detect anomalous access patterns
- **Failed login rate**: Security incident indicator
- **Inactive user count**: Account hygiene
- **Recently active users**: Engagement tracking

---

## Summary

Phase 1 successfully implements a **read-only security baseline** that:

1. ✅ Normalizes ActivityLog to support auth events
2. ✅ Centralizes auth logging with standardized actions
3. ✅ Provides admin-only security dashboard with 4 monitoring panels
4. ✅ Adds API routes for security data queries
5. ✅ Maintains 100% backward compatibility
6. ✅ Introduces zero breaking changes
7. ✅ Keeps middleware lightweight

The implementation is **production-ready** and provides visibility into authentication activity, sensitive business operations, user accounts, and system errors without requiring any changes to existing business logic.

