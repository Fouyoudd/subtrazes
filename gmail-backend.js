/**
SubTrack Gmail Scanner Backend
*/
const webpush = require('web-push');
webpush.setVapidDetails(process.env.VAPID_EMAIL, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
const cors = require("cors");
const express = require("express");
const { google } = require("googleapis");
require("dotenv").config();
const app = express();

app.use(cors({
  origin: ["https://subtrack.surge.sh", "http://127.0.0.1:5500", "http://localhost:5500", "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));
app.use(express.json());

// ✅ Initialize OAuth2Client FIRST (fixes startup crash)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3001/auth/google/callback";
const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const SUB_SERVICES = [
  { id: "spotify", name: "Spotify", cat: "Music", froms: ["noreply@spotify.com", "spotify@"], subjects: ["spotify", "spotify premium", "spotify receipt"] },
  { id: "netflix", name: "Netflix", cat: "Video", froms: ["netflix@"], subjects: ["netflix", "netflix receipt", "netflix payment"] },
  { id: "canva", name: "Canva", cat: "Design", froms: ["noreply@canva.com", "billing@canva.com", "canva@"], subjects: ["canva", "canva pro", "canva receipt", "canva payment"] },
  { id: "capcut", name: "CapCut Pro", cat: "Video Editing", froms: ["noreply@capcut.com", "billing@capcut.com", "capcut@"], subjects: ["capcut", "capcut pro", "capcut receipt", "capcut payment"] },
  { id: "youtube", name: "YouTube Premium", cat: "Video", froms: ["noreply@google.com", "billing@google.com"], subjects: ["youtube", "youtube premium"] },
  { id: "adobe", name: "Adobe", cat: "Creative", froms: ["noreply@adobe.com", "billing@adobe.com"], subjects: ["adobe", "adobe payment", "adobe subscription"] },
  { id: "notion", name: "Notion", cat: "Productivity", froms: ["billing@notion.so", "noreply@notion.so"], subjects: ["notion", "notion receipt", "notion payment"] },
  { id: "duolingo", name: "Duolingo Plus", cat: "Education", froms: ["duolingo@"], subjects: ["duolingo", "duolingo payment"] },
  { id: "disney", name: "Disney+", cat: "Video", froms: ["help@disneyplus.com", "noreply@disneyplus.com"], subjects: ["disney", "disney+"] },
  { id: "hulu", name: "Hulu", cat: "Video", froms: ["hulu@"], subjects: ["hulu", "hulu payment", "hulu receipt"] },
  { id: "icloud", name: "iCloud+", cat: "Storage", froms: ["noreply@apple.com", "billing@apple.com"], subjects: ["icloud", "icloud+", "apple"] },
  { id: "google", name: "Google One", cat: "Storage", froms: ["noreply@google.com", "google-one@"], subjects: ["google one", "google storage"] },
  { id: "microsoft", name: "Microsoft 365", cat: "Productivity", froms: ["microsoft@", "billing@microsoft.com"], subjects: ["microsoft 365", "office 365", "microsoft"] },
  { id: "amazon", name: "Amazon Prime", cat: "Shopping", froms: ["amazon@", "prime@"], subjects: ["amazon prime", "amazon payment"] },
  { id: "figma", name: "Figma", cat: "Design", froms: ["billing@figma.com", "noreply@figma.com"], subjects: ["figma", "figma payment"] },
  { id: "chatgpt", name: "ChatGPT Plus", cat: "AI Tools", froms: ["billing@openai.com", "noreply@openai.com"], subjects: ["chatgpt", "openai", "chatgpt plus"] },
  { id: "github", name: "GitHub Pro", cat: "Dev Tools", froms: ["noreply@github.com", "support@github.com"], subjects: ["github", "github pro"] },
  { id: "dropbox", name: "Dropbox Plus", cat: "Storage", froms: ["dropbox@", "billing@dropbox.com"], subjects: ["dropbox", "dropbox payment"] },
  { id: "slack", name: "Slack Pro", cat: "Communication", froms: ["billing@slack.com", "noreply@slack.com"], subjects: ["slack", "slack payment"] },
  { id: "zoom", name: "Zoom Pro", cat: "Communication", froms: ["noreply@zoom.us", "billing@zoom.us"], subjects: ["zoom", "zoom payment"] }
];

const TEST_SENDERS = ["bot2narido@gmail.com"];
const SERVICE_KEYWORDS = [
  { id: "spotify", words: ["spotify", "spotify premium"] }, { id: "canva", words: ["canva", "canva pro"] },
  { id: "capcut", words: ["capcut", "capcut pro"] }, { id: "netflix", words: ["netflix"] },
  { id: "youtube", words: ["youtube premium", "youtube"] }, { id: "adobe", words: ["adobe"] },
  { id: "chatgpt", words: ["chatgpt", "openai", "chatgpt plus"] }, { id: "figma", words: ["figma"] },
  { id: "notion", words: ["notion"] }, { id: "zoom", words: ["zoom", "zoom pro"] },
  { id: "github", words: ["github", "github pro"] }, { id: "dropbox", words: ["dropbox", "dropbox plus"] },
  { id: "slack", words: ["slack", "slack pro"] }, { id: "disney", words: ["disney+", "disney plus", "disneyplus"] },
  { id: "hulu", words: ["hulu"] }, { id: "icloud", words: ["icloud", "icloud+"] },
  { id: "google", words: ["google one", "google storage"] }, { id: "microsoft", words: ["microsoft 365", "office 365", "microsoft"] },
  { id: "amazon", words: ["amazon prime", "prime video"] }, { id: "duolingo", words: ["duolingo", "duolingo plus"] }
];

function findServiceFromEmail(from, subject, body) {
  const cleanFrom = String(from || "").toLowerCase();
  const text = `${subject || ""} ${body || ""}`.toLowerCase();
  const isTestSender = TEST_SENDERS.some(sender => cleanFrom.includes(sender.toLowerCase()));
  if (isTestSender) {
    const kw = SERVICE_KEYWORDS.find(s => s.words.some(w => text.includes(w)));
    return kw ? SUB_SERVICES.find(s => s.id === kw.id) || null : null;
  }
  let service = SUB_SERVICES.find(s => s.froms.some(r => cleanFrom.includes(String(r || "").toLowerCase().trim())));
  if (service) return service;
  return SUB_SERVICES.find(s => (s.subjects || []).some(k => text.includes(String(k || "").toLowerCase().trim()))) || null;
}

function getBodyText(payload) {
  let text = "";
  function readPart(part) {
    if (!part) return;
    // ✅ Fixed & & -> &&
    if (part.mimeType === "text/plain" && part.body && part.body.data) text += Buffer.from(part.body.data, "base64").toString("utf8");
    if (part.mimeType === "text/html" && part.body && part.body.data && !text) text += Buffer.from(part.body.data, "base64").toString("utf8").replace(/<[^>]*>/g, " ");
    if (Array.isArray(part.parts)) part.parts.forEach(readPart);
  }
  readPart(payload);
  return text;
}

// ✅ Fixed regex for decimals & currencies
function extractAmount(text) {
  const clean = String(text || "");
  const patterns = [
    /(?:total|amount|charged|price|cost|payment|paid)[\s:]*[₱$€£]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /[₱$€£]\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i,
    /(?:USD|EUR|GBP|PHP)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i
  ];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m) return m[1].replace(/,/g, "");
  }
  return null;
}

function extractBillingDate(text) {
  const m = String(text || "").match(/(?:next billing date|next billing|renewal date|renews on|due date|charged on)[\s:]*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  return m ? m[1].trim() : null;
}

function extractCycle(text) { return /annual|yearly|per year/i.test(text) ? "annual" : "monthly"; }
function decodeIdToken(token) { try { return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).sub || "user"; } catch { return "user"; } }
function buildGmailQuery() {
  const fromQ = [...SUB_SERVICES.flatMap(s => s.froms).filter(Boolean).map(f => `from:${f}`), ...TEST_SENDERS.map(f => `from:${f}`)].join(" OR ");
  const kwQ = ["receipt", "payment", "subscription", "renewal", "invoice", "charged", "premium", "pro"].join(" OR ");
  return `(${fromQ}) (${kwQ}) newer_than:30d`;
}

function parseEmailsForSubscriptions(messages) {
  return messages.map(msg => {
    const headers = (msg.payload.headers || []).reduce((a, h) => ({ ...a, [h.name.toLowerCase()]: h.value }), {});
    const body = getBodyText(msg.payload);
    const service = findServiceFromEmail(headers.from, headers.subject, body);
    if (!service) return null;
    return { service: service.id, serviceName: service.name, category: service.cat, amount: extractAmount(body), billingDate: extractBillingDate(body), cycle: extractCycle(body), emailDate: new Date(headers.date || Date.now()), from: headers.from, subject: headers.subject };
  }).filter(Boolean);
}

function deduplicateByService(detections) {
  const map = new Map();
  [...detections].sort((a, b) => new Date(b.emailDate) - new Date(a.emailDate)).forEach(d => { if (!map.has(d.service)) map.set(d.service, d); });
  return Array.from(map.values());
}

app.get("/auth/google", (req, res) => res.redirect(oauth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly"] })));

app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");
  try {
    const { tokens } = await oauth2Client.getToken(code);
    const userId = decodeIdToken(tokens.id_token);
    await supabase.from('gmail_tokens').upsert({ user_id: userId, tokens, updated_at: new Date() });

    // ✅ Register instant webhook AFTER tokens exist
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    await gmail.users.watch({
      userId: 'me',
      requestBody: { topicName: 'projects/subcheck-detector/topics/gmail-notifications', labelIds: ['INBOX'] }
    }).catch(err => console.warn("Pub/Sub watch failed (ensure GCP topic exists):", err.message));

    res.redirect(`https://subtrack.surge.sh/index.html?gmail=connected&user=${userId}#/app/notifications`);
  } catch (e) { console.error("OAuth error:", e); res.status(500).json({ error: e.message }); }
});

app.get("/api/scan-gmail/:userId", async (req, res) => {
  const { userId } = req.params;
  const { data } = await supabase.from('gmail_tokens').select('tokens').eq('user_id', userId).single();
  if (!data) return res.status(401).json({ error: "Not connected" });
  try {
    oauth2Client.setCredentials(data.tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const { data: msgRes } = await gmail.users.messages.list({ userId: "me", q: buildGmailQuery(), maxResults: 50 });
    const messages = msgRes?.messages || [];
    if (!messages.length) return res.json({ detections: [], message: "None found" });
    const full = await Promise.all(messages.map(m => gmail.users.messages.get({ userId: "me", id: m.id, format: "full" })));
    return res.json({ detections: deduplicateByService(parseEmailsForSubscriptions(full.map(r => r.data))) });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.post('/api/push/subscribe', async (req, res) => {
  const { subscription, userId } = req.body;
  if (!subscription || !userId) return res.status(400).json({ error: 'Missing data' });
  const { error } = await supabase.from('push_subscriptions').upsert({ user_id: userId, subscription: JSON.stringify(subscription), updated_at: new Date() });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/push/send-test', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  const { data } = await supabase.from('push_subscriptions').select('subscription').eq('user_id', userId).single();
  if (!data) return res.status(404).json({ error: 'No subscription' });
  try {
    await webpush.sendNotification(JSON.parse(data.subscription), JSON.stringify({ title: 'SubTracks 🔔', body: 'Test push', data: { service: 'Test', amount: '9.99', date: 'Next Month' } }));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gmail/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const { data: users } = await supabase.from('gmail_tokens').select('user_id');
    if (!users?.length) return;
    for (const u of users) await scanAndNotifyUser(u.user_id);
  } catch (e) { console.error('Webhook error:', e); }
});

const schedule = require('node-schedule');
schedule.scheduleJob('*/5 * * * *', async function() {
  try {
    const { data: users } = await supabase.from('gmail_tokens').select('user_id');
    if (!users?.length) return;
    for (const u of users) await scanAndNotifyUser(u.user_id);
  } catch (e) { console.error('Scheduler error:', e); }
});

async function scanAndNotifyUser(userId) {
  try {
    const { data: pushData } = await supabase.from('push_subscriptions').select('subscription').eq('user_id', userId).single();
    if (!pushData) return;
    const { data: tokenData } = await supabase.from('gmail_tokens').select('tokens').eq('user_id', userId).single();
    if (!tokenData) return;

    oauth2Client.setCredentials(tokenData.tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const { data: msgRes } = await gmail.users.messages.list({ userId: 'me', q: buildGmailQuery(), maxResults: 10 });
    const messages = msgRes?.messages || [];
    if (!messages.length) return;

    const newMsgs = [];
    for (const msg of messages.slice(0, 5)) {
      const key = `${userId}_${msg.id}`;
      const { data: existing } = await supabase.from('notified_emails').select('id').eq('id', key).single();
      if (!existing) { newMsgs.push(msg); await supabase.from('notified_emails').insert({ id: key, user_id: userId }); }
    }
    if (!newMsgs.length) return;

    const full = await Promise.all(newMsgs.map(m => gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })));
    const detections = deduplicateByService(parseEmailsForSubscriptions(full.map(r => r.data)));
    if (!detections.length) return;

    for (const d of detections) {
      // ✅ Payload now includes auto-fill data
      await webpush.sendNotification(JSON.parse(pushData.subscription), JSON.stringify({
        title: `SubTracks — ${d.serviceName} detected 📬`,
        body: `Amount: ${d.amount || 'N/A'} • Tap to add`,
        data: { service: d.serviceName, amount: d.amount, date: d.billingDate }
      }));
    }
  } catch (e) { console.error('Notify error:', e.message); }
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));