# Vercel Environment Variable Setup

## Required Environment Variables

Set these in your Vercel project dashboard under **Settings → Environment Variables**:

### 1. DATABASE_URL
- **Value**: Your PostgreSQL connection string from Railway/Neon/etc
- **Example**: `postgresql://user:password@host:5432/dbname`
- **Environments**: Production, Preview

### 2. AUTH_SECRET
- **Value**: Random secret for NextAuth (generate with `openssl rand -base64 32`)
- **Example**: `yagfHSlaueImua3Uz4GMqZ1H2Zh4VHJm0Ip1xqyhyNg=`
- **Environments**: Production, Preview

### 3. NEXT_PUBLIC_APP_URL ⚠️ IMPORTANT FOR QR CODES
- **Value**: Your production domain
- **Production**: `https://ops.originalpsilly.com`
- **Preview**: `https://ops.originalpsilly.com` (or leave blank for preview URLs)
- **Environments**: Production

## How to Set Environment Variables in Vercel

1. Go to https://vercel.com
2. Select your **PsillyOps** project
3. Click **Settings** (top navigation)
4. Click **Environment Variables** (left sidebar)
5. For each variable:
   - Click **Add New**
   - Enter **Name** (e.g., `NEXT_PUBLIC_APP_URL`)
   - Enter **Value** (e.g., `https://ops.originalpsilly.com`)
   - Select **Environments** (check Production)
   - Click **Save**

## After Adding Environment Variables

**You MUST redeploy** for changes to take effect:

1. Go to **Deployments** tab
2. Find your latest deployment
3. Click the three dots (⋯) menu
4. Select **Redeploy**
5. Wait for deployment to complete

## QR Code URL Fix

If QR codes are pointing to `localhost:3000` instead of your production domain:

✅ **Solution**: Set `NEXT_PUBLIC_APP_URL=https://ops.originalpsilly.com` in Vercel
✅ **Then**: Redeploy the application
✅ **Result**: All newly generated QR codes will use the production URL

## Troubleshooting

**Q: QR codes still show localhost after setting the variable**
- A: Make sure you **redeployed** after adding the variable
- A: Check that the variable is set for the **Production** environment

**Q: Can I have different URLs for preview vs production?**
- A: Yes! Set the variable separately for Production and Preview environments

**Q: Do I commit .env files?**
- A: **NO** - Never commit `.env` files. They contain secrets and are in `.gitignore`

