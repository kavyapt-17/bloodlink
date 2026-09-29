// ====== Config ======
const API = "http://localhost:8080/api/donors";   // change if your backend runs elsewhere
const COOLDOWN_DAYS = 90;                          // same rule as DonorService

const GROUPS = [
  ["A_POSITIVE", "A+"], ["A_NEGATIVE", "A\u2212"],
  ["B_POSITIVE", "B+"], ["B_NEGATIVE", "B\u2212"],
  ["AB_POSITIVE", "AB+"], ["AB_NEGATIVE", "AB\u2212"],
  ["O_POSITIVE", "O+"], ["O_NEGATIVE", "O\u2212"],
];
const labelOf = code => (GROUPS.find(g => g[0] === code) || [code, code])[1];

// ====== Helpers ======
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fmtDate = d => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const parseDate = iso => new Date(iso + "T00:00:00");
const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const eligibleFrom = iso => { const d = parseDate(iso); d.setDate(d.getDate() + COOLDOWN_DAYS); return d; };

class ApiError extends Error {
  constructor(message, status, fields) { super(message); this.status = status; this.fields = fields || null; }
}

// Handles your GlobalExceptionHandler shape: { message, status, timestamp, errors? }
async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...options });
  } catch {
    throw new ApiError("Can't reach the server. Check that the backend is running on port 8080.", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message || `Request failed (${res.status})`, res.status, data?.errors);
  return data;
}

let toastTimer;
function toast(msg, bad = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("bad", bad);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 4500);
}

// ====== Tabs ======
function showTab(name) {
  $$("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === name));
  $$(".view").forEach(v => v.hidden = v.id !== "view-" + name);
  if (name === "all") loadAll();
}
$$("[data-tab]").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ====== Blood group tiles (with live donor counts) ======
function renderTiles(counts = {}) {
  const selected = $("input[name=bg]:checked")?.value;
  $("#tiles").innerHTML = GROUPS.map(([code, label]) => `
    <label class="tile">
      <input type="radio" name="bg" value="${code}" ${selected === code ? "checked" : ""}>
      <span><b>${label}</b><small>${counts[code] ?? "\u2013"} registered</small></span>
    </label>`).join("");
}
async function loadCounts() {
  try {
    const rows = await Promise.all(GROUPS.map(([code]) => api(`/count?bloodGroup=${code}`)));
    const counts = {};
    rows.forEach(r => counts[r.bloodGroup] = r.count);
    renderTiles(counts);
  } catch { /* counts are a nice-to-have; search errors will explain connection problems */ }
}

// ====== Donor card (shared by search + all donors) ======
function donorCard(d) {
  const code = d.bloodGroup?.code;
  const until = !d.available && d.lastDonationDate ? fmtDate(eligibleFrom(d.lastDonationDate)) : null;
  const last = d.lastDonationDate ? `Last donated ${fmtDate(parseDate(d.lastDonationDate))}` : "Has not donated yet";
  return `
  <li class="donor ${d.available ? "" : "rest"}">
    <span class="bg" aria-label="Blood group ${esc(labelOf(code))}">${esc(labelOf(code))}</span>
    <div class="who">
      <strong>${esc(d.name)}</strong>
      <span class="meta">${esc(d.city)}</span>
      <span class="meta"><a href="tel:${esc(d.phone)}">${esc(d.phone)}</a></span>
      <span class="meta">${last}</span>
      <span class="status ${d.available ? "ok" : "wait"}">${d.available ? "Available to donate" : "Resting until " + until}</span>
    </div>
    <button class="ghost" data-donate="${d.id}" data-name="${esc(d.name)}">Record donation</button>
  </li>`;
}

// ====== Search ======
let lastSearch = null;
async function runSearch() {
  const { bloodGroup, city } = lastSearch;
  const box = $("#results");
  box.innerHTML = `<p class="count">Searching\u2026</p>`;
  try {
    const list = await api(`/search?bloodGroup=${bloodGroup}&city=${encodeURIComponent(city)}`);
    if (!list.length) {
      box.innerHTML = `<div class="empty"><p>No available ${labelOf(bloodGroup)} donors in ${esc(city)}.</p>
        <p>Check the spelling, try a nearby city, or search another blood group.</p></div>`;
      return;
    }
    box.innerHTML = `<p class="count">${list.length} available ${labelOf(bloodGroup)} donor${list.length > 1 ? "s" : ""} in ${esc(city)}</p>
      <ul class="list">${list.map(donorCard).join("")}</ul>`;
  } catch (e) {
    box.innerHTML = "";
    $("#search-err").textContent = e.message;
  }
}
$("#search-form").addEventListener("submit", e => {
  e.preventDefault();
  const bloodGroup = $("input[name=bg]:checked")?.value;
  const city = $("#s-city").value.trim();
  const err = $("#search-err");
  err.textContent = "";
  if (!bloodGroup) return err.textContent = "Choose a blood group.";
  if (!city) return err.textContent = "Enter a city.";
  lastSearch = { bloodGroup, city };
  runSearch();
});

// ====== Register ======
const regForm = $("#reg-form");
$("select[name=bloodGroup]", regForm).innerHTML =
  `<option value="">Select</option>` + GROUPS.map(([c, l]) => `<option value="${c}">${l}</option>`).join("");
$("input[name=lastDonationDate]", regForm).max = todayISO();

function setFieldErrors(errors = {}) {
  $$(".err[data-for]", regForm).forEach(s => {
    const msg = errors[s.dataset.for] || "";
    s.textContent = msg;
    $(`[name=${s.dataset.for}]`, regForm).classList.toggle("invalid", !!msg);
  });
}

regForm.addEventListener("submit", async e => {
  e.preventDefault();
  $("#reg-err").textContent = "";
  const f = Object.fromEntries(new FormData(regForm));
  const payload = {
    name: f.name.trim(), phone: f.phone.trim(), city: f.city.trim(),
    bloodGroup: f.bloodGroup, lastDonationDate: f.lastDonationDate || null,
  };

  // quick client-side checks (server validates again)
  const errs = {};
  if (payload.name.length < 2) errs.name = "Enter your full name";
  if (!/^[0-9]{10}$/.test(payload.phone)) errs.phone = "Phone must be exactly 10 digits";
  if (!payload.city) errs.city = "Enter your city";
  if (!payload.bloodGroup) errs.bloodGroup = "Select a blood group";
  setFieldErrors(errs);
  if (Object.keys(errs).length) return;

  const btn = $("button[type=submit]", regForm);
  btn.disabled = true;
  try {
    const donor = await api("", { method: "POST", body: JSON.stringify(payload) });
    regForm.reset();
    setFieldErrors();
    toast(donor.available
      ? `${donor.name} is registered and available to donate.`
      : `${donor.name} is registered and can donate again on ${fmtDate(eligibleFrom(donor.lastDonationDate))}.`);
    loadCounts();
  } catch (err) {
    if (err.fields) setFieldErrors(err.fields);          // "Validation failed" from the server
    else $("#reg-err").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ====== All donors ======
let allDonors = [];
async function loadAll() {
  const box = $("#all-list");
  try {
    allDonors = await api("");
    renderAll();
  } catch (e) {
    box.innerHTML = `<div class="empty"><p>${esc(e.message)}</p></div>`;
  }
}
function renderAll() {
  const q = $("#f-text").value.trim().toLowerCase();
  const st = $("#f-status").value;
  const rows = allDonors.filter(d =>
    (!q || d.name.toLowerCase().includes(q) || d.city.toLowerCase().includes(q)) &&
    (st === "all" || (st === "yes") === d.available));
  $("#all-list").innerHTML = !allDonors.length
    ? `<div class="empty"><p>No donors registered yet.</p><p>Use Register to add the first one.</p></div>`
    : !rows.length
      ? `<div class="empty"><p>No donors match this filter.</p></div>`
      : `<p class="count">${rows.length} donor${rows.length > 1 ? "s" : ""}</p><ul class="list">${rows.map(donorCard).join("")}</ul>`;
}
$("#f-text").addEventListener("input", renderAll);
$("#f-status").addEventListener("change", renderAll);

// ====== Record donation (works from any list) ======
document.addEventListener("click", async e => {
  const btn = e.target.closest("[data-donate]");
  if (!btn) return;
  if (!confirm(`Record a donation today for ${btn.dataset.name}? They will be unavailable for ${COOLDOWN_DAYS} days.`)) return;
  btn.disabled = true;
  try {
    const rec = await api(`/${btn.dataset.donate}/donate`, { method: "POST" });
    toast(`Donation recorded. ${btn.dataset.name} can donate again on ${fmtDate(eligibleFrom(rec.donationDate))}.`);
    if (lastSearch) runSearch();
    if (!$("#view-all").hidden) loadAll();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
});

// ====== Init ======
renderTiles();
loadCounts();
