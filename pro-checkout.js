 const TALLY_FORM_URL = "https://tally.so/r/wgJKOl"; // Replace with your actual Tally form URL for pro activation requests
const STORAGE_KEY = "SubTrack_pending_pro_payment";

const params = new URLSearchParams(location.search);
const passedEmail = params.get("email") || "";
const passedName = params.get("name") || "";
const passedUserId = params.get("user_id") || "";

const SubTrackEmail = document.getElementById("SubTrackEmail");
const feedbackText = document.getElementById("feedbackText");
const payBtn = document.getElementById("payBtn");
const payBtnLeft = document.getElementById("payBtnLeft");
const backBtn = document.getElementById("backBtn");
const message = document.getElementById("message");
const activationPopup = document.getElementById("activationPopup");

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
  message.textContent = text;
  message.classList.add("show");
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

function saveDetails() {
  const data = {
    SubTrackEmail: SubTrackEmail.value.trim(),
    feedback: feedbackText.value.trim(),
    userId: passedUserId,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

function updateReady() {
  const emailOk = validEmail(SubTrackEmail.value.trim());
  const feedbackOk = feedbackText.value.trim().length >= 3;
  const ready = emailOk && feedbackOk;
  const label = ready ? "Submit & Activate Pro — Free ✓" : "Enter your details above first";
  payBtn.disabled = !ready;
  payBtn.textContent = label;
  if (payBtnLeft) {
    payBtnLeft.disabled = !ready;
    payBtnLeft.textContent = label;
    payBtnLeft.style.background = ready ? "#16a34a" : "#e2e8f0";
    payBtnLeft.style.color = ready ? "#fff" : "#94a3b8";
  }
}

function showActivationPopup() {
  activationPopup.style.display = "flex";
}

function boot() {
  const saved = loadSaved();
  SubTrackEmail.value = saved.SubTrackEmail || passedEmail || "";
  feedbackText.value = saved.feedback || "";
  document.getElementById("displayName").textContent = passedName || "SubChecks user";
  document.getElementById("displayEmail").textContent = SubTrackEmail.value || "Confirm your Gmail below";
  document.getElementById("avatar").textContent = initials(passedName || SubTrackEmail.value || "SC");
  updateReady();

  // Fix logo
  const logoEls = document.querySelectorAll(".logo");
  logoEls.forEach(logo => {
    logo.innerHTML = '<img src="https://i.imgur.com/gZLFHsa.png" alt="SubChecks" style="width:100%;height:100%;object-fit:contain;border-radius:inherit;">';
  });
}

SubTrackEmail.addEventListener("input", () => {
  document.getElementById("displayEmail").textContent = SubTrackEmail.value || "Confirm your Gmail below";
  document.getElementById("avatar").textContent = initials(passedName || SubTrackEmail.value || "SC");
  updateReady();
});

feedbackText.addEventListener("input", updateReady);

payBtn.addEventListener("click", handleSubmit);
if (payBtnLeft) payBtnLeft.addEventListener("click", handleSubmit);

async function handleSubmit() {
  const data = saveDetails();

  if (!validEmail(data.SubTrackEmail)) {
    showMessage("Please enter your SubChecks Gmail first.");
    return;
  }
  if (!data.feedback || data.feedback.length < 3) {
    showMessage("Please add a quick bit of feedback — it really helps!");
    return;
  }

  // Submit to Tally
  const tallyUrl =
    TALLY_FORM_URL +
    "?SubTrack_email=" + encodeURIComponent(data.SubTrackEmail) +
    "&feedback=" + encodeURIComponent(data.feedback) +
    "&user_id=" + encodeURIComponent(data.userId || "");

  // Open Tally in background then show popup
  window.open(tallyUrl, "_blank", "noopener,noreferrer");

  // Show activation pending popup
  showActivationPopup();
}

backBtn.addEventListener("click", () => {
  location.href = "testing.html#/app/billing";
});

boot();