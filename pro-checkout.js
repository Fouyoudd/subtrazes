 const TALLY_FORM_URL = "https://tally.so/r/wgJKOl"; // Replace with your actual Tally form URL for pro activation requests
const STORAGE_KEY = "subtraz_pending_pro_activation";
const LEGACY_STORAGE_KEY = "SubTrack_pending_pro_payment";

const params = new URLSearchParams(location.search);
const passedEmail = params.get("email") || "";
const passedName = params.get("name") || "";
const passedUserId = params.get("user_id") || "";

const SubtrazEmail = document.getElementById("iEmail") || document.getElementById("SubTrackEmail") || document.getElementById("SubtrazEmail");
const feedbackText = document.getElementById("iFeedback") || document.getElementById("feedbackText");
const payBtn = document.getElementById("orderBtn") || document.getElementById("payBtn");
const payBtnLeft = document.getElementById("leftBtn") || document.getElementById("payBtnLeft");
const backBtn = document.getElementById("backBtn");
const message = document.getElementById("orderMsg") || document.getElementById("message");
const activationPopup = document.getElementById("overlay") || document.getElementById("activationPopup");

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function initials(value) {
  const clean = String(value || "SC").trim();
  if (clean.includes("@")) return clean[0].toUpperCase();
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function showMessage(text) {
  if (!message) return;
  message.textContent = text;
  message.classList.add("show");
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY)) || {}; } catch { return {}; }
}

function saveDetails() {
  const data = {
    SubtrazEmail: SubtrazEmail.value.trim(),
    feedback: feedbackText.value.trim(),
    userId: passedUserId,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch {}
  return data;
}

function updateReady() {
  const emailOk = validEmail(SubtrazEmail.value.trim());
  const feedbackOk = feedbackText.value.trim().length >= 3;
  const ready = emailOk && feedbackOk;
  const label = ready ? "Submit and Activate Pro - Free" : "Enter your details above first";
  if (payBtn) {
    payBtn.disabled = !ready;
    payBtn.textContent = label;
  }
  if (payBtnLeft) {
    payBtnLeft.disabled = !ready;
    payBtnLeft.textContent = label;
    payBtnLeft.style.background = ready ? "#16a34a" : "#e2e8f0";
    payBtnLeft.style.color = ready ? "#fff" : "#94a3b8";
  }
}

function showActivationPopup() {
  if (activationPopup) {
    activationPopup.style.display = "flex";
    activationPopup.classList.add("show");
  }
}

function boot() {
  if (!SubtrazEmail || !feedbackText) return;
  const saved = loadSaved();
  SubtrazEmail.value = saved.SubtrazEmail || passedEmail || "";
  feedbackText.value = saved.feedback || "";
  const displayNameEl = document.getElementById("displayName") || document.getElementById("chipName");
  if (displayNameEl) displayNameEl.textContent = passedName || "Subtraz user";
  const displayEmailEl = document.getElementById("displayEmail") || document.getElementById("chipEmail");
  if (displayEmailEl) displayEmailEl.textContent = SubtrazEmail.value || "Confirm your account email below";
  const avatarEl = document.getElementById("avatar") || document.getElementById("chipAv");
  if (avatarEl) avatarEl.textContent = initials(passedName || SubtrazEmail.value || "SC");
  updateReady();

  // Fix logo
  const logoEls = document.querySelectorAll(".logo");
  logoEls.forEach(logo => {
    logo.innerHTML = '<img src="https://i.imgur.com/gZLFHsa.png" alt="Subtraz" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">';
  });
}

SubtrazEmail?.addEventListener("input", () => {
  const displayEmailEl = document.getElementById("displayEmail") || document.getElementById("chipEmail");
  if (displayEmailEl) displayEmailEl.textContent = SubtrazEmail.value || "Confirm your account email below";
  const avatarEl = document.getElementById("avatar") || document.getElementById("chipAv");
  if (avatarEl) avatarEl.textContent = initials(passedName || SubtrazEmail.value || "SC");
  updateReady();
});

feedbackText?.addEventListener("input", updateReady);

payBtn?.addEventListener("click", handleSubmit);
if (payBtnLeft) payBtnLeft.addEventListener("click", handleSubmit);

async function handleSubmit() {
  const data = saveDetails();

  if (!validEmail(data.SubtrazEmail)) {
    showMessage("Please enter your Subtraz account email first.");
    return;
  }
  if (!data.feedback || data.feedback.length < 3) {
    showMessage("Please add a quick bit of feedback - it really helps!");
    return;
  }

  // Submit to Tally
  const tallyUrl =
    TALLY_FORM_URL +
    "?Subtraz_email=" + encodeURIComponent(data.SubtrazEmail) +
    "&feedback=" + encodeURIComponent(data.feedback) +
    "&user_id=" + encodeURIComponent(data.userId || "");

  // Open Tally in background then show popup
  window.open(tallyUrl, "_blank", "noopener,noreferrer");

  // Show activation pending popup
  showActivationPopup();
}

backBtn?.addEventListener("click", () => {
  location.href = "index.html#/app/billing";
});

boot();