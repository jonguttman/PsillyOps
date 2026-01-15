# TripDAR Public Token System

Server-side implementation for the Tripd.ar public QR system.

## Overview

This module provides:
- Short Base62 token generation and validation
- API endpoints for Tripd.ar to call on scan
- Public-safe payload transformation (no internal IDs exposed)

## Environment Variables

### Required

```bash
# API key for Tripd.ar server-to-server authentication
# Generate with: openssl rand -base64 32
TRIPDAR_API_KEY=your-secret-key-here
```

This key must be:
- Set in Ops (Vercel env vars)
- Set in Tripd.ar (to send in X-Tripdar-Key header)
- Rotated quarterly for security

## API Endpoints

### GET /api/tripdar/lookup/{publicToken}

Called by Tripd.ar on every QR scan.

**Headers:**
```
X-Tripdar-Key: <TRIPDAR_API_KEY>
```

**Response (200):**
```json
{
  "status": "ACTIVE",
  "verification": {
    "authentic": true,
    "message": "Verified TripDAR Participant"
  },
  "product": {
    "name": "Product Name",
    "sku": "SKU-123",
    "batchCode": "BATCH-001",
    "productionDate": "2024-12-15"
  },
  "partner": {
    "name": "Partner Name",
    "verified": true
  },
  "transparency": {
    "available": true,
    "summary": "Product information available",
    "detailsUrl": null
  },
  "survey": {
    "enabled": true,
    "experienceMode": "MACRO",
    "alreadySubmitted": false
  }
}
```

**Error Responses:**
- 401: Invalid API key
- 404: Token not found
- 410: Token revoked or expired

### POST /api/tripdar/survey/{publicToken}

Called when user submits experience survey.

**Headers:**
```
X-Tripdar-Key: <TRIPDAR_API_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "experienceMode": "MACRO",
  "responses": {
    "intensity": 7,
    "duration": 4,
    "clarity": 8
  },
  "deviceFingerprint": "optional-hash"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Thank you for contributing",
  "comparison": {
    "totalResponses": 1
  }
}
```

**Error Responses:**
- 400: Invalid payload
- 401: Invalid API key
- 404: Token not found
- 410: Token revoked or expired
- 429: Survey already submitted

## Database Models

### TripdarToken

Stores public tokens and their bindings.

| Field | Type | Description |
|-------|------|-------------|
| id | cuid | Internal ID (never exposed) |
| publicToken | string | Short Base62 token (5-6 chars) |
| status | enum | UNBOUND, ACTIVE, REVOKED, EXPIRED |
| partnerId | string? | Bound partner |
| productId | string? | Bound product |
| batchId | string? | Bound batch |
| scanCount | int | Total scans |

### TripdarSurveyResponse

Stores survey submissions.

| Field | Type | Description |
|-------|------|-------------|
| publicToken | string | Token that was scanned |
| experienceMode | string? | MICRO or MACRO |
| responses | json | Survey answers |
| fingerprint | string? | Device fingerprint |
| ipHash | string? | Hashed IP (privacy) |

## Token Generation

Tokens are Base62 (0-9, a-z, A-Z), case-sensitive, 5-6 characters.

```typescript
import { generateUniqueToken } from '@/lib/tripdar/token';

const token = await generateUniqueToken(
  async (t) => {
    const exists = await prisma.tripdarToken.findUnique({
      where: { publicToken: t }
    });
    return Boolean(exists);
  }
);
// Returns: "f9Qa5" or similar
```

## Security Notes

1. **No internal IDs** - Public payloads never contain cuid/uuid
2. **Constant-time key comparison** - Prevents timing attacks
3. **IP hashing** - Raw IPs never stored
4. **1 survey per token** - Enforced at database level
5. **Rate limiting** - Enforced by Tripd.ar, not Ops

