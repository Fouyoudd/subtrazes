# SubChecks Gmail Backend Setup

## What this does

1. **User connects Gmail** → OAuth redirect
2. **Backend scans Gmail inbox** → finds receipt emails from Spotify, Netflix, Canva, etc.
3. **Detector shows notification** → with auto-filled subscription data from Gmail
4. **User confirms and adds** → subscriptions populate SubChecks

---

## Setup Steps

### 1. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **Gmail API**:
   - Search "Gmail API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to **Credentials** → **Create Credentials** → **OAuth client ID**
   - Choose **Web application**
   - Add authorized redirect URI:
     ```
     http://localhost:3001/auth/google/callback
     ```
   - Copy **Client ID** and **Client Secret**

### 2. Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   ```env
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   REDIRECT_URI=http://localhost:3001/auth/google/callback
   PORT=3001
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Backend

```bash
npm start
```

The backend will run on `http://localhost:3001`

---

## How it Works

### Detection Flow

1. User visits Spotify/Netflix/Canva checkout page
2. Completes purchase
3. Redirected to success page
4. `subcheck-detector.js` detects success page
5. Shows notification: **"Payment detected"**
6. User taps **"✅ Add Subscription"**
7. Backend scans Gmail for recent receipts from **that date** (all services)
8. Returns most recent email per service (no duplicates)
9. Redirects to SubChecks with auto-filled data

### What Gets Parsed from Emails

- **Service name** (Spotify, Netflix, etc.)
- **Amount** ($9.99, $15.99, etc.)
- **Billing date** (next charge date)
- **Cycle** (monthly, annual, etc.)
- **Category** (Music, Video, Design, etc.)

---

## Supported Services

- Spotify, Netflix, Canva, YouTube Premium, Adobe, Notion, Duolingo
- Disney+, Hulu, iCloud+, Google One, Microsoft 365, Amazon Prime
- Figma, ChatGPT Plus, GitHub Pro, Dropbox, Slack, Zoom

Add more by updating `SUB_SERVICES` array in `gmail-backend.js`

---

## Deduplication Logic

If a user has multiple Spotify emails, **only the newest one** is shown:
- Email 1: Charged $11.99 on May 5
- Email 2: Charged $11.99 on May 8 ← **Only this one**
- Email 3: Charged $11.99 on May 1

This ensures no duplicate subscriptions.

---

## Frontend Integration

The detector passes detected subscriptions to SubChecks like:

```json
{
  "serviceName": "Spotify",
  "amount": "11.99",
  "billingDate": "Jun 8, 2026",
  "cycle": "monthly",
  "category": "Music"
}
```

Your SubChecks add-subscription form will receive this in the URL query:
```
?subscriptions=[{...}]&auto=1&source=spotify.com
```

---

## Troubleshooting

### "Gmail not connected"
- User hasn't authorized yet
- Add a "Connect Gmail" button that redirects to `/auth/google`

### "No subscription emails found"
- Check email sender addresses in `SUB_SERVICES`
- Adjust Gmail query patterns if needed

### Gmail API errors
- Verify scopes are correct
- Check token refresh logic
- Ensure `GOOGLE_CLIENT_SECRET` is never exposed client-side

---

## Production Notes

- Use a **database** instead of `tokenStore` (in-memory)
- Store refresh tokens securely (encrypted)
- Never expose `GOOGLE_CLIENT_SECRET` to frontend
- Add rate limiting
- Use HTTPS for OAuth redirect in production

