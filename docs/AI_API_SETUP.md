# AI API Setup Guide

## Required Environment Variables

Add these to your `.env` file:

```bash
# AI API Authentication
AI_API_KEY=******
AI_API_USER_ID=*****

# AI Configuration (Optional - these have defaults)
AI_PROPOSAL_TTL_MINUTES=15
AI_SESSION_TTL_HOURS=24
AI_CONTEXT_STALE_SECONDS=60
AI_MAX_PHASE=1

# Public App URL (Required for OpenAPI schema)
NEXT_PUBLIC_APP_URL="https://ops.originalpsilly.com"
```

## Setup Steps

### 1. Generate an API Key

```bash
# Generate a secure random API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Find Your Admin User ID

```sql
-- Connect to your database and run:
SELECT id, email, role FROM "User" WHERE role = 'ADMIN' LIMIT 1;
```

### 3. Add to `.env`

```bash
AI_API_KEY="your-generated-key-from-step-1"
AI_API_USER_ID="user-id-from-step-2"
```

### 4. Restart Your Dev Server

```bash
npm run dev
```

## ChatGPT Custom GPT Integration

### 1. Get the OpenAPI Schema

Your API schema is available at:
```
https://ops.originalpsilly.com/api/ai/openapi.json
```

### 2. Create Custom GPT

1. Go to https://chat.openai.com/gpts/editor
2. Click "Create" → "Configure"
3. In "Actions" section:
   - Click "Create new action"
   - Import from URL: `https://ops.originalpsilly.com/api/ai/openapi.json`
4. In "Authentication" section:
   - Select "API Key"
   - Auth Type: "Bearer"
   - API Key: Paste your `AI_API_KEY` from `.env`

### 3. Test

Ask your Custom GPT:
```
Get the current system context
```

It should return system state including products, materials, and inventory levels.

## Phase 1 Capabilities

The AI can **execute** these actions:
- ✅ Inventory adjustments
- ✅ Purchase order submission
- ✅ Sending vendor purchase-order emails

All other actions are **preview-only** until Phase 2 approval.

## Security Notes

- The API key grants full admin access - **keep it secret**
- All AI actions are logged to `ActivityLog` with `ai_execution` tag
- Proposals expire after 15 minutes (configurable via `AI_PROPOSAL_TTL_MINUTES`)
- Session tokens expire after 24 hours (configurable via `AI_SESSION_TTL_HOURS`)
- Phase gate is enforced server-side via `AI_MAX_PHASE` environment variable

## Troubleshooting

### 401 Unauthorized
- Verify `AI_API_KEY` is set in `.env`
- Verify the key matches what you configured in ChatGPT
- Restart your server after changing `.env`

### User Not Found
- Verify `AI_API_USER_ID` exists in your database
- Check the user has `ADMIN` role
- User must have `ai.command` permission

### Phase 2 Actions Blocked
- This is expected - Phase 1 only allows inventory, PO, and email actions
- To unlock Phase 2, set `AI_MAX_PHASE=2` (requires explicit approval)

