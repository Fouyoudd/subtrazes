/**
 * SubTrack Gmail Scanner Backend
 * Node.js/Express backend for Gmail OAuth + subscription receipt detection.
 */

const cors = require("cors");
const express = require("express");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();

app.use(cors({
  origin: [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://localhost:3000",
    "http://localhost:8081"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true
}));

app.use(express.json());

// Config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3001/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

// In-memory token store. This resets every backend restart.
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Subscription service rules
const SUB_SERVICES = [
  {
    id: "spotify",
    name: "Spotify",
    cat: "Music",
    froms: ["noreply@spotify.com", "spotify@"],
    subjects: ["spotify", "spotify premium", "spotify receipt"]
  },
  {
    id: "netflix",
    name: "Netflix",
    cat: "Video",
    froms: ["netflix@"],
    subjects: ["netflix", "netflix receipt", "netflix payment"]
  },
  {
    id: "canva",
    name: "Canva",
    cat: "Design",
    froms: ["noreply@canva.com", "billing@canva.com", "canva@"],
    subjects: ["canva", "canva pro", "canva receipt", "canva payment"]
  },
  {
    id: "capcut",
    name: "CapCut Pro",
    cat: "Video Editing",
    froms: ["noreply@capcut.com", "billing@capcut.com", "capcut@"],
    subjects: ["capcut", "capcut pro", "capcut receipt", "capcut payment"]
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    cat: "Video",
    froms: ["noreply@google.com", "billing@google.com"],
    subjects: ["youtube", "youtube premium"]
  },
  {
    id: "adobe",
    name: "Adobe",
    cat: "Creative",
    froms: ["noreply@adobe.com", "billing@adobe.com"],
    subjects: ["adobe", "adobe payment", "adobe subscription"]
  },
  {
    id: "notion",
    name: "Notion",
    cat: "Productivity",
    froms: ["billing@notion.so", "noreply@notion.so"],
    subjects: ["notion", "notion receipt", "notion payment"]
  },
  {
    id: "duolingo",
    name: "Duolingo Plus",
    cat: "Education",
    froms: ["duolingo@"],
    subjects: ["duolingo", "duolingo payment"]
  },
  {
    id: "disney",
    name: "Disney+",
    cat: "Video",
    froms: ["help@disneyplus.com", "noreply@disneyplus.com"],
    subjects: ["disney", "disney+"]
  },
  {
    id: "hulu",
    name: "Hulu",
    cat: "Video",
    froms: ["hulu@"],
    subjects: ["hulu", "hulu payment", "hulu receipt"]
  },
  {
    id: "icloud",
    name: "iCloud+",
    cat: "Storage",
    froms: ["noreply@apple.com", "billing@apple.com"],
    subjects: ["icloud", "icloud+", "apple"]
  },
  {
    id: "google",
    name: "Google One",
    cat: "Storage",
    froms: ["noreply@google.com", "google-one@"],
    subjects: ["google one", "google storage"]
  },
  {
    id: "microsoft",
    name: "Microsoft 365",
    cat: "Productivity",
    froms: ["microsoft@", "billing@microsoft.com"],
    subjects: ["microsoft 365", "office 365", "microsoft"]
  },
  {
    id: "amazon",
    name: "Amazon Prime",
    cat: "Shopping",
    froms: ["amazon@", "prime@"],
    subjects: ["amazon prime", "amazon payment"]
  },
  {
    id: "figma",
    name: "Figma",
    cat: "Design",
    froms: ["billing@figma.com", "noreply@figma.com"],
    subjects: ["figma", "figma payment"]
  },
  {
    id: "chatgpt",
    name: "ChatGPT Plus",
    cat: "AI Tools",
    froms: ["billing@openai.com", "noreply@openai.com"],
    subjects: ["chatgpt", "openai", "chatgpt plus"]
  },
  {
    id: "github",
    name: "GitHub Pro",
    cat: "Dev Tools",
    froms: ["noreply@github.com", "support@github.com"],
    subjects: ["github", "github pro"]
  },
  {
    id: "dropbox",
    name: "Dropbox Plus",
    cat: "Storage",
    froms: ["dropbox@", "billing@dropbox.com"],
    subjects: ["dropbox", "dropbox payment"]
  },
  {
    id: "slack",
    name: "Slack Pro",
    cat: "Communication",
    froms: ["billing@slack.com", "noreply@slack.com"],
    subjects: ["slack", "slack payment"]
  },
  {
    id: "zoom",
    name: "Zoom Pro",
    cat: "Communication",
    froms: ["noreply@zoom.us", "billing@zoom.us"],
    subjects: ["zoom", "zoom payment"]
  }
];

// Your test sender. Do not add this inside each service froms.
const TEST_SENDERS = ["bot2narido@gmail.com"];

const SERVICE_KEYWORDS = [
  { id: "spotify", words: ["spotify", "spotify premium"] },
  { id: "canva", words: ["canva", "canva pro"] },
  { id: "capcut", words: ["capcut", "capcut pro"] },
  { id: "netflix", words: ["netflix"] },
  { id: "youtube", words: ["youtube premium", "youtube"] },
  { id: "adobe", words: ["adobe"] },
  { id: "chatgpt", words: ["chatgpt", "openai", "chatgpt plus"] },
  { id: "figma", words: ["figma"] },
  { id: "notion", words: ["notion"] },
  { id: "zoom", words: ["zoom", "zoom pro"] },
  { id: "github", words: ["github", "github pro"] },
  { id: "dropbox", words: ["dropbox", "dropbox plus"] },
  { id: "slack", words: ["slack", "slack pro"] },
  { id: "disney", words: ["disney+", "disney plus", "disneyplus"] },
  { id: "hulu", words: ["hulu"] },
  { id: "icloud", words: ["icloud", "icloud+"] },
  { id: "google", words: ["google one", "google storage"] },
  { id: "microsoft", words: ["microsoft 365", "office 365", "microsoft"] },
  { id: "amazon", words: ["amazon prime", "prime video"] },
  { id: "duolingo", words: ["duolingo", "duolingo plus"] }
];

function findServiceFromEmail(from, subject, body) {
  const cleanFrom = String(from || "").toLowerCase();
  const text = `${subject || ""} ${body || ""}`.toLowerCase();

  const isTestSender = TEST_SENDERS.some(sender =>
    cleanFrom.includes(sender.toLowerCase())
  );

  // For fake test emails from bot2narido, detect by subject/body.
  if (isTestSender) {
    const keywordMatch = SERVICE_KEYWORDS.find(service =>
      service.words.some(word => text.includes(word))
    );

    if (!keywordMatch) return null;

    return SUB_SERVICES.find(service => service.id === keywordMatch.id) || null;
  }

  // For real emails, detect by sender first.
  let service = SUB_SERVICES.find(service =>
    service.froms.some(fromRule => {
      const needle = String(fromRule || "").toLowerCase().trim();
      if (!needle) return false;

      return cleanFrom.includes(needle) || cleanFrom.includes(needle.replace("@", ""));
    })
  );

  if (service) return service;

  // Backup: detect by subject/body keywords.
  service = SUB_SERVICES.find(service =>
    (service.subjects || []).some(keyword => {
      const needle = String(keyword || "").toLowerCase().trim();
      return needle && text.includes(needle);
    })
  );

  return service || null;
}

// 1. OAuth: redirect to Google
app.get("/auth/google", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly"
    ]
  });

  res.redirect(authUrl);
});

// 2. OAuth: callback
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    const userId = tokens.id_token ? decodeIdToken(tokens.id_token) : "user";

    const { error: upsertError } = await supabase
  .schema('public')
  .from('gmail_tokens')
  .upsert({ user_id: userId, tokens, updated_at: new Date() });
if (upsertError) {
  console.error("Supabase save error:", upsertError);
} else {
  console.log("Token saved to Supabase for user:", userId);
}

    res.redirect(`http://127.0.0.1:5500/index.html?gmail=connected&user=${userId}#/app/notifications`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 3. Scan Gmail
app.get("/api/scan-gmail/:userId", async (req, res) => {
  const { userId } = req.params;

  const { data } = await supabase.from('gmail_tokens').select('tokens').eq('user_id', userId).single();

if (!data) {
  return res.status(401).json({
    error: "Gmail not connected. Please authorize first."
  });
}

const tokens = data.tokens;

  try {
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client
    });

    const query = buildGmailQuery();

    const messagesResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100
    });

    const messages = messagesResponse.data.messages || [];

    if (messages.length === 0) {
      return res.json({
        detections: [],
        message: "No subscription emails found"
      });
    }

    const fullMessages = await Promise.all(
      messages.slice(0, 50).map(msg =>
        gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full"
        })
      )
    );

    const gmailMessages = fullMessages.map(response => response.data);

    const detections = parseEmailsForSubscriptions(gmailMessages);

    const uniqueDetections = deduplicateByService(detections);

    return res.json({
      detections: uniqueDetections
    });
  } catch (error) {
    console.error("Real Gmail scan error:", error);
    return res.status(500).json({
      error: error.message
    });
  }
});

function buildGmailQuery() {
  const realSenderRules = SUB_SERVICES
    .flatMap(service => service.froms)
    .filter(Boolean)
    .map(from => `from:${from}`);

  const testSenderRules = TEST_SENDERS
    .filter(Boolean)
    .map(from => `from:${from}`);

  const fromQuery = [...realSenderRules, ...testSenderRules].join(" OR ");

  const keywordQuery = [
    "receipt",
    "payment",
    "subscription",
    "renewal",
    "invoice",
    "charged",
    "premium",
    "pro"
  ].join(" OR ");

  return `(${fromQuery}) (${keywordQuery}) newer_than:30d`;
}

function parseEmailsForSubscriptions(messages) {
  return messages
    .map(msg => {
      const headers = (msg.payload.headers || []).reduce((acc, h) => {
        acc[h.name.toLowerCase()] = h.value;
        return acc;
      }, {});

      const body = getBodyText(msg.payload);
      const from = String(headers.from || "").toLowerCase();
      const subject = String(headers.subject || "").toLowerCase();
      const date = new Date(headers.date || Date.now());

      const service = findServiceFromEmail(from, subject, body);

      if (!service) return null;

      const amount = extractAmount(body);
      const billingDate = extractBillingDate(body);
      const cycle = extractCycle(body);

      return {
        service: service.id,
        serviceName: service.name,
        category: service.cat,
        amount,
        billingDate,
        cycle,
        emailDate: date,
        from,
        subject
      };
    })
    .filter(Boolean);
}

function deduplicateByService(detections) {
  const map = new Map();

  const sorted = [...detections].sort((a, b) => {
    return new Date(b.emailDate).getTime() - new Date(a.emailDate).getTime();
  });

  sorted.forEach(detection => {
    if (!map.has(detection.service)) {
      map.set(detection.service, detection);
    }
  });

  return Array.from(map.values());
}

function getBodyText(payload) {
  let text = "";

  function readPart(part) {
    if (!part) return;

    if (part.mimeType === "text/plain" && part.body && part.body.data) {
      text += Buffer.from(part.body.data, "base64").toString("utf8");
    }

    if (part.mimeType === "text/html" && part.body && part.body.data && !text) {
      text += Buffer.from(part.body.data, "base64")
        .toString("utf8")
        .replace(/<[^>]*>/g, " ");
    }

    if (Array.isArray(part.parts)) {
      part.parts.forEach(readPart);
    }
  }

  readPart(payload);

  return text;
}

function extractAmount(text) {
  const cleanText = String(text || "");

  const patterns = [
    /(?:total|amount|charged|price|cost|payment|paid)[\s:]*\$?\s*([0-9]+(?:\.[0-9]{2})?)/i,
    /\$\s*([0-9]+(?:\.[0-9]{2})?)/i,
    /₱\s*([0-9,]+(?:\.[0-9]{2})?)/i
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) return match[1].replace(/,/g, "");
  }

  return null;
}

function extractBillingDate(text) {
  const cleanText = String(text || "");

  const patterns = [
    /(?:next billing date|next billing|renewal date|renews on|due date|charged on)[\s:]*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /([A-Za-z]+\s+\d{1,2},\s+\d{4})/
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

function extractCycle(text) {
  const cleanText = String(text || "");

  if (/annual|yearly|per year|\/year/i.test(cleanText)) return "annual";
  if (/monthly|per month|\/month/i.test(cleanText)) return "monthly";

  return "monthly";
}

function decodeIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return "user";

  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
  return payload.sub || "user";
}

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Gmail backend running on http://localhost:${PORT}`);
  console.log(`OAuth callback: ${REDIRECT_URI}`);
  console.log(`Google Client ID loaded: ${!!GOOGLE_CLIENT_ID}`);
  console.log(`Google Client Secret loaded: ${!!GOOGLE_CLIENT_SECRET}`);
});