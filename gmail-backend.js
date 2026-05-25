/**
 * Subtraz Gmail Scanner Backend
 * Node.js/Express backend for Gmail OAuth + subscription receipt detection.
 */
require("dotenv").config();

const webpush = require("web-push");
const crypto = require("crypto");
const cors = require("cors");
const express = require("express");
const { google } = require("googleapis");
const { Resend } = require("resend");

const hasVapidConfig =
  !!process.env.VAPID_EMAIL &&
  !!process.env.VAPID_PUBLIC_KEY &&
  !!process.env.VAPID_PRIVATE_KEY;

if (hasVapidConfig) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  console.log("Web push VAPID config loaded.");
} else {
  console.log("Web push VAPID config missing. Push sending is disabled for this local test.");
}

const app = express();

const allowedWebOrigins = new Set([
  "https://subtraz.top",
  "https://www.subtraz.top",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://localhost:3000",
  "http://localhost:8081"
]);

app.use(cors({
  origin: function (origin, callback) {
    const isAllowedWebOrigin = !origin || allowedWebOrigins.has(origin);
    const isTestingChromeExtension =
      typeof origin === "string" &&
      origin.startsWith("chrome-extension://");

    if (isAllowedWebOrigin || isTestingChromeExtension) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Subtraz-Extension-Token"
  ],
  credentials: true
}));

app.use(express.json({
  limit: "2mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

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
const resend = new Resend(process.env.RESEND_API_KEY);
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Subtraz <alerts@mail.subtraz.top>";

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
  const platform = req.query.platform === "android" ? "android" : "web";

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  state: platform,
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
  const { code, state } = req.query;
  const oauthState = String(state || "");

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    const googleUserId = tokens.id_token
      ? decodeIdToken(tokens.id_token)
      : "user";

    let gmailEmail = null;

    if (tokens.id_token) {
      try {
        const parts = tokens.id_token.split(".");
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString()
        );

        gmailEmail = payload.email || null;
      } catch (_) {}
    }

    /*
      New secure Subtraz flow:
      state contains a one-time server-verified connection record.
    */
    if (oauthState.startsWith("subtraz:")) {
      const stateHash = hashGmailConnectState(oauthState);

      const { data: connectState, error: stateLookupError } = await supabase
        .from("gmail_connect_states")
        .select("state_hash, user_id, platform, return_origin, expires_at, used_at")
        .eq("state_hash", stateHash)
        .maybeSingle();

      if (stateLookupError || !connectState) {
        return res.status(400).send("Invalid Gmail connection request.");
      }

      if (connectState.used_at) {
        return res.status(400).send("This Gmail connection request has already been used.");
      }

      if (new Date(connectState.expires_at).getTime() < Date.now()) {
        return res.status(400).send("This Gmail connection request has expired. Please try again.");
      }

      const usedAt = new Date().toISOString();

      const { data: consumedState, error: consumeStateError } = await supabase
        .from("gmail_connect_states")
        .update({
          used_at: usedAt
        })
        .eq("state_hash", stateHash)
        .is("used_at", null)
        .select("state_hash")
        .maybeSingle();

      if (consumeStateError || !consumedState) {
        return res.status(400).send("This Gmail connection request was already completed.");
      }

      const { error: tokenSaveError } = await supabase
        .from("gmail_tokens")
        .upsert({
          user_id: googleUserId,
          subtraz_user_id: connectState.user_id,
          tokens,
          gmail_email: gmailEmail,
          updated_at: new Date().toISOString()
        });

      if (tokenSaveError) {
        console.error("Secure Gmail token save error:", tokenSaveError.message);

        return res.status(500).send("Could not save Gmail connection.");
      }

      console.log("Secure Gmail connection saved:", {
        googleUserId,
        subtrazUserId: connectState.user_id,
        gmailEmail,
        platform: connectState.platform
      });

      if (connectState.platform === "android") {
        return res.redirect(
          `com.subtraz.app://auth-callback?gmail=connected&user=${encodeURIComponent(googleUserId)}`
        );
      }

      const returnOrigin = getSafeGmailReturnOrigin(connectState.return_origin);

      return res.redirect(
        `${returnOrigin}/index.html?gmail=connected&user=${encodeURIComponent(googleUserId)}#/app/receiptAutoFill`
      );
    }

    /*
      Old flow kept temporarily so your existing app does not break
      before the website Gmail button is moved to the secure route.
    */
    const { error: oldFlowSaveError } = await supabase
      .from("gmail_tokens")
      .upsert({
        user_id: googleUserId,
        tokens,
        gmail_email: gmailEmail,
        updated_at: new Date().toISOString()
      });

    if (oldFlowSaveError) {
      console.error("Legacy Gmail token save error:", oldFlowSaveError.message);

      return res.status(500).send("Could not save Gmail connection.");
    }

    const legacyRedirectUrl =
      oauthState === "android"
        ? `com.subtraz.app://auth-callback?gmail=connected&user=${encodeURIComponent(googleUserId)}`
        : `https://subtraz.top/index.html?gmail=connected&user=${encodeURIComponent(googleUserId)}#/app/receiptAutoFill`;

    return res.redirect(legacyRedirectUrl);
  } catch (error) {
    console.error("OAuth callback error:", error.message);

    return res.status(500).json({
      error: error.message
    });
  }
});

// 3. Scan Gmail
app.get("/api/scan-gmail/:userId", localTestOnly, async (req, res) => {
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
      const cycle = extractCycle(body);
      const purchaseDate = extractPurchaseDate(body) || date;

      const billingDate =
        extractBillingDate(body) ||
        getNextBillingDateFromReceipt(purchaseDate, cycle);

      return {
  gmailMessageId: msg.id || null,
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

function dateForInput(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function extractBillingDate(text) {
  const cleanText = String(text || "");

  const patterns = [
    /(?:next billing date|next billing|renewal date|renews on|next charge date|next charge|next payment date|next payment)[\s:]*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /(?:next billing date|next billing|renewal date|renews on|next charge date|next charge|next payment date|next payment)[\s:]*(\d{4}-\d{2}-\d{2})/i
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern);

    if (match) {
      return dateForInput(match[1]);
    }
  }

  return null;
}

function extractPurchaseDate(text) {
  const cleanText = String(text || "");

  const patterns = [
    /(?:charged on|payment date|purchase date|paid on|receipt date)[\s:]*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i,
    /(?:charged on|payment date|purchase date|paid on|receipt date)[\s:]*(\d{4}-\d{2}-\d{2})/i
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern);

    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function extractCycle(text) {
  const cleanText = String(text || "");

  if (/annual|yearly|per year|\/year/i.test(cleanText)) return "annual";
  if (/monthly|per month|\/month/i.test(cleanText)) return "monthly";

  return "monthly";
}

function getNextBillingDateFromReceipt(value, cycle) {
  const source = new Date(value);

  if (Number.isNaN(source.getTime())) {
    return null;
  }

  const sourceYear = source.getFullYear();
  const sourceMonth = source.getMonth();
  const sourceDay = source.getDate();

  const targetYear =
    cycle === "annual"
      ? sourceYear + 1
      : sourceYear;

  const targetMonth =
    cycle === "annual"
      ? sourceMonth
      : sourceMonth + 1;

  const finalDayOfTargetMonth =
    new Date(targetYear, targetMonth + 1, 0).getDate();

  const targetDay = Math.min(sourceDay, finalDayOfTargetMonth);

  return dateForInput(
    new Date(targetYear, targetMonth, targetDay)
  );
}

function decodeIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return "user";

  const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
  return payload.sub || "user";
}

/* =========================================================
   Subtraz Chrome Extension Pairing
   Website creates a short code.
   Extension claims the code and receives its own token.
   ========================================================= */

function hashExtensionValue(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function makeExtensionPairCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function readBearerToken(req) {
  const header = String(req.get("Authorization") || "").trim();

  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return header.slice(7).trim();
}

async function requireSubtrazAccount(req, res) {
  const accessToken = readBearerToken(req);

  if (!accessToken) {
    res.status(401).json({
      ok: false,
      error: "Missing Subtraz login token"
    });
    return null;
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  const user = data?.user || null;

  if (error || !user) {
    res.status(401).json({
      ok: false,
      error: "Invalid or expired Subtraz login"
    });
    return null;
  }

  return user;
}

function localTestOnly(req, res, next) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({
      ok: false,
      error: "Not found."
    });
  }

  next();
}

/* =========================================================
   Secure Gmail connection start
   Connects Gmail access to the signed-in Subtraz account.
   ========================================================= */

function hashGmailConnectState(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

app.get("/api/gmail/connect/health", (req, res) => {
  res.json({
    ok: true,
    route: "secure gmail connection ready"
  });
});

function getSafeGmailReturnOrigin(value) {
  const allowedOrigins = new Set([
    "https://subtraz.top",
    "https://www.subtraz.top",
    "http://127.0.0.1:5500",
    "http://localhost:5500"
  ]);

  const requestedOrigin = String(value || "").trim();

  return allowedOrigins.has(requestedOrigin)
    ? requestedOrigin
    : "https://subtraz.top";
}

app.post("/api/gmail/connect/start", async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const platform =
      req.body?.platform === "android"
        ? "android"
        : "web";

    const returnOrigin = getSafeGmailReturnOrigin(req.body?.returnOrigin);

    const stateToken = crypto.randomBytes(32).toString("hex");
    const oauthState = `subtraz:${platform}:${stateToken}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabase
      .from("gmail_connect_states")
      .delete()
      .eq("user_id", user.id)
      .is("used_at", null);

    const { error: stateError } = await supabase
      .from("gmail_connect_states")
      .insert({
        state_hash: hashGmailConnectState(oauthState),
        user_id: user.id,
        platform,
        return_origin: returnOrigin,
        expires_at: expiresAt
      });

    if (stateError) {
      console.error("Gmail connect state save error:", stateError.message);

      return res.status(500).json({
        ok: false,
        error: stateError.message
      });
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      state: oauthState,
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly"
      ]
    });

    return res.json({
      ok: true,
      authUrl,
      expiresAt
    });
  } catch (error) {
    console.error("Secure Gmail connection start failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Gmail connection status and disconnect
   Uses the signed-in Subtraz account, not a browser-stored ID.
   ========================================================= */

app.get("/api/gmail/status", async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const { data: connection, error } = await supabase
      .from("gmail_tokens")
      .select("user_id, gmail_email, updated_at")
      .eq("subtraz_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    return res.json({
      ok: true,
      connected: !!connection,
      googleUserId: connection?.user_id || "",
      gmailEmail: connection?.gmail_email || ""
    });
  } catch (error) {
    console.error("Gmail status failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/gmail/disconnect", async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const { data: connections, error: lookupError } = await supabase
      .from("gmail_tokens")
      .select("user_id")
      .eq("subtraz_user_id", user.id);

    if (lookupError) {
      return res.status(500).json({
        ok: false,
        error: lookupError.message
      });
    }

    const googleUserIds = (connections || [])
      .map(function (connection) {
        return connection.user_id;
      })
      .filter(Boolean);

    const { error: deleteTokenError } = await supabase
      .from("gmail_tokens")
      .delete()
      .eq("subtraz_user_id", user.id);

    if (deleteTokenError) {
      return res.status(500).json({
        ok: false,
        error: deleteTokenError.message
      });
    }

    if (googleUserIds.length) {
      const { error: deletePushError } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("user_id", googleUserIds);

      if (deletePushError) {
        console.error("Old push cleanup failed:", deletePushError.message);
      }
    }

    await supabase
      .from("gmail_connect_states")
      .delete()
      .eq("user_id", user.id)
      .is("used_at", null);

    return res.json({
      ok: true,
      disconnected: true
    });
  } catch (error) {
    console.error("Gmail disconnect failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Secure Receipt Auto-Fill Links
   Creates a private token link and returns receipt details
   when the user opens that link.
   ========================================================= */

function hashReceiptAutofillToken(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function buildReceiptAutofillUrl(rawToken, returnOrigin) {
  const safeOrigin = getSafeGmailReturnOrigin(returnOrigin);

  return `${safeOrigin}/index.html?receipt_token=${encodeURIComponent(rawToken)}#/app/subscriptions`;
}

async function createReceiptAutofillLink(options) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const detection = options.detection || {};

  const { error } = await supabase
    .from("receipt_autofill_links")
    .insert({
      token_hash: hashReceiptAutofillToken(rawToken),
      subtraz_user_id: options.subtrazUserId,
      google_user_id: options.googleUserId || null,
      service_name: detection.serviceName,
      amount: detection.amount || null,
      billing_date: detection.billingDate || null,
      cycle: detection.cycle || "monthly",
      category: detection.category || null,
      source: detection.source || "gmail",
      expires_at: expiresAt
    });

  if (error) {
    throw error;
  }

  return {
    url: buildReceiptAutofillUrl(rawToken, options.returnOrigin),
    expiresAt
  };
}

/*
  Temporary local test route.
  It lets us prove the secure link works before email sending is added.
*/
app.post("/api/receipt-autofill/test-create", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const serviceName = String(
      req.body?.serviceName || "CapCut Pro"
    ).trim().slice(0, 80);

    const amount = String(
      req.body?.amount || "499.00"
    ).trim().slice(0, 30);

    const billingDate = String(
      req.body?.billingDate || "June 23, 2026"
    ).trim().slice(0, 60);

    const cycle =
      req.body?.cycle === "annual"
        ? "annual"
        : "monthly";

    const category = String(
      req.body?.category || "Video Editing"
    ).trim().slice(0, 80);

    const link = await createReceiptAutofillLink({
      subtrazUserId: user.id,
      googleUserId: null,
      returnOrigin: req.body?.returnOrigin,
      detection: {
        serviceName,
        amount,
        billingDate,
        cycle,
        category,
        source: "gmail"
      }
    });

    return res.json({
      ok: true,
      url: link.url,
      expiresAt: link.expiresAt
    });
  } catch (error) {
    console.error("Receipt auto-fill test link creation failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/*
  This route does not require login because the user may open the email
  button in a browser where Subtraz is not signed in yet.
  Access is protected by the private 64-character token and its expiry.
*/
app.get("/api/receipt-autofill/open/:token", async (req, res) => {
  try {
    const rawToken = String(req.params.token || "").trim();

    if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid receipt auto-fill link."
      });
    }

    const { data: link, error } = await supabase
      .from("receipt_autofill_links")
      .select(`
        id,
        service_name,
        amount,
        billing_date,
        cycle,
        category,
        source,
        expires_at,
        opened_at
      `)
      .eq("token_hash", hashReceiptAutofillToken(rawToken))
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!link) {
      return res.status(404).json({
        ok: false,
        error: "Receipt auto-fill link was not found."
      });
    }

    if (new Date(link.expires_at).getTime() < Date.now()) {
      return res.status(410).json({
        ok: false,
        error: "Receipt auto-fill link has expired."
      });
    }

    if (!link.opened_at) {
      await supabase
        .from("receipt_autofill_links")
        .update({
          opened_at: new Date().toISOString()
        })
        .eq("id", link.id)
        .is("opened_at", null);
    }

    return res.json({
      ok: true,
      detection: {
        serviceName: link.service_name,
        amount: link.amount,
        billingDate: link.billing_date,
        cycle: link.cycle || "monthly",
        category: link.category,
        source: link.source || "gmail"
      }
    });
  } catch (error) {
    console.error("Receipt auto-fill link open failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/email/test-send", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const toEmail = String(req.body?.toEmail || "").trim().toLowerCase();

    if (!toEmail || !toEmail.includes("@")) {
      return res.status(400).json({
        ok: false,
        error: "Enter a valid test email address."
      });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "RESEND_API_KEY is missing from .env."
      });
    }

    const testDetection = {
      serviceName: "CapCut Pro",
      amount: "499.00",
      billingDate: "June 23, 2026",
      cycle: "monthly",
      category: "Video Editing",
      source: "gmail"
    };

    const link = await createReceiptAutofillLink({
      subtrazUserId: user.id,
      googleUserId: null,
      returnOrigin: req.body?.returnOrigin,
      detection: testDetection
    });

    const { data, error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: [toEmail],
      subject: "CapCut Pro receipt detected - Add to Subtraz",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:34px 20px;color:#0f172a;">
          <div style="font-size:22px;font-weight:800;color:#16a34a;margin-bottom:24px;">
            Subtraz
          </div>

          <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;color:#0f172a;">
            CapCut Pro receipt detected
          </h1>

          <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 22px;">
            We found a subscription receipt in your connected Gmail. Add it to Subtraz with the details already filled in.
          </p>

          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:24px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;">
              <span style="color:#64748b;">Service</span>
              <strong style="color:#0f172a;">CapCut Pro</strong>
            </div>

            <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;">
              <span style="color:#64748b;">Amount</span>
              <strong style="color:#0f172a;">$499.00</strong>
            </div>

            <div style="display:flex;justify-content:space-between;font-size:14px;">
              <span style="color:#64748b;">Next billing date</span>
              <strong style="color:#0f172a;">June 23, 2026</strong>
            </div>
          </div>

          <a
            href="${link.url}"
            style="display:block;background:#16a34a;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:800;border-radius:14px;padding:15px 18px;"
          >
            Add to Subtraz
          </a>

          <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:22px 0 0;">
            This private link expires in 24 hours. You received this because Receipt Auto-Fill is connected to your Gmail account.
          </p>
        </div>
      `
    });

    if (error) {
      console.error("Resend auto-fill test email error:", error);

      return res.status(500).json({
        ok: false,
        error: error.message || "Resend could not send the test email."
      });
    }

    return res.json({
      ok: true,
      emailId: data?.id || "",
      autofillUrl: link.url,
      expiresAt: link.expiresAt
    });
  } catch (error) {
    console.error("Auto-fill test email sending failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

async function requireLinkedExtension(req, res) {
  const extensionToken = String(
    req.get("X-Subtraz-Extension-Token") || ""
  ).trim();

  if (!extensionToken) {
    res.status(401).json({
      ok: false,
      error: "Missing extension token"
    });
    return null;
  }

  const tokenHash = hashExtensionValue(extensionToken);

  const { data: device, error } = await supabase
    .from("extension_devices")
    .select("id, user_id, device_name, created_at, last_seen_at, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !device) {
    res.status(401).json({
      ok: false,
      error: "Extension is not linked or was revoked"
    });
    return null;
  }

  await supabase
    .from("extension_devices")
    .update({
      last_seen_at: new Date().toISOString()
    })
    .eq("id", device.id);

  return device;
}

app.get("/api/extension/health", (req, res) => {
  res.json({
    ok: true,
    route: "extension pairing ready"
  });
});

app.post("/api/extension/pair/create", async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    await supabase
      .from("extension_pair_codes")
      .delete()
      .eq("user_id", user.id)
      .is("used_at", null);

    const code = makeExtensionPairCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from("extension_pair_codes")
      .insert({
        user_id: user.id,
        code_hash: hashExtensionValue(code),
        expires_at: expiresAt
      });

    if (error) {
      console.error("Extension pairing create error:", error.message);

      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    return res.json({
      ok: true,
      code,
      expiresAt
    });
  } catch (error) {
    console.error("Extension pairing create failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/extension/pair/claim", async (req, res) => {
  try {
    const code = String(req.body?.code || "")
      .replace(/\s+/g, "")
      .trim();

    const deviceName = String(
      req.body?.deviceName || "Chrome Extension"
    ).slice(0, 80);

    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({
        ok: false,
        error: "Enter the 6-digit pairing code"
      });
    }

    const { data: pairing, error: findError } = await supabase
      .from("extension_pair_codes")
      .select("id, user_id, expires_at, used_at")
      .eq("code_hash", hashExtensionValue(code))
      .maybeSingle();

    if (findError || !pairing) {
      return res.status(400).json({
        ok: false,
        error: "Invalid pairing code"
      });
    }

    if (pairing.used_at) {
      return res.status(400).json({
        ok: false,
        error: "This pairing code has already been used"
      });
    }

    if (new Date(pairing.expires_at).getTime() < Date.now()) {
      return res.status(400).json({
        ok: false,
        error: "This pairing code has expired"
      });
    }

    const usedAt = new Date().toISOString();

    const { data: consumed, error: consumeError } = await supabase
      .from("extension_pair_codes")
      .update({
        used_at: usedAt
      })
      .eq("id", pairing.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();

    if (consumeError || !consumed) {
      return res.status(400).json({
        ok: false,
        error: "This pairing code was already claimed"
      });
    }

    const rawExtensionToken = crypto.randomBytes(32).toString("hex");

    const { data: device, error: deviceError } = await supabase
      .from("extension_devices")
      .insert({
        user_id: pairing.user_id,
        token_hash: hashExtensionValue(rawExtensionToken),
        device_name: deviceName,
        last_seen_at: usedAt
      })
      .select("id, device_name")
      .single();

    if (deviceError) {
      console.error("Extension device save error:", deviceError.message);

      return res.status(500).json({
        ok: false,
        error: deviceError.message
      });
    }

    return res.json({
      ok: true,
      extensionToken: rawExtensionToken,
      deviceId: device.id,
      deviceName: device.device_name
    });
  } catch (error) {
    console.error("Extension pairing claim failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/api/extension/status", async (req, res) => {
  try {
    const device = await requireLinkedExtension(req, res);

    if (!device) return;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, email, plan")
      .eq("id", device.user_id)
      .maybeSingle();

    if (error || !profile) {
      return res.status(404).json({
        ok: false,
        error: "Linked Subtraz account was not found"
      });
    }

    return res.json({
      ok: true,
      linked: true,
      deviceName: device.device_name,
      accountEmail: profile.email,
      plan: profile.plan || "free"
    });
  } catch (error) {
    console.error("Extension status failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Subtraz Chrome Extension Receipt Detections
   Linked extensions can check new Gmail receipt detections.
   ========================================================= */

app.get("/api/extension/detections/pending", async (req, res) => {
  try {
    const device = await requireLinkedExtension(req, res);

    if (!device) return;

    const { data: detections, error } = await supabase
      .from("extension_receipt_detections")
      .select(`
        id,
        service,
        service_name,
        category,
        amount,
        billing_date,
        cycle,
        source,
        status,
        created_at
      `)
      .eq("user_id", device.user_id)
      .eq("status", "pending")
      .is("notified_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("Extension pending detections error:", error.message);

      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    if (!detections || !detections.length) {
      return res.json({
        ok: true,
        detections: []
      });
    }

    const detectionIds = detections.map(function (detection) {
      return detection.id;
    });

    const notifiedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("extension_receipt_detections")
      .update({
        notified_at: notifiedAt
      })
      .in("id", detectionIds)
      .eq("status", "pending")
      .is("notified_at", null);

    if (updateError) {
      console.error("Extension detection notify mark error:", updateError.message);

      return res.status(500).json({
        ok: false,
        error: updateError.message
      });
    }

    return res.json({
      ok: true,
      detections
    });
  } catch (error) {
    console.error("Extension pending detections failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/extension/detections/:detectionId/open", async (req, res) => {
  try {
    const device = await requireLinkedExtension(req, res);

    if (!device) return;

    const detectionId = String(req.params.detectionId || "").trim();

    const { data: detection, error } = await supabase
      .from("extension_receipt_detections")
      .update({
        status: "opened",
        opened_at: new Date().toISOString()
      })
      .eq("id", detectionId)
      .eq("user_id", device.user_id)
      .eq("status", "pending")
      .select(`
        id,
        service,
        service_name,
        category,
        amount,
        billing_date,
        cycle,
        source,
        status
      `)
      .maybeSingle();

    if (error) {
      console.error("Extension open detection error:", error.message);

      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    if (!detection) {
      return res.status(404).json({
        ok: false,
        error: "Receipt detection was not found or has already been handled."
      });
    }

    return res.json({
      ok: true,
      detection
    });
  } catch (error) {
    console.error("Extension open detection failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/api/extension/detections/:detectionId/dismiss", async (req, res) => {
  try {
    const device = await requireLinkedExtension(req, res);

    if (!device) return;

    const detectionId = String(req.params.detectionId || "").trim();

    const { data: detection, error } = await supabase
      .from("extension_receipt_detections")
      .update({
        status: "dismissed",
        dismissed_at: new Date().toISOString()
      })
      .eq("id", detectionId)
      .eq("user_id", device.user_id)
      .eq("status", "pending")
      .select("id, status")
      .maybeSingle();

    if (error) {
      console.error("Extension dismiss detection error:", error.message);

      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    if (!detection) {
      return res.status(404).json({
        ok: false,
        error: "Receipt detection was not found or has already been handled."
      });
    }

    return res.json({
      ok: true,
      dismissed: true
    });
  } catch (error) {
    console.error("Extension dismiss detection failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Extension Gmail Scan Test
   Reads Gmail for the linked Subtraz account and saves
   pending receipt detections for the Chrome extension.
   ========================================================= */

app.post("/api/extension/detections/scan-now", async (req, res) => {
  try {
    const device = await requireLinkedExtension(req, res);

    if (!device) return;

    const { data: gmailConnection, error: connectionError } = await supabase
      .from("gmail_tokens")
      .select("tokens, gmail_email, updated_at")
      .eq("subtraz_user_id", device.user_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (connectionError) {
      console.error("Extension Gmail connection lookup error:", connectionError.message);

      return res.status(500).json({
        ok: false,
        error: connectionError.message
      });
    }

    if (!gmailConnection || !gmailConnection.tokens) {
      return res.status(400).json({
        ok: false,
        error: "Connect Gmail in Subtraz first."
      });
    }

    oauth2Client.setCredentials(gmailConnection.tokens);

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client
    });

    const messagesResponse = await gmail.users.messages.list({
      userId: "me",
      q: buildGmailQuery(),
      maxResults: 20
    });

    const messages = messagesResponse.data.messages || [];

    if (!messages.length) {
      return res.json({
        ok: true,
        found: 0,
        created: 0
      });
    }

    const fullMessages = await Promise.all(
      messages.slice(0, 10).map(function (message) {
        return gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "full"
        });
      })
    );

    const parsedDetections = parseEmailsForSubscriptions(
      fullMessages.map(function (response) {
        return response.data;
      })
    );

    const detections = deduplicateByService(parsedDetections);

    let createdCount = 0;

    for (const detection of detections) {
      if (!detection.gmailMessageId) continue;

      const { data: existingDetection, error: existingError } = await supabase
        .from("extension_receipt_detections")
        .select("id")
        .eq("user_id", device.user_id)
        .eq("gmail_message_id", detection.gmailMessageId)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingDetection) {
        continue;
      }

      const { error: insertError } = await supabase
        .from("extension_receipt_detections")
        .insert({
          user_id: device.user_id,
          gmail_message_id: detection.gmailMessageId,
          service: detection.service,
          service_name: detection.serviceName,
          category: detection.category,
          amount: detection.amount,
          billing_date: detection.billingDate,
          cycle: detection.cycle || "monthly",
          source: "gmail",
          status: "pending"
        });

      if (insertError) {
        throw insertError;
      }

      createdCount += 1;
    }

    return res.json({
      ok: true,
      gmailEmail: gmailConnection.gmail_email || "",
      found: detections.length,
      created: createdCount
    });
  } catch (error) {
    console.error("Extension Gmail scan failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3001;

// Save push subscription for the signed-in Subtraz account
app.post("/api/push/subscribe", async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const subscription = req.body?.subscription;

    if (!subscription) {
      return res.status(400).json({
        ok: false,
        error: "Missing push subscription."
      });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({
        user_id: user.id,
        subscription: JSON.stringify(subscription),
        updated_at: new Date().toISOString()
      });

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    return res.json({
      ok: true,
      saved: true
    });
  } catch (error) {
    console.error("Push subscription save failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

console.log("Lemon Squeezy webhook route loaded");

function verifyLemonSqueezySignature(req) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const signature = req.get("X-Signature");

  if (!secret || !signature || !req.rawBody) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("hex");

  const sigBuffer = Buffer.from(signature, "utf8");
  const digestBuffer = Buffer.from(digest, "utf8");

  if (sigBuffer.length !== digestBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, digestBuffer);
}

app.get("/api/lemonsqueezy/health", (req, res) => {
  res.json({
    ok: true,
    route: "lemonsqueezy webhook ready"
  });
});

app.post("/api/lemonsqueezy/webhook", async (req, res) => {
  try {
    if (!verifyLemonSqueezySignature(req)) {
      return res.status(401).json({
        ok: false,
        error: "Invalid Lemon Squeezy signature"
      });
    }

    const eventName =
      req.get("X-Event-Name") ||
      req.body?.meta?.event_name ||
      "";

    if (eventName !== "order_created") {
      return res.json({
        ok: true,
        ignored: true,
        eventName
      });
    }

    const payload = req.body || {};
    const data = payload.data || {};
    const attrs = data.attributes || {};
    const custom = payload.meta?.custom_data || {};

    const userId = String(custom.user_id || custom.uid || "").trim();

    const email = String(
      custom.email ||
      attrs.user_email ||
      attrs.customer_email ||
      attrs.email ||
      ""
    ).trim().toLowerCase();

    const orderId = String(
      data.id ||
      attrs.identifier ||
      attrs.order_number ||
      `order:${email}:${Date.now()}`
    );

    if (!email && !userId) {
      return res.status(400).json({
        ok: false,
        error: "No user_id or email found"
      });
    }

    await supabase
      .from("lemon_orders")
      .upsert({
        id: orderId,
        user_id: userId || null,
        email: email || null,
        event_name: eventName,
        payload
      });

    const proUpdate = {
      plan: "pro",
      lemon_order_id: orderId,
      lemon_customer_email: email || null,
      pro_activated_at: new Date().toISOString()
    };

    let updatedProfile = null;

    if (userId) {
      const byUser = await supabase
        .from("profiles")
        .update(proUpdate)
        .eq("id", userId)
        .select("id, email, plan")
        .maybeSingle();

      if (byUser.error) {
        console.error("Pro update by user id failed:", byUser.error.message);
      }

      updatedProfile = byUser.data || null;
    }

    if (!updatedProfile && email) {
      const byEmail = await supabase
        .from("profiles")
        .update(proUpdate)
        .ilike("email", email)
        .select("id, email, plan")
        .maybeSingle();

      if (byEmail.error) {
        console.error("Pro update by email failed:", byEmail.error.message);
      }

      updatedProfile = byEmail.data || null;
    }

    console.log("Lemon Squeezy order processed:", {
      eventName,
      email,
      userId,
      orderId,
      activated: !!updatedProfile
    });

    return res.json({
      ok: true,
      activated: !!updatedProfile,
      profile: updatedProfile
    });
  } catch (error) {
    console.error("Lemon Squeezy webhook error:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Gmail backend running on http://localhost:${PORT}`);
  console.log(`OAuth callback: ${REDIRECT_URI}`);
  console.log(`Google Client ID loaded: ${!!GOOGLE_CLIENT_ID}`);
  console.log(`Google Client Secret loaded: ${!!GOOGLE_CLIENT_SECRET}`);
});

// Fast polling scanner.
// Keep this OFF while testing locally so local and Railway do not send duplicate alerts.
if (process.env.ENABLE_GMAIL_SCANNER === "true") {
  setInterval(async function () {
    console.log("Scanning Gmail for all users...");

    try {
      const { data: users } = await supabase
        .from("gmail_tokens")
        .select("user_id");

      if (!users || !users.length) return;

      for (const user of users) {
        await scanAndNotifyUser(user.user_id);
      }
    } catch (err) {
      console.error("Scheduled scan error:", err);
    }
  }, 15000);

  console.log("Gmail scheduled scanner enabled.");
} else {
  console.log("Gmail scheduled scanner disabled.");
}

// Gmail Pub/Sub webhook
app.post('/api/gmail/webhook', async (req, res) => {
  res.sendStatus(200); // Always respond 200 first

  try {
    const message = req.body?.message;
    if (!message) return;

    const data = JSON.parse(Buffer.from(message.data, 'base64').toString());
    const email = data.emailAddress;

    if (!email) return;

    // Find user by email - look up gmail_email column (set during OAuth callback)
    // Fall back to scanning all users if no direct match
    let targetUsers = [];
    if (email) {
      const { data: matched } = await supabase
        .from('gmail_tokens')
        .select('user_id')
        .eq('gmail_email', email);
      if (matched && matched.length) {
        targetUsers = matched;
      }
    }
    if (!targetUsers.length) {
      const { data: users } = await supabase
        .from('gmail_tokens')
        .select('user_id');
      targetUsers = users || [];
    }
    const users = targetUsers;

    if (!users || !users.length) return;

    for (const user of users) {
      await scanAndNotifyUser(user.user_id);
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

function escapeReceiptEmailHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendReceiptEmailAlert(toEmail, detection, autofillUrl) {
  const serviceName = escapeReceiptEmailHtml(
    detection.serviceName || "Subscription"
  );

  const amount = detection.amount
    ? "$" + escapeReceiptEmailHtml(detection.amount)
    : "Not found";

  const billingDate = detection.billingDate
    ? escapeReceiptEmailHtml(detection.billingDate)
    : "Not found";

  const safeUrl = escapeReceiptEmailHtml(autofillUrl);

  const { data, error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: [toEmail],
    subject: `${detection.serviceName || "Subscription"} receipt detected - Add to Subtraz`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:34px 20px;color:#0f172a;">
        <div style="font-size:22px;font-weight:800;color:#16a34a;margin-bottom:24px;">
          Subtraz
        </div>

        <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;color:#0f172a;">
          ${serviceName} receipt detected
        </h1>

        <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 22px;">
          We found a subscription receipt in your connected Gmail. Add it to Subtraz with the details already filled in.
        </p>

        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;">
            <span style="color:#64748b;">Service</span>
            <strong style="color:#0f172a;">${serviceName}</strong>
          </div>

          <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;">
            <span style="color:#64748b;">Amount</span>
            <strong style="color:#0f172a;">${amount}</strong>
          </div>

          <div style="display:flex;justify-content:space-between;font-size:14px;">
            <span style="color:#64748b;">Next billing date</span>
            <strong style="color:#0f172a;">${billingDate}</strong>
          </div>
        </div>

        <a
          href="${safeUrl}"
          style="display:block;background:#16a34a;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:800;border-radius:14px;padding:15px 18px;"
        >
          Add to Subtraz
        </a>

        <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:22px 0 0;">
          This private link expires in 24 hours. You received this because Receipt Auto-Fill is connected to your Gmail account.
        </p>
      </div>
    `
  });

  if (error) {
    throw new Error(error.message || "Resend could not send the receipt email.");
  }

  return data?.id || "";
}

/* =========================================================
   Temporary controlled subscription reminder email test
   Sends one reminder email for one chosen subscription.
   It does not start scheduled reminders.
   ========================================================= */

function buildReminderReviewUrl(subscriptionId, returnOrigin) {
  const safeOrigin = getSafeGmailReturnOrigin(returnOrigin);

  return `${safeOrigin}/index.html?reminder_sub=${encodeURIComponent(subscriptionId)}#/app/subscriptions`;
}

function cleanReminderSubject(value) {
  return String(value || "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 160);
}

function formatReminderAmount(value) {
  const amount = Number(value || 0);

  return Number.isFinite(amount) && amount > 0
    ? `$${amount.toFixed(2)}`
    : "";
}

function formatReminderDate(value) {
  const rawDate = String(value || "").trim();

  if (!rawDate) return "Not set";

  const parsed = new Date(`${rawDate}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return rawDate;
  }

  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

async function sendSubscriptionReminderEmailAlert(
  toEmail,
  subscription,
  reviewUrl,
  options = {}
) {
  const isTrial = subscription.status === "Trial";
  const daysBefore = Number(options.daysBefore || 1);
  const testOnly = options.testOnly !== false;

  const rawName =
    String(subscription.name || "Subscription").trim() || "Subscription";

  const amountText = formatReminderAmount(subscription.amount);
  const dateText = formatReminderDate(subscription.billing_date);

  const timingText =
    daysBefore === 1
      ? "tomorrow"
      : `in ${daysBefore} days`;

  const safeName = escapeReceiptEmailHtml(rawName);
  const safeAmount = escapeReceiptEmailHtml(amountText || "Amount not set");
  const safeDate = escapeReceiptEmailHtml(dateText);
  const safeUrl = escapeReceiptEmailHtml(reviewUrl);

  const subject = isTrial
    ? amountText
      ? `Your ${rawName} trial ends ${timingText} - cancel before you are charged ${amountText}`
      : `Your ${rawName} trial ends ${timingText} - review it now`
    : amountText
      ? `${rawName} renews ${timingText} for ${amountText}`
      : `${rawName} renews ${timingText}`;

  const heading = isTrial
    ? `${safeName} trial ends ${timingText}`
    : `${safeName} renews ${timingText}`;

  const bodyText = isTrial
    ? amountText
      ? `Your trial may turn into a paid subscription for ${safeAmount}. Review it before you are charged.`
      : "Your trial may turn into a paid subscription. Review it before it renews."
    : amountText
      ? `Your subscription is scheduled to renew for ${safeAmount}. Review it before the charge happens.`
      : "Your subscription is scheduled to renew. Review it before the renewal happens.";

  const dateLabel = isTrial ? "Trial end date" : "Renewal date";

  const buttonText = isTrial
    ? "Review trial in Subtraz"
    : "Review renewal in Subtraz";

  const testBadge = testOnly
    ? `
        <div style="display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:999px;padding:6px 10px;color:#16a34a;font-size:11px;font-weight:800;margin-bottom:14px;">
          Reminder test
        </div>
      `
    : "";

  const footerText = testOnly
    ? "This is a controlled reminder test. Automatic reminder sending has not been turned on yet."
    : "You received this because reminders are enabled for this subscription in Subtraz.";

  const { data, error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: [toEmail],
    subject: cleanReminderSubject(subject),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:34px 20px;color:#0f172a;">
        <div style="font-size:22px;font-weight:800;color:#16a34a;margin-bottom:24px;">
          Subtraz
        </div>

        ${testBadge}

        <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;color:#0f172a;">
          ${heading}
        </h1>

        <p style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 22px;">
          ${bodyText}
        </p>

        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;">
            <span style="color:#64748b;">Service</span>
            <strong style="color:#0f172a;">${safeName}</strong>
          </div>

          <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px;">
            <span style="color:#64748b;">Amount</span>
            <strong style="color:#0f172a;">${safeAmount}</strong>
          </div>

          <div style="display:flex;justify-content:space-between;font-size:14px;">
            <span style="color:#64748b;">${dateLabel}</span>
            <strong style="color:#0f172a;">${safeDate}</strong>
          </div>
        </div>

        <a
          href="${safeUrl}"
          style="display:block;background:#16a34a;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:800;border-radius:14px;padding:15px 18px;"
        >
          ${buttonText}
        </a>

        <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:22px 0 0;">
          ${footerText}
        </p>
      </div>
    `
  });

  if (error) {
    throw new Error(error.message || "Resend could not send the reminder email.");
  }

  return data?.id || "";
}

app.post("/api/reminders/test-send", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const subscriptionId = String(req.body?.subscriptionId || "").trim();
    const toEmail = String(req.body?.toEmail || user.email || "")
      .trim()
      .toLowerCase();

    if (!subscriptionId) {
      return res.status(400).json({
        ok: false,
        error: "Choose a subscription first."
      });
    }

    if (!toEmail || !toEmail.includes("@")) {
      return res.status(400).json({
        ok: false,
        error: "A valid reminder email address is required."
      });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "RESEND_API_KEY is missing from .env."
      });
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select(`
        id,
        user_id,
        name,
        amount,
        billing_date,
        status,
        reminder_enabled,
        email_reminders_enabled,
        cancelled_at
      `)
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) {
      throw subscriptionError;
    }

    if (!subscription) {
      return res.status(404).json({
        ok: false,
        error: "Subscription was not found in your account."
      });
    }

    if (subscription.cancelled_at) {
      return res.status(400).json({
        ok: false,
        error: "This subscription is already marked as cancelled."
      });
    }

    if (subscription.email_reminders_enabled === false) {
      return res.status(400).json({
        ok: false,
        error: "Email reminders are turned off for this subscription."
      });
    }

    const reminderUrl = buildReminderReviewUrl(
      subscription.id,
      req.body?.returnOrigin ||
        process.env.RECEIPT_AUTOFILL_RETURN_ORIGIN ||
        "https://subtraz.top"
    );

    const emailId = await sendSubscriptionReminderEmailAlert(
      toEmail,
      subscription,
      reminderUrl,
      {
        daysBefore: 1,
        testOnly: true
      }
    );

    return res.json({
      ok: true,
      testOnly: true,
      emailId,
      sentTo: toEmail,
      reminderUrl,
      reminderKind: subscription.status === "Trial" ? "trial" : "renewal"
    });
  } catch (error) {
    console.error("Controlled reminder email test failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Temporary controlled subscription reminder push test
   Sends one browser notification for one chosen subscription.
   It does not start scheduled reminders.
   ========================================================= */

app.post("/api/reminders/test-push", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    if (!hasVapidConfig) {
      return res.status(500).json({
        ok: false,
        error: "Push VAPID settings are missing from .env."
      });
    }

    const subscriptionId = String(req.body?.subscriptionId || "").trim();

    if (!subscriptionId) {
      return res.status(400).json({
        ok: false,
        error: "Choose a subscription first."
      });
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select(`
        id,
        user_id,
        name,
        amount,
        billing_date,
        status,
        push_reminders_enabled,
        cancelled_at
      `)
      .eq("id", subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (subscriptionError) {
      throw subscriptionError;
    }

    if (!subscription) {
      return res.status(404).json({
        ok: false,
        error: "Subscription was not found in your account."
      });
    }

    if (subscription.cancelled_at) {
      return res.status(400).json({
        ok: false,
        error: "This subscription is already marked as cancelled."
      });
    }

    if (subscription.push_reminders_enabled === false) {
      return res.status(400).json({
        ok: false,
        error: "Push notifications are turned off for this subscription."
      });
    }

    const { data: preferences, error: preferencesError } = await supabase
      .from("reminder_preferences")
      .select(`
        renewal_push_enabled,
        trial_push_enabled
      `)
      .eq("user_id", user.id)
      .maybeSingle();

    if (preferencesError) {
      throw preferencesError;
    }

    const isTrial = subscription.status === "Trial";

    if (isTrial && preferences?.trial_push_enabled === false) {
      return res.status(400).json({
        ok: false,
        error: "Trial push alerts are turned off in Notification settings."
      });
    }

    if (!isTrial && preferences?.renewal_push_enabled === false) {
      return res.status(400).json({
        ok: false,
        error: "Renewal push alerts are turned off in Notification settings."
      });
    }

    const { data: pushData, error: pushError } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pushError) {
      throw pushError;
    }

    if (!pushData?.subscription) {
      return res.status(400).json({
        ok: false,
        error: "No browser push subscription is saved for this account. Enable notifications first."
      });
    }

    const rawName =
      String(subscription.name || "Subscription").trim() ||
      "Subscription";

    const amount = Number(subscription.amount || 0);

    const amountText =
      Number.isFinite(amount) && amount > 0
        ? `$${amount.toFixed(2)}`
        : "";

    const reminderUrl = buildReminderReviewUrl(
      subscription.id,
      req.body?.returnOrigin ||
        process.env.RECEIPT_AUTOFILL_RETURN_ORIGIN ||
        "https://subtraz.top"
    );

    const title = isTrial
      ? `${rawName} trial reminder test`
      : `${rawName} renewal reminder test`;

    const body = isTrial
      ? amountText
        ? `Your trial may become a ${amountText} charge. Tap to review.`
        : "Your trial may become a paid subscription. Tap to review."
      : amountText
        ? `Upcoming renewal for ${amountText}. Tap to review.`
        : "Upcoming renewal. Tap to review.";

    await webpush.sendNotification(
      JSON.parse(pushData.subscription),
      JSON.stringify({
        title,
        body,
        url: reminderUrl,
        reminder: {
          subscriptionId: subscription.id,
          type: isTrial ? "trial" : "renewal",
          testOnly: true
        },
        tag: `subtraz-reminder-test-${subscription.id}`
      }),
      {
        urgency: "high",
        TTL: 86400,
        topic: "reminder-test"
      }
    );

    return res.json({
      ok: true,
      testOnly: true,
      reminderKind: isTrial ? "trial" : "renewal",
      reminderUrl,
      subscriptionName: rawName
    });
  } catch (error) {
    console.error("Controlled reminder push test failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Controlled due-tomorrow reminder test
   Sends saved email/push settings for tomorrow only.
   ========================================================= */

function getIsoDateInTimeZone(timeZone, offsetDays) {
  const target = new Date(Date.now() + Number(offsetDays || 0) * 86400000);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(target);

  const values = {};

  parts.forEach(function (part) {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
}

async function claimReminderSend(subscription, channel, reminderType) {
  const { error } = await supabase
    .from("reminder_deliveries")
    .insert({
      subscription_id: subscription.id,
      user_id: subscription.user_id,
      channel,
      reminder_type: reminderType,
      reminder_slot: subscription.billing_date
    });

  if (!error) return true;

  if (
    String(error.code || "") === "23505" ||
    /duplicate|unique/i.test(String(error.message || ""))
  ) {
    return false;
  }

  throw error;
}

async function releaseReminderSend(subscription, channel, reminderType) {
  await supabase
    .from("reminder_deliveries")
    .delete()
    .eq("subscription_id", subscription.id)
    .eq("user_id", subscription.user_id)
    .eq("channel", channel)
    .eq("reminder_type", reminderType)
    .eq("reminder_slot", subscription.billing_date);
}

async function completeReminderSend(subscription, channel, reminderType, messageId) {
  await supabase
    .from("reminder_deliveries")
    .update({
      provider_message_id: messageId || null,
      sent_at: new Date().toISOString()
    })
    .eq("subscription_id", subscription.id)
    .eq("user_id", subscription.user_id)
    .eq("channel", channel)
    .eq("reminder_type", reminderType)
    .eq("reminder_slot", subscription.billing_date);
}

/* =========================================================
   Controlled full reminder schedule test
   Checks all normal reminder windows and sends once per slot.
   It does not start scheduled reminders.
   ========================================================= */

/* =========================================================
   Live normal reminder runner
   Paid: 2 days and 1 day before renewal.
   Trial: 3 days, 2 days and 1 day before ending.
   Automatic mode remains disabled until ENABLE_REMINDER_RUNNER=true.
   ========================================================= */

function hasReachedReminderTime(reminderTime, timeZone) {
  const rawTime = String(reminderTime || "12:00:00");
  const timeParts = rawTime.split(":");

  const targetHour = Number(timeParts[0] || 12);
  const targetMinute = Number(timeParts[1] || 0);

  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const values = {};

  nowParts.forEach(function (part) {
    values[part.type] = part.value;
  });

  const nowMinutes =
    Number(values.hour || 0) * 60 +
    Number(values.minute || 0);

  const targetMinutes =
    targetHour * 60 +
    targetMinute;

  return nowMinutes >= targetMinutes;
}

async function runDueRemindersForUser(userId, options = {}) {
  const testOnly = options.testOnly === true;
  const respectSendTime = options.respectSendTime === true;

  const returnOrigin =
    options.returnOrigin ||
    process.env.RECEIPT_AUTOFILL_RETURN_ORIGIN ||
    "https://subtraz.top";

  const { data: preferences, error: preferencesError } = await supabase
    .from("reminder_preferences")
    .select(`
      renewal_push_enabled,
      trial_push_enabled,
      urgent_trial_push_enabled,
      email_reminders_enabled,
      reminder_time,
      reminder_timezone,
      reminder_email
    `)
    .eq("user_id", userId)
    .maybeSingle();

  if (preferencesError) {
    throw preferencesError;
  }

  if (!preferences) {
    return {
      skipped: true,
      reason: "No reminder preferences found.",
      matched: 0,
      results: []
    };
  }

  const timeZone = preferences.reminder_timezone || "Asia/Manila";

  if (
    respectSendTime &&
    !hasReachedReminderTime(preferences.reminder_time, timeZone)
  ) {
    return {
      skipped: true,
      reason: "Saved reminder time has not been reached yet.",
      timeZone,
      matched: 0,
      results: []
    };
  }

  const dueDates = {
    oneDay: getIsoDateInTimeZone(timeZone, 1),
    twoDays: getIsoDateInTimeZone(timeZone, 2),
    threeDays: getIsoDateInTimeZone(timeZone, 3)
  };

  const dateToDaysBefore = {
    [dueDates.oneDay]: 1,
    [dueDates.twoDays]: 2,
    [dueDates.threeDays]: 3
  };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, email")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  const { data: dueSubscriptions, error: dueError } = await supabase
    .from("subscriptions")
    .select(`
      id,
      user_id,
      name,
      amount,
      billing_date,
      status,
      reminder_enabled,
      email_reminders_enabled,
      push_reminders_enabled,
      renewal_acknowledged_for,
      cancelled_at
    `)
    .eq("user_id", userId)
    .in("billing_date", [
      dueDates.oneDay,
      dueDates.twoDays,
      dueDates.threeDays
    ])
    .eq("reminder_enabled", true)
    .is("cancelled_at", null);

  if (dueError) {
    throw dueError;
  }

  const { data: pushData, error: pushError } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .eq("user_id", userId)
    .maybeSingle();

  if (pushError) {
    throw pushError;
  }

  const proAccount =
    String(profile?.plan || "").toLowerCase() === "pro";

  const reminderEmail =
    String(preferences.reminder_email || profile?.email || "")
      .trim()
      .toLowerCase();

  const results = [];

  for (const subscription of dueSubscriptions || []) {
    const dueDate = String(subscription.billing_date || "").slice(0, 10);
    const daysBefore = dateToDaysBefore[dueDate];
    const isTrial = subscription.status === "Trial";

    const shouldSendAtThisWindow = isTrial
      ? [1, 2, 3].includes(daysBefore)
      : [1, 2].includes(daysBefore);

    if (!shouldSendAtThisWindow) {
      continue;
    }

    if (
      subscription.renewal_acknowledged_for &&
      String(subscription.renewal_acknowledged_for).slice(0, 10) === dueDate
    ) {
      results.push({
        subscription: subscription.name,
        type: isTrial ? "trial" : "renewal",
        daysBefore,
        email: "skipped - already handled",
        push: "skipped - already handled"
      });

      continue;
    }

    const normalReminderType =
      `${isTrial ? "trial" : "renewal"}_${daysBefore}_day`;

    /*
      Test sends now use a separate database key.
      This prevents future tests from blocking live reminders.
    */
    const deliveryReminderType = testOnly
      ? `${normalReminderType}_test`
      : normalReminderType;

    const reviewUrl = buildReminderReviewUrl(
      subscription.id,
      returnOrigin
    );

    const result = {
      subscription: subscription.name,
      type: isTrial ? "trial" : "renewal",
      daysBefore,
      email: "off",
      push: "off"
    };

    /*
      On the final day of a Pro trial with urgent alerts on,
      the urgent push replaces the normal trial push.
      Email still sends normally.
    */
    const urgentTrialPushWillHandleThisWindow =
      !testOnly &&
      proAccount &&
      isTrial &&
      daysBefore === 1 &&
      preferences.trial_push_enabled !== false &&
      preferences.urgent_trial_push_enabled === true;

    const emailAllowed =
      proAccount &&
      preferences.email_reminders_enabled === true &&
      subscription.email_reminders_enabled !== false &&
      reminderEmail.includes("@") &&
      !!process.env.RESEND_API_KEY;

    if (emailAllowed) {
      const claimed = await claimReminderSend(
        subscription,
        "email",
        deliveryReminderType
      );

      if (!claimed) {
        result.email = "already sent";
      } else {
        try {
          const emailId = await sendSubscriptionReminderEmailAlert(
            reminderEmail,
            subscription,
            reviewUrl,
            {
              daysBefore,
              testOnly
            }
          );

          await completeReminderSend(
            subscription,
            "email",
            deliveryReminderType,
            emailId
          );

          result.email = "sent";
        } catch (emailError) {
          await releaseReminderSend(
            subscription,
            "email",
            deliveryReminderType
          );

          result.email = "failed - " + emailError.message;
        }
      }
    }

    const pushAllowed =
      !urgentTrialPushWillHandleThisWindow &&
      !!pushData?.subscription &&
      hasVapidConfig &&
      subscription.push_reminders_enabled !== false &&
      (
        isTrial
          ? preferences.trial_push_enabled !== false
          : preferences.renewal_push_enabled !== false
      );

    if (pushAllowed) {
      const claimed = await claimReminderSend(
        subscription,
        "push",
        deliveryReminderType
      );

      if (!claimed) {
        result.push = "already sent";
      } else {
        try {
          const amountText = formatReminderAmount(subscription.amount);

          const timingText =
            daysBefore === 1
              ? "tomorrow"
              : `in ${daysBefore} days`;

          const title = isTrial
            ? `${subscription.name} trial ends ${timingText}`
            : `${subscription.name} renews ${timingText}`;

          const body = isTrial
            ? amountText
              ? `Cancel before a ${amountText} charge. Tap to review.`
              : "Your trial may become paid. Tap to review."
            : amountText
              ? `Upcoming charge: ${amountText}. Tap to review.`
              : "Upcoming renewal. Tap to review.";

          await webpush.sendNotification(
            JSON.parse(pushData.subscription),
            JSON.stringify({
              title,
              body,
              url: reviewUrl,
              reminder: {
                subscriptionId: subscription.id,
                type: isTrial ? "trial" : "renewal",
                daysBefore,
                testOnly
              },
              tag: `${testOnly ? "test" : "due"}-${normalReminderType}-${String(subscription.id).slice(0, 8)}`
            }),
            {
              urgency: "high",
              TTL: 86400
            }
          );

          await completeReminderSend(
            subscription,
            "push",
            deliveryReminderType,
            ""
          );

          result.push = "sent";
        } catch (pushSendError) {
          await releaseReminderSend(
            subscription,
            "push",
            deliveryReminderType
          );

          result.push = "failed - " + pushSendError.message;
        }
      }
    }

    results.push(result);
  }

  return {
    skipped: false,
    testOnly,
    timeZone,
    datesChecked: dueDates,
    matched: results.length,
    results
  };
}

/*
  Keeps your safe controlled test route.
  Test sends use separate delivery records and still show Reminder test.
*/
app.post("/api/reminders/test-run-due", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const result = await runDueRemindersForUser(user.id, {
      testOnly: true,
      respectSendTime: false,
      returnOrigin:
        req.body?.returnOrigin ||
        "http://127.0.0.1:5500"
    });

    return res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error("Controlled reminder schedule test failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/*
  Local live-send test route.
  Sends real reminder wording once and saves real delivery records.
  Do not use this repeatedly on an actual user's subscription.
*/
app.post("/api/reminders/run-now", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const result = await runDueRemindersForUser(user.id, {
      testOnly: false,
      respectSendTime: false,
      returnOrigin:
        req.body?.returnOrigin ||
        "http://127.0.0.1:5500"
    });

    return res.json({
      ok: true,
      manualLiveRun: true,
      ...result
    });
  } catch (error) {
    console.error("Manual live reminder run failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Controlled urgent final-day trial push test
   Pro only. Push only. No automatic 5-hour repeat yet.
   ========================================================= */

async function runUrgentTrialPushForSubscription(
  userId,
  subscriptionId,
  options = {}
) {
  const testOnly = options.testOnly === true;

  const returnOrigin =
    options.returnOrigin ||
    process.env.RECEIPT_AUTOFILL_RETURN_ORIGIN ||
    "https://subtraz.top";

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  const isProAccount =
    String(profile?.plan || "").toLowerCase() === "pro";

  if (!isProAccount) {
    return {
      skipped: true,
      reason: "Urgent trial alerts are available on Pro only.",
      push: "off"
    };
  }

  const { data: preferences, error: preferencesError } = await supabase
    .from("reminder_preferences")
    .select(`
      trial_push_enabled,
      urgent_trial_push_enabled,
      reminder_timezone
    `)
    .eq("user_id", userId)
    .maybeSingle();

  if (preferencesError) {
    throw preferencesError;
  }

  if (preferences?.trial_push_enabled === false) {
    return {
      skipped: true,
      reason: "Trial ending alerts are turned off.",
      push: "off"
    };
  }

  if (preferences?.urgent_trial_push_enabled !== true) {
    return {
      skipped: true,
      reason: "Urgent trial alerts are turned off.",
      push: "off"
    };
  }

  if (!hasVapidConfig) {
    return {
      skipped: true,
      reason: "Push VAPID settings are missing.",
      push: "off"
    };
  }

  const timeZone =
    preferences?.reminder_timezone ||
    "Asia/Manila";

  const tomorrowDate = getIsoDateInTimeZone(timeZone, 1);

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select(`
      id,
      user_id,
      name,
      amount,
      billing_date,
      status,
      reminder_enabled,
      push_reminders_enabled,
      renewal_acknowledged_for,
      cancelled_at
    `)
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (subscriptionError) {
    throw subscriptionError;
  }

  if (!subscription) {
    return {
      skipped: true,
      reason: "Subscription was not found.",
      push: "off"
    };
  }

  if (subscription.status !== "Trial") {
    return {
      skipped: true,
      reason: "Urgent alerts apply to trials only.",
      push: "off"
    };
  }

  if (subscription.cancelled_at) {
    return {
      skipped: true,
      reason: "This trial is already marked as cancelled.",
      push: "off"
    };
  }

  if (subscription.reminder_enabled === false) {
    return {
      skipped: true,
      reason: "Reminders are turned off for this trial.",
      push: "off"
    };
  }

  if (subscription.push_reminders_enabled === false) {
    return {
      skipped: true,
      reason: "Push notifications are turned off for this trial.",
      push: "off"
    };
  }

  const billingDate =
    String(subscription.billing_date || "").slice(0, 10);

  if (billingDate !== tomorrowDate) {
    return {
      skipped: true,
      reason: "This trial must end tomorrow for the urgent alert test.",
      push: "off",
      tomorrowDate
    };
  }

  if (
    subscription.renewal_acknowledged_for &&
    String(subscription.renewal_acknowledged_for).slice(0, 10) === billingDate
  ) {
    return {
      skipped: true,
      reason: "This trial was already handled.",
      push: "off"
    };
  }

  const { data: pushData, error: pushError } = await supabase
    .from("push_subscriptions")
    .select("subscription")
    .eq("user_id", userId)
    .maybeSingle();

  if (pushError) {
    throw pushError;
  }

  if (!pushData?.subscription) {
    return {
      skipped: true,
      reason: "No browser push subscription is saved for this account.",
      push: "off"
    };
  }

  const deliveryType =
    String(options.deliveryType || "").trim() ||
    (testOnly ? "urgent_trial_push_test" : "urgent_trial_push");

  const claimed = await claimReminderSend(
    subscription,
    "push",
    deliveryType
  );

  if (!claimed) {
    return {
      skipped: false,
      type: "trial",
      subscription: subscription.name,
      push: "already sent"
    };
  }

  try {
    const amountText = formatReminderAmount(subscription.amount);

    const reviewUrl = buildReminderReviewUrl(
      subscription.id,
      returnOrigin
    );

    const title = testOnly
      ? `Urgent trial test: ${subscription.name}`
      : `${subscription.name} trial ends tomorrow`;

    const body = amountText
      ? `Act now before a ${amountText} charge. Tap to review.`
      : "Act now before this trial becomes paid. Tap to review.";

    await webpush.sendNotification(
      JSON.parse(pushData.subscription),
      JSON.stringify({
        title,
        body,
        url: reviewUrl,
        reminder: {
          subscriptionId: subscription.id,
          type: "trial",
          urgent: true,
          testOnly
        },
        tag: `${testOnly ? "urgent-test" : "urgent"}-${String(subscription.id).slice(0, 8)}`
      }),
      {
        urgency: "high",
        TTL: 86400
      }
    );

    await completeReminderSend(
      subscription,
      "push",
      deliveryType,
      ""
    );

    return {
      skipped: false,
      type: "trial",
      subscription: subscription.name,
      push: "sent",
      reviewUrl
    };
  } catch (pushSendError) {
    await releaseReminderSend(
      subscription,
      "push",
      deliveryType
    );

    throw pushSendError;
  }
}

app.post("/api/reminders/test-urgent-trial-push", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const subscriptionId =
      String(req.body?.subscriptionId || "").trim();

    if (!subscriptionId) {
      return res.status(400).json({
        ok: false,
        error: "Choose a trial subscription first."
      });
    }

    const result = await runUrgentTrialPushForSubscription(
      user.id,
      subscriptionId,
      {
        testOnly: true,
        returnOrigin:
          req.body?.returnOrigin ||
          "http://127.0.0.1:5500"
      }
    );

    return res.json({
      ok: true,
      testOnly: true,
      ...result
    });
  } catch (error) {
    console.error("Urgent trial push test failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Urgent trial repeat cycle
   Pro only. Push only.
   Starts at the user's saved reminder time, then repeats every 5 hours.
   ========================================================= */

function getLocalMinutesInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const values = {};

  parts.forEach(function (part) {
    values[part.type] = part.value;
  });

  return (
    Number(values.hour || 0) * 60 +
    Number(values.minute || 0)
  );
}

function getUrgentTrialSlot(reminderTime, timeZone) {
  const rawTime = String(reminderTime || "12:00:00");
  const timeParts = rawTime.split(":");

  const startMinutes =
    Number(timeParts[0] || 12) * 60 +
    Number(timeParts[1] || 0);

  const currentMinutes = getLocalMinutesInTimeZone(timeZone);

  if (currentMinutes < startMinutes) {
    return null;
  }

  return Math.floor(
    (currentMinutes - startMinutes) / (5 * 60)
  );
}

async function runUrgentTrialCycleForUser(userId, options = {}) {
  const testOnly = options.testOnly === true;

  const { data: preferences, error: preferencesError } = await supabase
    .from("reminder_preferences")
    .select(`
      trial_push_enabled,
      urgent_trial_push_enabled,
      reminder_time,
      reminder_timezone
    `)
    .eq("user_id", userId)
    .maybeSingle();

  if (preferencesError) {
    throw preferencesError;
  }

  if (!preferences) {
    return {
      skipped: true,
      reason: "No reminder preferences found.",
      matched: 0,
      results: []
    };
  }

  if (preferences.trial_push_enabled === false) {
    return {
      skipped: true,
      reason: "Trial ending alerts are turned off.",
      matched: 0,
      results: []
    };
  }

  if (preferences.urgent_trial_push_enabled !== true) {
    return {
      skipped: true,
      reason: "Urgent trial alerts are turned off.",
      matched: 0,
      results: []
    };
  }

  const timeZone =
    preferences.reminder_timezone ||
    "Asia/Manila";

  const forcedSlot =
    Number.isInteger(options.forceSlot) &&
    options.forceSlot >= 0
      ? options.forceSlot
      : null;

  const slot =
    forcedSlot !== null
      ? forcedSlot
      : getUrgentTrialSlot(
          preferences.reminder_time,
          timeZone
        );

  if (slot === null) {
    return {
      skipped: true,
      reason: "Urgent trial alert time has not started yet.",
      timeZone,
      matched: 0,
      results: []
    };
  }

  const tomorrowDate = getIsoDateInTimeZone(timeZone, 1);

  const { data: trials, error: trialError } = await supabase
    .from("subscriptions")
    .select(`
      id,
      name
    `)
    .eq("user_id", userId)
    .eq("status", "Trial")
    .eq("billing_date", tomorrowDate)
    .eq("reminder_enabled", true)
    .is("cancelled_at", null);

  if (trialError) {
    throw trialError;
  }

  const results = [];

  for (const trial of trials || []) {
    const deliveryType = testOnly
      ? `urgent_trial_slot_${slot}_test`
      : `urgent_trial_slot_${slot}`;

    const result = await runUrgentTrialPushForSubscription(
      userId,
      trial.id,
      {
        testOnly,
        deliveryType,
        returnOrigin:
          options.returnOrigin ||
          process.env.RECEIPT_AUTOFILL_RETURN_ORIGIN ||
          "https://subtraz.top"
      }
    );

    results.push(result);
  }

  return {
    skipped: false,
    testOnly,
    timeZone,
    slot,
    tomorrowDate,
    matched: results.length,
    results
  };
}

/*
  Controlled repeat test.
  A slot represents one 5-hour alert window.
  Use slot 0, then slot 1, without waiting 5 real hours.
*/
app.post("/api/reminders/test-urgent-trial-cycle", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const slot = Number(req.body?.slot);

    if (!Number.isInteger(slot) || slot < 0 || slot > 4) {
      return res.status(400).json({
        ok: false,
        error: "Use an urgent test slot from 0 to 4."
      });
    }

    const result = await runUrgentTrialCycleForUser(
      user.id,
      {
        testOnly: true,
        forceSlot: slot,
        returnOrigin:
          req.body?.returnOrigin ||
          "http://127.0.0.1:5500"
      }
    );

    return res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error("Urgent trial cycle test failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

/* =========================================================
   Automatic normal reminder cycle
   Disabled until ENABLE_REMINDER_RUNNER=true is added to .env.
   ========================================================= */

let automaticReminderRunnerBusy = false;

async function runAutomaticReminderCycle() {
  if (automaticReminderRunnerBusy) {
    return;
  }

  automaticReminderRunnerBusy = true;

  try {
    const testUserId =
      String(process.env.REMINDER_RUNNER_TEST_USER_ID || "").trim();

    let preferenceQuery = supabase
      .from("reminder_preferences")
      .select("user_id");

    if (testUserId) {
      preferenceQuery = preferenceQuery.eq("user_id", testUserId);
    }

    const { data: preferenceRows, error } = await preferenceQuery;

    if (error) {
      throw error;
    }

    if (!testUserId && process.env.NODE_ENV !== "production") {
      console.log(
        "Automatic reminder cycle skipped locally. Add REMINDER_RUNNER_TEST_USER_ID to .env first."
      );
      return;
    }

    for (const row of preferenceRows || []) {
      try {
        const returnOrigin =
          process.env.RECEIPT_AUTOFILL_RETURN_ORIGIN ||
          "https://subtraz.top";

        const normalResult = await runDueRemindersForUser(row.user_id, {
          testOnly: false,
          respectSendTime: true,
          returnOrigin
        });

        const urgentResult = await runUrgentTrialCycleForUser(row.user_id, {
          testOnly: false,
          returnOrigin
        });

        if (normalResult.results?.some(item =>
          item.email === "sent" || item.push === "sent"
        )) {
          console.log("Automatic normal reminders sent:", {
            userId: row.user_id,
            results: normalResult.results
          });
        }

        if (urgentResult.results?.some(item =>
          item.push === "sent"
        )) {
          console.log("Automatic urgent trial push sent:", {
            userId: row.user_id,
            slot: urgentResult.slot,
            results: urgentResult.results
          });
        }
      } catch (userError) {
        console.error(
          "Automatic reminder failed for user:",
          row.user_id,
          userError.message
        );
      }
    }
  } catch (error) {
    console.error("Automatic reminder cycle failed:", error.message);
  } finally {
    automaticReminderRunnerBusy = false;
  }
}

if (process.env.ENABLE_REMINDER_RUNNER === "true") {
  setTimeout(runAutomaticReminderCycle, 5000);

  setInterval(
    runAutomaticReminderCycle,
    60 * 1000
  );

  console.log("Automatic reminder runner enabled.");
} else {
  console.log("Automatic reminder runner disabled.");
}

async function scanAndNotifyUser(userId) {
  try {
    console.log("Scanning user:", userId);

    const { data: gmailConnection, error: gmailConnectionError } = await supabase
      .from("gmail_tokens")
      .select("tokens, gmail_email, subtraz_user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (gmailConnectionError) {
      throw gmailConnectionError;
    }

    if (!gmailConnection || !gmailConnection.tokens) {
      console.log("Gmail connection not found for:", userId);
      return;
    }

    const { data: pushData, error: pushLookupError } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", gmailConnection.subtraz_user_id)
      .maybeSingle();

    if (pushLookupError) {
      console.error("Push subscription lookup failed:", pushLookupError.message);
    }

    const canSendPush =
      !!pushData?.subscription &&
      hasVapidConfig;

    const canSendEmail =
      !!gmailConnection.gmail_email &&
      !!gmailConnection.subtraz_user_id &&
      !!process.env.RESEND_API_KEY;

    console.log("Alert methods ready:", {
      push: canSendPush,
      email: canSendEmail
    });

    oauth2Client.setCredentials(gmailConnection.tokens);

    const gmail = google.gmail({
      version: "v1",
      auth: oauth2Client
    });

    const messagesResponse = await gmail.users.messages.list({
      userId: "me",
      q: buildGmailQuery(),
      maxResults: 10
    });

    const messages = messagesResponse.data.messages || [];

    if (!messages.length) {
      console.log("No matching receipt emails found for:", userId);
      return;
    }

    const newMessages = [];

    for (const msg of messages.slice(0, 5)) {
      const key = userId + "_" + msg.id;

      const { data: existing, error: existingError } = await supabase
        .from("notified_emails")
        .select("id")
        .eq("id", key)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (!existing) {
        newMessages.push(msg);
      }
    }

    if (!newMessages.length) {
      console.log("No new receipt emails to notify for:", userId);
      return;
    }

    const fullMessages = await Promise.all(
      newMessages.map(function (msg) {
        return gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full"
        });
      })
    );

    const detections = parseEmailsForSubscriptions(
      fullMessages.map(function (response) {
        return response.data;
      })
    );

    const uniqueDetections = deduplicateByService(detections);

    if (!uniqueDetections.length) {
      console.log("No supported subscriptions detected for:", userId);
      return;
    }

    for (const detection of uniqueDetections) {
      let alertSent = false;

      if (canSendPush) {
        try {
          const amountStr = detection.amount ? ` · $${detection.amount}` : "";
          const dateStr = detection.billingDate ? ` · ${detection.billingDate}` : "";

          await webpush.sendNotification(
            JSON.parse(pushData.subscription),
            JSON.stringify({
              title: `${detection.serviceName} receipt detected`,
              body: `Tap to add${amountStr}${dateStr} - auto-filled from Gmail.`,
              detection: {
                serviceName: detection.serviceName,
                amount: detection.amount,
                billingDate: detection.billingDate,
                cycle: detection.cycle || "monthly",
                category: detection.category,
                source: "gmail"
              }
            }),
            {
              urgency: "high",
              TTL: 86400,
              topic: "subtraz-receipt"
            }
          );

          alertSent = true;
          console.log("Push receipt alert sent:", detection.serviceName);
        } catch (pushError) {
          console.error("Push receipt alert failed:", pushError.message);
        }
      }

      if (canSendEmail) {
        try {
          const link = await createReceiptAutofillLink({
            subtrazUserId: gmailConnection.subtraz_user_id,
            googleUserId: userId,
            returnOrigin:
              process.env.RECEIPT_AUTOFILL_RETURN_ORIGIN ||
              "https://subtraz.top",
            detection: {
              serviceName: detection.serviceName,
              amount: detection.amount,
              billingDate: detection.billingDate,
              cycle: detection.cycle || "monthly",
              category: detection.category,
              source: "gmail"
            }
          });

          const emailId = await sendReceiptEmailAlert(
            gmailConnection.gmail_email,
            detection,
            link.url
          );

          alertSent = true;

          console.log("Email receipt alert sent:", {
            serviceName: detection.serviceName,
            emailId
          });
        } catch (emailError) {
          console.error("Email receipt alert failed:", emailError.message);
        }
      }

      if (!canSendPush && !canSendEmail) {
        console.log(
          "Receipt detected but no alert method is ready. Reconnect Gmail or enable notifications."
        );
      }

      if (alertSent && detection.gmailMessageId) {
        const notifiedKey = userId + "_" + detection.gmailMessageId;

        const { error: notifiedError } = await supabase
          .from("notified_emails")
          .upsert({
            id: notifiedKey,
            user_id: userId
          });

        if (notifiedError) {
          console.error("Could not mark receipt as notified:", notifiedError.message);
        }
      }
    }
  } catch (err) {
    console.error("Scan notify error for", userId, err.message, err.stack);
  }
}

/* =========================================================
   Temporary controlled Gmail receipt scan test
   Runs one scan only for the signed-in Subtraz user.
   ========================================================= */

app.post("/api/gmail/test-scan-now", localTestOnly, async (req, res) => {
  try {
    const user = await requireSubtrazAccount(req, res);

    if (!user) return;

    const { data: gmailConnection, error } = await supabase
      .from("gmail_tokens")
      .select("user_id, gmail_email")
      .eq("subtraz_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    if (!gmailConnection || !gmailConnection.user_id) {
      return res.status(400).json({
        ok: false,
        error: "Connect Gmail first."
      });
    }

    await scanAndNotifyUser(gmailConnection.user_id);

    return res.json({
      ok: true,
      scanned: true,
      gmailEmail: gmailConnection.gmail_email || ""
    });
  } catch (error) {
    console.error("Controlled Gmail scan failed:", error.message);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post('/api/logout-gmail', localTestOnly, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  await supabase.from('gmail_tokens').delete().eq('user_id', userId);
  await supabase.from('push_subscriptions').delete().eq('user_id', userId);

  res.json({ success: true });
});
