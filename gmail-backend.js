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

// Save push subscription
app.post('/api/push/subscribe', async (req, res) => {
  const { subscription, userId } = req.body;
  if (!subscription || !userId) return res.status(400).json({ error: 'Missing data' });

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, subscription: JSON.stringify(subscription), updated_at: new Date() });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
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

async function scanAndNotifyUser(userId) {
  try {
    console.log('Scanning user:', userId);
    const { data: pushData } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', userId)
      .single();

    console.log('Push data found:', !!pushData);
    if (!pushData) return;

    const { data: tokenData } = await supabase
      .from('gmail_tokens')
      .select('tokens')
      .eq('user_id', userId)
      .single();

    if (!tokenData) return;

    oauth2Client.setCredentials(tokenData.tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const query = buildGmailQuery();

    const messagesResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10
    });

    const messages = messagesResponse.data.messages || [];
    if (!messages.length) return;

    // Filter out already notified emails
    const newMessages = [];
    for (const msg of messages.slice(0, 5)) {
      const key = userId + '_' + msg.id;
      const { data: existing } = await supabase
        .from('notified_emails')
        .select('id')
        .eq('id', key)
        .single();
      
      if (!existing) {
        newMessages.push(msg);
        await supabase.from('notified_emails').insert({ id: key, user_id: userId });
      }
    }

    if (!newMessages.length) return;

    const fullMessages = await Promise.all(
      newMessages.map(msg =>
        gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
      )
    );

    const detections = parseEmailsForSubscriptions(fullMessages.map(r => r.data));
    const unique = deduplicateByService(detections);

    if (!unique.length) return;

    for (const detection of unique) {
      const amountStr = detection.amount ? ` · $${detection.amount}` : '';
      const dateStr = detection.billingDate ? ` · ${detection.billingDate}` : '';
      await webpush.sendNotification(
  JSON.parse(pushData.subscription),
  JSON.stringify({
          title: `${detection.serviceName} receipt detected 📬`,
          body: `Tap to add${amountStr}${dateStr} - auto-filled from Gmail.`,
          detection: {
            serviceName: detection.serviceName,
            amount: detection.amount,
            billingDate: detection.billingDate,
            cycle: detection.cycle || 'monthly',
            category: detection.category,
            source: 'gmail'
          }
      }),
        {
          urgency: 'high',
          TTL: 86400,
          topic: 'subtraz-receipt'
        }
      );
    }
  } catch (err) {
    console.error('Scan notify error for', userId, err.message, err.stack);
  }
}

app.post('/api/logout-gmail', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  await supabase.from('gmail_tokens').delete().eq('user_id', userId);
  await supabase.from('push_subscriptions').delete().eq('user_id', userId);

  res.json({ success: true });
});
