/**
 * Subtraz Subscription Detector
 * ────────────────────────────────────────────────────────────
 * Drop this before </body> in index.html.
 * Mobile-only. Detects subscription purchase pages on known
 * services and shows a persistent bottom-sheet notification
 * that auto-fills the Subtraz add-subscription form.
 * 
 * NO frameworks, NO dependencies, NO backend needed.
 * ────────────────────────────────────────────────────────────
 */

(function SubtrazDetector() {
  'use strict';

  // ── 1. MOBILE-ONLY GUARD ─────────────────────────────────
  // Never fires on desktop / PC
  const isMobile = (
    /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768 && 'ontouchstart' in window)
  );
  if (!isMobile) return;

  // ── 2. KNOWN SUBSCRIPTION SERVICES ──────────────────────
  // Add more services here as needed
  const SUB_APPS = [
    { id:'spotify',   name:'Spotify',        icon:'🎵', bg:'#1DB954', cat:'Music',         domains:['spotify.com'] },
    { id:'netflix',   name:'Netflix',        icon:'🎬', bg:'#E50914', cat:'Video',          domains:['netflix.com'] },
    { id:'canva',     name:'Canva',          icon:'🎨', bg:'#7B61FF', cat:'Design',         domains:['canva.com'] },
    { id:'capcut',    name:'CapCut',         icon:'✂️', bg:'#111111', cat:'Video Editing',  domains:['capcut.com'] },
    { id:'youtube',   name:'YouTube Premium',icon:'▶️', bg:'#FF0000', cat:'Video',          domains:['youtube.com'] },
    { id:'adobe',     name:'Adobe',          icon:'🔴', bg:'#FF0000', cat:'Creative',       domains:['adobe.com'] },
    { id:'notion',    name:'Notion',         icon:'📓', bg:'#FFFFFF', cat:'Productivity',   domains:['notion.so'] },
    { id:'duolingo',  name:'Duolingo Plus',  icon:'🦉', bg:'#58CC02', cat:'Education',      domains:['duolingo.com'] },
    { id:'disney',    name:'Disney+',        icon:'📺', bg:'#2D64BC', cat:'Video',          domains:['disneyplus.com'] },
    { id:'hulu',      name:'Hulu',           icon:'📱', bg:'#1CE783', cat:'Video',          domains:['hulu.com'] },
    { id:'icloud',    name:'iCloud+',        icon:'☁️', bg:'#0EA5E9', cat:'Storage',        domains:['icloud.com','apple.com'] },
    { id:'google',    name:'Google One',     icon:'🔵', bg:'#1A73E8', cat:'Storage',        domains:['one.google.com'] },
    { id:'microsoft', name:'Microsoft 365',  icon:'💼', bg:'#0068C8', cat:'Productivity',   domains:['microsoft.com','office.com'] },
    { id:'amazon',    name:'Amazon Prime',   icon:'📦', bg:'#FF6900', cat:'Shopping',       domains:['amazon.com','primevideo.com'] },
    { id:'figma',     name:'Figma',          icon:'💡', bg:'#4F46E5', cat:'Design',         domains:['figma.com'] },
    { id:'chatgpt',   name:'ChatGPT Plus',   icon:'🤖', bg:'#10a37f', cat:'AI Tools',       domains:['chat.openai.com','openai.com'] },
    { id:'github',    name:'GitHub Pro',     icon:'🐙', bg:'#24292F', cat:'Dev Tools',      domains:['github.com'] },
    { id:'dropbox',   name:'Dropbox Plus',   icon:'📁', bg:'#0061FE', cat:'Storage',        domains:['dropbox.com'] },
    { id:'slack',     name:'Slack Pro',      icon:'💬', bg:'#4A154B', cat:'Communication',  domains:['slack.com'] },
    { id:'zoom',      name:'Zoom Pro',       icon:'📹', bg:'#2D8CFF', cat:'Communication',  domains:['zoom.us'] },
  ];

  // ── 3. PURCHASE SIGNAL KEYWORDS ─────────────────────────
  // Checked against URL path + page title
  const BUY_SIGNALS = [
    '/checkout', '/subscribe', '/premium', '/billing',
    '/upgrade', '/plans', '/payment', '/purchase',
    'subscribe', 'subscription', 'checkout', 'payment',
    'billing', 'upgrade', 'premium', 'get premium',
    'try premium', 'start plan', 'start free trial',
    'free trial', 'go premium', 'confirm order',
    'complete purchase', 'add payment', 'enter card',
    'monthly plan', 'annual plan', 'choose plan',
  ];

  // ── 4. DETECT CURRENT SITE ───────────────────────────────
  const hostname = window.location.hostname.toLowerCase();
  const pathQuery = (window.location.pathname + window.location.search).toLowerCase();
  const pageTitle = document.title.toLowerCase();
  const combined  = pathQuery + ' ' + pageTitle;

  // Match against known subscription domains
  let detectedApp = null;
  for (const app of SUB_APPS) {
    if (app.domains.some(d => hostname.includes(d))) {
      detectedApp = app;
      break;
    }
  }
  if (!detectedApp) return; // Not a tracked subscription service

  // Check for purchase intent signals
  const hasBuySignal = BUY_SIGNALS.some(kw => combined.includes(kw));
  if (!hasBuySignal) return; // User is just browsing — don't notify

  // ── 5. BUILD & INJECT NOTIFICATION ──────────────────────
  function getNextMonthDate() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Scan Gmail for matching receipts (if backend available)
  async function scanGmailForReceipt(userId) {
    try {
      // Add ?test=1 for mock data (remove in production)
      const response = await fetch(`https://subtracks-production.up.railway.app/api/scan-gmail/${userId}?test=1`);
      const data = await response.json();
      return data.detections || [];
    } catch (err) {
      console.warn('Gmail scan unavailable:', err.message);
      return [];
    }
  }

  const nextDate = getNextMonthDate();

  // Inject styles
  const style = document.createElement('style');
  style.id = 'sc-detector-styles';
  style.textContent = `
    #sc-notif-wrap {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 2147483647;
      padding: 0 12px max(12px, env(safe-area-inset-bottom));
      transform: translateY(110%);
      transition: transform .44s cubic-bezier(0.175,0.885,0.32,1.275);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #sc-notif-wrap.sc-show { transform: translateY(0); }
    #sc-notif-wrap.sc-shake .sc-card {
      animation: sc-shake .5s ease;
    }
    @keyframes sc-shake {
      0%,100% { transform: translateY(0); }
      20%,60%  { transform: translateY(-5px); }
      40%,80%  { transform: translateY(3px); }
    }
    .sc-card {
      background: linear-gradient(145deg, #0f1e14, #0d1a1f);
      border: 1px solid rgba(34,197,94,0.38);
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 -4px 40px rgba(34,197,94,0.18), 0 24px 60px rgba(0,0,0,0.65);
    }
    .sc-glow-bar {
      height: 2px;
      background: linear-gradient(90deg, transparent, #22c55e, transparent);
      animation: sc-glow 2.5s ease-in-out infinite;
    }
    @keyframes sc-glow {
      0%,100% { opacity:0; transform:scaleX(0); }
      50%      { opacity:1; transform:scaleX(1); }
    }
    .sc-top { display:flex; align-items:center; gap:12px; padding:16px 16px 0; }
    .sc-app-icon {
      width:50px; height:50px; border-radius:14px;
      display:grid; place-items:center; font-size:28px;
      flex:0 0 auto; position:relative;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    .sc-badge {
      position:absolute; top:-5px; right:-5px;
      width:18px; height:18px; border-radius:50%;
      background:#f87171; border:2px solid #0d1a1f;
      display:grid; place-items:center;
      font-size:9px; font-weight:900; color:#fff;
      animation: sc-pop .4s cubic-bezier(0.34,1.56,0.64,1) both;
    }
    @keyframes sc-pop { from{transform:scale(0);} to{transform:scale(1);} }
    .sc-text { flex:1; min-width:0; }
    .sc-source {
      font-size:10px; font-weight:800; letter-spacing:.08em;
      text-transform:uppercase; color:#22c55e; margin-bottom:3px;
    }
    .sc-title { font-size:15px; font-weight:800; color:#fff; line-height:1.25; }
    .sc-sub { font-size:12px; color:#94a3b8; margin-top:3px; line-height:1.4; }
    .sc-autofill {
      margin:12px 16px;
      background:rgba(255,255,255,0.04);
      border:1px solid rgba(255,255,255,0.08);
      border-radius:14px; padding:12px;
    }
    .sc-af-label {
      font-size:10px; font-weight:800; letter-spacing:.1em;
      text-transform:uppercase; color:#64748b; margin-bottom:8px;
    }
    .sc-af-row {
      display:flex; align-items:center; justify-content:space-between;
      gap:8px; margin-bottom:6px;
    }
    .sc-af-row:last-child { margin-bottom:0; }
    .sc-af-key { font-size:11px; color:#94a3b8; }
    .sc-af-val {
      font-size:12px; font-weight:700; color:#22c55e;
      background:rgba(34,197,94,0.10); padding:3px 9px;
      border-radius:999px; border:1px solid rgba(34,197,94,0.2);
    }
    .sc-actions {
      display:grid; grid-template-columns:1fr 1fr;
      gap:8px; padding:10px 16px 16px;
    }
    .sc-btn-add {
      padding:13px; border-radius:14px; border:none;
      font-family:inherit; font-size:13px; font-weight:800;
      background:linear-gradient(135deg,#16a34a,#22c55e);
      color:#fff; cursor:pointer; width:100%;
      box-shadow:0 6px 20px rgba(34,197,94,0.3);
      -webkit-tap-highlight-color:transparent;
      transition:.15s;
    }
    .sc-btn-add:active { transform:scale(0.97); }
    .sc-btn-dismiss {
      padding:13px; border-radius:14px;
      border:1px solid rgba(255,255,255,0.10);
      font-family:inherit; font-size:13px; font-weight:700;
      background:rgba(255,255,255,0.04); color:#94a3b8;
      cursor:pointer; width:100%;
      -webkit-tap-highlight-color:transparent;
      transition:.15s;
    }
    .sc-btn-dismiss:active { transform:scale(0.97); }
  `;
  document.head.appendChild(style);

  // Build notification HTML
  const wrap = document.createElement('div');
  wrap.id = 'sc-notif-wrap';
  wrap.innerHTML = `
    <div class="sc-card">
      <div class="sc-glow-bar"></div>
      <div class="sc-top">
        <div class="sc-app-icon" style="background:${detectedApp.bg};">
          <div class="sc-badge">!</div>
          ${detectedApp.icon}
        </div>
        <div class="sc-text">
          <div class="sc-source">Subtraz · Detected</div>
          <div class="sc-title">Add ${detectedApp.name} subscription?</div>
          <div class="sc-sub">Purchase page detected — log it before you forget.</div>
        </div>
      </div>
      <div class="sc-autofill">
        <div class="sc-af-label">✨ Will auto-fill</div>
        <div class="sc-af-row">
          <span class="sc-af-key">App name</span>
          <span class="sc-af-val">${detectedApp.name}</span>
        </div>
        <div class="sc-af-row">
          <span class="sc-af-key">Next billing</span>
          <span class="sc-af-val">${nextDate}</span>
        </div>
        <div class="sc-af-row">
          <span class="sc-af-key">Category</span>
          <span class="sc-af-val">${detectedApp.cat}</span>
        </div>
      </div>
      <div class="sc-actions">
        <button class="sc-btn-add" id="sc-add-btn">✅ Add Subscription</button>
        <button class="sc-btn-dismiss" id="sc-dis-btn">✕ Dismiss</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // Show with animation (delay slightly so transition fires)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => wrap.classList.add('sc-show'));
  });

  // ── Persistent shake reminder ────────────────────────────
  let shakeInterval = setInterval(() => {
    if (!document.getElementById('sc-notif-wrap')) {
      clearInterval(shakeInterval);
      return;
    }
    wrap.classList.add('sc-shake');
    setTimeout(() => wrap.classList.remove('sc-shake'), 600);
  }, 9000);

  // ── Action: Add to Subtraz ─────────────────────────────
  document.getElementById('sc-add-btn').addEventListener('click', async function () {
    clearInterval(shakeInterval);
    
    // Try to scan Gmail for receipts first
    const userId = localStorage.getItem('subtracks-user-id') || 'guest';
    const gmailDetections = await scanGmailForReceipt(userId);
    
    let subscriptionsToAdd = [];
    
    // If Gmail scan worked, use those
    if (gmailDetections && gmailDetections.length > 0) {
      subscriptionsToAdd = gmailDetections;
    } else {
      // Fallback: use current page detection
      subscriptionsToAdd = [{
        serviceName: detectedApp.name,
        billingDate: nextDate,
        cycle: 'monthly',
        category: detectedApp.cat,
      }];
    }
    
    // Redirect to Subtraz with autofill params
    const params = new URLSearchParams({
      subscriptions: JSON.stringify(subscriptionsToAdd),
      auto: '1',
      source: window.location.hostname,
    });
    
    const subchecksURL = 'https://subtraz.top/index.html#/app/subscriptions/add?' + params.toString();
    wrap.classList.remove('sc-show');
    
    setTimeout(() => {
      try { wrap.remove(); } catch(_) {}
      window.location.href = subchecksURL;
    }, 320);
  });

  // ── Action: Dismiss (only dismisses on tap) ──────────────
  document.getElementById('sc-dis-btn').addEventListener('click', function () {
    clearInterval(shakeInterval);
    wrap.classList.remove('sc-show');
    setTimeout(() => { try { wrap.remove(); } catch(_) {} }, 400);
  });

  // ── Block accidental back navigation while visible ───────
  // Re-shake if user tries to scroll away (reminder)
  let scrollTimeout;
  window.addEventListener('scroll', function onScroll() {
    if (!document.getElementById('sc-notif-wrap')) {
      window.removeEventListener('scroll', onScroll);
      return;
    }
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      wrap.classList.add('sc-shake');
      setTimeout(() => wrap.classList.remove('sc-shake'), 600);
    }, 400);
  }, { passive: true });

})();