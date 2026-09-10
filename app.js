/* =========================================================
   Tania's Curated Beauty — booking flow
   1. render treatment menu
   2. 4-step booking modal (treatment → day → time → details)
   3. checks live availability via Google Apps Script
   4. submits booking to Apps Script (sheet + calendar + emails)
   ========================================================= */

const fmtPrice = p => CURRENCY + p.toLocaleString("en-GB");

/* ---------- 1. Render the menu ---------- */
function renderMenu() {
  TREATMENTS.forEach(t => {
    const row = document.createElement("div");
    row.className = "menu-row";
    row.innerHTML = `
      <span class="menu-name">${t.name}</span>
      <span class="menu-duration">${t.minutes} min</span>
      <span class="menu-price">${fmtPrice(t.price)}</span>
      <button class="btn btn-gold menu-book" data-book="${t.id}">Book</button>`;
    document.getElementById("menu-" + t.group).appendChild(row);
  });
}

/* ---------- 2. Modal wiring ---------- */
const modal = document.getElementById("bookingModal");
let chosenTreatment = null, chosenDate = null, chosenTime = null;

function openModal(treatmentId) {
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  chosenTreatment = treatmentId ? TREATMENTS.find(t => t.id === treatmentId) : null;
  chosenDate = chosenTime = null;
  showStep(1);
  const sel = document.getElementById("treatmentSelect");
  sel.innerHTML = TREATMENTS.map(t =>
    `<option value="${t.id}" ${t.id === treatmentId ? "selected" : ""}>${t.name} — ${fmtPrice(t.price)}</option>`).join("");
  sel.value = treatmentId || TREATMENTS[0].id;
  const d = new Date(); d.setDate(d.getDate() + 1);
  const dateInput = document.getElementById("dateInput");
  dateInput.min = d.toISOString().split("T")[0];
  dateInput.value = dateInput.min;
}
function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}
function showStep(n) {
  document.querySelectorAll(".booking-step").forEach(s => s.hidden = +s.dataset.step !== n);
}
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-book]");
  if (btn) { e.preventDefault(); openModal(btn.dataset.book || null); }
});
document.getElementById("modalClose").onclick = closeModal;
document.getElementById("modalDone").onclick = closeModal;
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.querySelectorAll("[data-back]").forEach(b =>
  b.onclick = () => showStep(+b.dataset.back));
document.getElementById("navToggle").onclick = () =>
  document.getElementById("mainNav").classList.toggle("open");

/* step 1 → 2 */
document.getElementById("toStep2").onclick = () => {
  chosenTreatment = TREATMENTS.find(t => t.id === document.getElementById("treatmentSelect").value);
  showStep(2);
};
/* step 2 → 3 */
document.getElementById("toStep3").onclick = () => {
  chosenDate = document.getElementById("dateInput").value;
  if (!chosenDate) return;
  loadSlots();
  showStep(3);
};
/* step 3: fetch availability from Apps Script */
async function loadSlots() {
  const box = document.getElementById("timeSlots");
  const note = document.getElementById("slotNote");
  const next = document.getElementById("toStep4");
  next.disabled = true; chosenTime = null;
  box.innerHTML = SLOT_TIMES.map(t => `<div class="time-slot" data-time="${t}">${t}</div>`).join("");
  note.textContent = "Checking availability…";
  if (APPS_SCRIPT_URL.startsWith("PASTE_")) {
    note.textContent = "Booking system not connected yet — see the setup guide.";
    return;
  }
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "checkSlots", date: chosenDate, minutes: chosenTreatment.minutes, times: SLOT_TIMES })
    });
    const taken = await res.json();
    document.querySelectorAll(".time-slot").forEach(s => {
      if (taken.includes(s.dataset.time)) s.classList.add("taken");
    });
    note.textContent = taken.length === SLOT_TIMES.length
      ? "Fully booked that day — please choose another."
      : "Times shown are available.";
  } catch {
    note.textContent = "Could not check live availability — please try WhatsApp if unsure.";
  }
}
document.getElementById("timeSlots").addEventListener("click", e => {
  const slot = e.target.closest(".time-slot");
  if (!slot || slot.classList.contains("taken")) return;
  document.querySelectorAll(".time-slot").forEach(s => s.classList.remove("selected"));
  slot.classList.add("selected");
  chosenTime = slot.dataset.time;
  document.getElementById("toStep4").disabled = false;
});
/* step 3 → 4 */
document.getElementById("toStep4").onclick = () => {
  const d = new Date(chosenDate + "T" + chosenTime);
  document.getElementById("bookingSummary").innerHTML =
    `<strong>${chosenTreatment.name}</strong><br>${d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})} at ${chosenTime} · ${fmtPrice(chosenTreatment.price)}<br>` +
    `Deposit due: ${fmtPrice(Math.round(chosenTreatment.price * DEPOSIT_PERCENT / 100))}`;
  showStep(4);
};
/* step 4: submit */
document.getElementById("submitBooking").onclick = async () => {
  const err = document.getElementById("formError");
  err.hidden = true;
  const name = document.getElementById("clientName").value.trim();
  const email = document.getElementById("clientEmail").value.trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    err.textContent = "Please enter your name and a valid email address."; err.hidden = false; return;
  }
  if (!document.getElementById("gdprConsent").checked) {
    err.textContent = "Please tick the consent box so I can contact you about your booking."; err.hidden = false; return;
  }
  const btn = document.getElementById("submitBooking");
  btn.disabled = true; btn.textContent = "Booking…";
  const payload = {
    action: "book",
    treatmentId: chosenTreatment.id, treatmentName: chosenTreatment.name,
    price: chosenTreatment.price, depositPercent: DEPOSIT_PERCENT,
    groupKey: chosenTreatment.groupKey, minutes: chosenTreatment.minutes,
    date: chosenDate, time: chosenTime,
    name, email,
    phone: document.getElementById("clientPhone").value.trim(),
    dob: document.getElementById("clientDob").value,
    referralCode: document.getElementById("referralCode").value.trim().toUpperCase(),
  };
  let ok = true;
  if (!APPS_SCRIPT_URL.startsWith("PASTE_")) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
      const out = await res.json();
      ok = out.ok !== false;
    } catch { ok = false; }
  }
  const wa = document.getElementById("waContinue");
  const msg = encodeURIComponent(`Hi Tania ✨, I've just booked ${chosenTreatment.name} on ${chosenDate} at ${chosenTime}. My name is ${name}.`);
  wa.href = `https://wa.me/447388562289?text=${msg}`;
  document.getElementById("successText").innerHTML = ok
    ? `Thank you, <strong>${name.split(" ")[0]}</strong> — your appointment request for <strong>${chosenTreatment.name}</strong> on <strong>${chosenDate} at ${chosenTime}</strong> is in. Check your inbox for confirmation and your deposit link. Once the deposit is paid, your appointment is fully confirmed.`
    : `Thank you, <strong>${name.split(" ")[0]}</strong> — please tap below to send me your booking on WhatsApp and I'll confirm it personally.`;
  showStep(5);
  btn.disabled = false; btn.textContent = "Confirm Booking →";
};

document.getElementById("year").textContent = new Date().getFullYear();
renderMenu();

/* populate the treatment dropdown on page load so it always works */
document.getElementById("treatmentSelect").innerHTML = TREATMENTS.map(t =>
  `<option value="${t.id}">${t.name} — ${fmtPrice(t.price)}</option>`).join("");

/* close the popup with the Escape key as well */
document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeModal(); });
