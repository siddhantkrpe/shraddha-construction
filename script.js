/* =====================================================
   SHRADDHA CONSTRUCTION TRACKER — script.js
   ===================================================== */
const supabaseClient = supabase.createClient(
  "https://tylyculdznpumldzkexs.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5bHljdWxkem5wdW1sZHprZXhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NTkyMTYsImV4cCI6MjA5NzQzNTIxNn0.Z19aAqWRmcIM81qgkfNnjHkdtVW-veRYa4TqO8NHlYE"
);
// ─── USERS & ROLES ────────────────────────────────────
const USERS = [
  { username: "goraksha karpe", password: "shraddhacnstr", role: "admin"  },
  { username: "ude onkar",  password: "123456789",  role: "viewer" },
];

// Features the viewer role CANNOT access
const VIEWER_BLOCKED = new Set([
  "addSite",      // add / delete sites
  "deleteRecord", // delete records
  "amounts",      // all ₹ amounts hidden
  "mainHeads",    // main heads nav tab
  "importExcel",  // import excel
  // Note: "editRecord" is NOT blocked — viewer CAN add records
]);

const STORAGE_KEY = "sc_workplaces";
const SESSION_KEY = "sc_session";
const ROLE_KEY    = "sc_role";

// ─── STATE ────────────────────────────────────────────
let workplaces       = [];   // [{ id, name, records:[] }]
let currentWPId      = null;
let currentRole      = "admin";
let pieChart         = null;
let selectionMode    = null; // 'edit' | 'delete' | null
let selectedIds      = new Set();
let pendingDeleteIds = [];

// ─── PERMISSION HELPERS ───────────────────────────────
function isAdmin()    { return currentRole === "admin"; }
function can(feature) { return isAdmin() || !VIEWER_BLOCKED.has(feature); }

// ─── INIT ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  setDateDisplay();
  await Promise.all([loadData(), loadRAData()]);
  // Restore session
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    currentRole = sessionStorage.getItem(ROLE_KEY) || "admin";
    showApp();
  }

  // Excel file label sync
  const excelInput = document.getElementById("excelFile");
  if (excelInput) {
    excelInput.addEventListener("change", () => {
      const label = document.getElementById("excelFileName");
      if (label) label.textContent = excelInput.files[0]?.name || "No file chosen";
    });
  }

  // Live search
  ["search", "from", "to", "filterType"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", renderRecords);
  });

  // Select-all checkbox
  const selectAll = document.getElementById("selectAllRecords");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      document.querySelectorAll(".record-checkbox").forEach(cb => {
        cb.checked = selectAll.checked;
        const id = cb.dataset.id;
        if (selectAll.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        cb.closest("tr").classList.toggle("selected-row", selectAll.checked);
      });
    });
  }
});

function setDateDisplay() {
  const el = document.getElementById("currentDate");
  if (!el) return;
  el.textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

// ─── STORAGE ──────────────────────────────────────────
async function loadData() {
  const { data, error } = await supabaseClient.from('workplaces').select();
  if (error) {
    console.error(error);
    workplaces = [];
  } else {
    workplaces = data || [];
  }
}

async function saveData() {
  // Clear the table, then write the current state fresh.
  // Simple and reliable for an app this size — handles adds, edits, and deletes in one go.
  await supabaseClient.from('workplaces').delete().neq('id', '');
  if (workplaces.length > 0) {
    await supabaseClient.from('workplaces').insert(workplaces);
  }
}
// ─── AUTH ─────────────────────────────────────────────
function login() {
  const btn      = document.getElementById("loginBtn");
  const errEl    = document.getElementById("loginError");
  const username = document.getElementById("username").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  errEl.style.display = "none";

  const matched = USERS.find(u => u.username === username && u.password === password);

  if (matched) {
    btn.textContent = "Signing in…";
    btn.disabled    = true;
    setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
      sessionStorage.setItem(ROLE_KEY, matched.role);
      currentRole = matched.role;
      showApp();
      btn.textContent = "Sign In";
      btn.disabled    = false;
    }, 420);
  } else {
    errEl.style.display = "block";
    document.getElementById("password").value = "";
    document.getElementById("password").focus();
    shake(document.querySelector(".login-card"));
  }
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ROLE_KEY);
  currentRole = "admin";
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginPage").style.display = "";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
}

function showApp() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("app").classList.remove("hidden");
  applyRoleUI();
  renderDashboard();
  switchView("dashboard");
}

function togglePassword() {
  const pw = document.getElementById("password");
  pw.type = pw.type === "password" ? "text" : "password";
}

// ─── ROLE-BASED UI ────────────────────────────────────
function applyRoleUI() {
  // Sidebar role label
  const roleLabel = document.getElementById("userRole");
  if (roleLabel) roleLabel.textContent = isAdmin() ? "Boss" : "Employee";

  // Main Heads nav
  const mainHeadsBtn = document.querySelector('[data-view-btn="mainHeadsView"]');
  if (mainHeadsBtn) mainHeadsBtn.style.display = can("mainHeads") ? "" : "none";

  // Add site row (input + button on dashboard)
  const addWpRow = document.getElementById("addWorkplaceRow");
  if (addWpRow) addWpRow.style.display = can("addSite") ? "" : "none";

  // Import Excel row
  const importRow = document.querySelector(".import-row");
  if (importRow) importRow.style.display = can("importExcel") ? "" : "none";

  // Edit / Delete buttons in records table
  const editBtn   = document.getElementById("startEditBtn");
  const deleteBtn = document.getElementById("startDeleteBtn");
  if (editBtn)   editBtn.style.display   = isAdmin() ? "" : "none";
  if (deleteBtn) deleteBtn.style.display = can("deleteRecord") ? "" : "none";

  // Add Record toggle button — viewer CAN add records
  const addRecBtn = document.getElementById("recordToggleBtn");
  if (addRecBtn) addRecBtn.style.display = "";

  // Viewer badge in hero
  const existingBadge = document.getElementById("viewerBadge");
  if (!isAdmin()) {
    if (!existingBadge) {
      const badge = document.createElement("span");
      badge.id          = "viewerBadge";
      badge.className   = "viewer-badge";
      badge.textContent = "👷 Employee";
      document.querySelector(".hero > div")?.appendChild(badge);
    }
  } else {
    existingBadge?.remove();
  }
}

// Block viewer from calling restricted functions directly
function guardAdmin(feature, action) {
  if (!can(feature)) {
    showToast("You don't have permission to do this.", "error");
    return false;
  }
  return true;
}

// ─── VIEW SWITCHING ───────────────────────────────────
function switchView(viewId) {
  // Block viewer from Main Heads
  if (viewId === "mainHeadsView" && !can("mainHeads")) {
    showToast("You don't have access to Main Heads.", "error");
    return;
  }

  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll("[data-view-btn]").forEach(b => b.classList.remove("active"));

  const view = document.getElementById(viewId);
  if (view) view.classList.add("active");

  const btn = document.querySelector(`[data-view-btn="${viewId}"]`);
  if (btn) btn.classList.add("active");

  closeSidebar();

  if (viewId === "dashboard") renderDashboard();
}

// ─── SIDEBAR (MOBILE) ─────────────────────────────────
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarOverlay").classList.toggle("hidden");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.add("hidden");
}

// ─── DASHBOARD ────────────────────────────────────────
function renderDashboard() {
  renderSummaryCards();
  renderWorkplaceCards();
}

function renderSummaryCards() {
  const container = document.getElementById("summaryCards");
  if (!container) return;

  let totalIncome = 0, totalExpense = 0;
  workplaces.forEach(wp => {
    wp.records.forEach(r => {
      if (r.type === "income") totalIncome  += +r.amount;
      else                     totalExpense += +r.amount;
    });
  });
  const net = totalIncome - totalExpense;

  // Viewer sees counts, not amounts
  if (!can("amounts")) {
    container.innerHTML = `
      <div class="summary-card">
        <span>Total Sites</span>
        <strong>${workplaces.length}</strong>
      </div>
      <div class="summary-card">
        <span>Total Records</span>
        <strong>${workplaces.reduce((s, wp) => s + wp.records.length, 0)}</strong>
      </div>
      <div class="summary-card">
        <span>Access Level</span>
        <strong style="font-size:16px;color:var(--muted)">View only</strong>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="summary-card">
      <span>Total Income</span>
      <strong style="color:var(--income)">${fmt(totalIncome)}</strong>
    </div>
    <div class="summary-card">
      <span>Total Expense</span>
      <strong style="color:var(--expense)">${fmt(totalExpense)}</strong>
    </div>
    <div class="summary-card">
      <span>Net Balance</span>
      <strong style="color:${net >= 0 ? 'var(--income)' : 'var(--expense)'}">${fmt(net)}</strong>
    </div>`;
}

function renderWorkplaceCards() {
  const container = document.getElementById("wps");
  if (!container) return;

  if (workplaces.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-state-icon">🏗️</span>
        No sites yet. Add your first workplace above.
      </div>`;
    return;
  }

  container.innerHTML = workplaces.map(wp => {
    const income  = wp.records.filter(r => r.type === "income").reduce((s, r) => s + +r.amount, 0);
    const expense = wp.records.filter(r => r.type === "expense").reduce((s, r) => s + +r.amount, 0);
    const net     = income - expense;

    // Viewer: show record count instead of amounts
    const amountHTML = can("amounts")
      ? `<div class="amount" style="color:${net >= 0 ? 'var(--income)' : 'var(--expense)'}">
           ${fmt(net)}
         </div>`
      : `<div class="amount" style="color:var(--muted);font-size:15px;font-weight:600;">
           ${wp.records.length} record${wp.records.length !== 1 ? 's' : ''}
         </div>`;

    const deleteBtn = can("addSite")
      ? `<button class="icon-btn danger-btn"
           style="min-width:32px;min-height:32px;padding:6px 8px;font-size:13px;"
           onclick="deleteWP(event,'${wp.id}')" title="Delete site">✕</button>`
      : "";

    return `
      <div class="site-card" onclick="openWorkplace('${wp.id}')">
        <div class="card-top">
          <div>
            <h3>${escHtml(wp.name)}</h3>
            <p class="muted-sm" style="margin-top:4px">
              ${wp.records.length} record${wp.records.length !== 1 ? 's' : ''}
            </p>
          </div>
          ${deleteBtn}
        </div>
        ${amountHTML}
      </div>`;
  }).join("");
}

// ─── WORKPLACE CRUD ───────────────────────────────────
function addWP() {
  if (!guardAdmin("addSite")) return;

  const input = document.getElementById("wpInput");
  const name  = input.value.trim();
  if (!name) { input.focus(); shake(input); return; }

  const exists = workplaces.some(w => w.name.toLowerCase() === name.toLowerCase());
  if (exists) { showToast("A site with that name already exists.", "error"); return; }

  workplaces.push({ id: uid(), name, records: [] });
  saveData();
  input.value = "";
  renderDashboard();
  showToast(`"${name}" site added ✓`, "success");
}

function deleteWP(e, id) {
  e.stopPropagation();
  if (!guardAdmin("addSite")) return;

  const wp = workplaces.find(w => w.id === id);
  if (!wp) return;
  if (!confirm(`Delete site "${wp.name}" and all its records? This cannot be undone.`)) return;

  workplaces = workplaces.filter(w => w.id !== id);
  saveData();
  renderDashboard();
  showToast(`"${wp.name}" deleted.`);

  if (currentWPId === id) {
    currentWPId = null;
    document.getElementById("workspaceNavBtn").disabled = true;
    switchView("dashboard");
  }
}

// ─── OPEN WORKPLACE ───────────────────────────────────
function openWorkplace(id) {
  currentWPId = id;
  const wp = workplaces.find(w => w.id === id);
  if (!wp) return;

  document.getElementById("title").textContent = wp.name;
  document.getElementById("workspaceNavBtn").disabled = false;

  cancelRecordSelection();
  closeSearch();
  document.getElementById("date").value = todayISO();

  switchView("workplace");
  applyRoleUI();   // re-apply so workspace buttons reflect role
  renderRecords();
  renderChart();
}

function openCurrentWorkspace() {
  if (currentWPId) openWorkplace(currentWPId);
}

// ─── RECORD FORM ──────────────────────────────────────
function toggleRecordPanel() {

  const card = document.getElementById("recordcard");
  const btn  = document.getElementById("recordToggleBtn");
  const isOpen = card.classList.contains("show") || getComputedStyle(card).display !== "none";

  if (isOpen) {
    card.classList.remove("show");
    card.style.display = "none";
    btn.textContent = "+ Add Record";
  } else {
    card.classList.add("show");
    card.style.display = "grid";
    btn.textContent = "✕ Close Form";
    document.getElementById("amt").focus();
  }
}

function addRec() {

  const amt  = document.getElementById("amt").value.trim();
  const date = document.getElementById("date").value;
  const head = document.getElementById("head").value.trim();

  let valid = true;
  if (!amt || isNaN(+amt) || +amt <= 0) { showFieldError("amt",  "amtErr",  true); valid = false; }
  else showFieldError("amt", "amtErr", false);
  if (!date)  { showFieldError("date", "dateErr", true); valid = false; }
  else showFieldError("date", "dateErr", false);
  if (!head)  { showFieldError("head", "headErr", true); valid = false; }
  else showFieldError("head", "headErr", false);
  if (!valid) return;

  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;

  const photoFile = document.getElementById("photo").files[0];

  const saveRecord = (photoData) => {
    wp.records.push({
      id:     uid(),
      amount: +amt,
      date,
      head,
      note:   document.getElementById("note").value.trim(),
      medium: document.getElementById("medium").value,
      bank:   document.getElementById("bank").value,
      type:   document.getElementById("type").value,
      photo:  photoData || null,
    });
    saveData();
    resetRecordForm();
    renderRecords();
    renderChart();
    renderDashboard();
    showToast("Record saved ✓", "success");
  };

  if (photoFile) {
    const reader = new FileReader();
    reader.onload = e => saveRecord(e.target.result);
    reader.readAsDataURL(photoFile);
  } else {
    saveRecord(null);
  }
}

function showFieldError(inputId, errId, show) {
  const input = document.getElementById(inputId);
  const err   = document.getElementById(errId);
  if (show) {
    input?.classList.add("invalid");
    if (err) err.style.display = "block";
  } else {
    input?.classList.remove("invalid");
    if (err) err.style.display = "none";
  }
}

function resetRecordForm() {
  ["amt", "head", "note"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("date").value   = todayISO();
  document.getElementById("medium").value = "Cash";
  document.getElementById("bank").value   = "SBI";
  document.getElementById("type").value   = "income";
  document.getElementById("photo").value  = "";
  ["amt", "date", "head"].forEach(id => showFieldError(id, id + "Err", false));
}

// ─── RENDER RECORDS TABLE ─────────────────────────────
function renderRecords() {
  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;

  const tbody    = document.getElementById("recs");
  const countEl  = document.getElementById("recordCount");
  const filtered = getFilteredRecords(wp.records);

  countEl.textContent = `${filtered.length} record${filtered.length !== 1 ? "s" : ""}`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          <span class="empty-state-icon">📋</span>
          No records found.
        </td>
      </tr>`;
    return;
  }

  const inSelectMode = selectionMode !== null;
  const showAmounts  = can("amounts");

  tbody.innerHTML = filtered.map(r => {
    const isSelected = selectedIds.has(r.id);
    return `
      <tr class="${isSelected ? "selected-row" : ""}" data-id="${r.id}">
        <td class="select-col" style="display:${inSelectMode ? "table-cell" : "none"}">
          <input type="checkbox" class="record-checkbox" data-id="${r.id}"
            ${isSelected ? "checked" : ""}
            onchange="toggleSelectRecord('${r.id}', this)">
        </td>
        <td>${formatDate(r.date)}</td>
        <td>${escHtml(r.head)}</td>
        <td>${escHtml(r.note || "—")}</td>
        <td class="money">${showAmounts ? fmt(r.amount) : "••••"}</td>
        <td>${escHtml(r.medium || "—")}</td>
        <td>${escHtml(r.bank || "—")}</td>
        <td><span class="badge badge-${r.type}">${r.type}</span></td>
        <td style="text-align:center">
          ${r.photo
            ? `<img src="${r.photo}" class="thumb" onclick="openImage('${r.id}')" alt="Record image">`
            : `<span class="muted-sm">—</span>`}
        </td>
      </tr>`;
  }).join("");
}

function getFilteredRecords(records) {
  const q    = (document.getElementById("search")?.value || "").toLowerCase();
  const from = document.getElementById("from")?.value;
  const to   = document.getElementById("to")?.value;
  const type = document.getElementById("filterType")?.value;

  return records.filter(r => {
    if (q && !r.head.toLowerCase().includes(q) && !(r.note || "").toLowerCase().includes(q)) return false;
    if (from && r.date < from) return false;
    if (to   && r.date > to)   return false;
    if (type && r.type !== type) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

// ─── SEARCH PANEL ─────────────────────────────────────
function toggleSearch() {
  const panel = document.getElementById("searchPanel");
  const btn   = document.getElementById("searchToggleBtn");
  const open  = panel.classList.contains("open");
  panel.classList.toggle("open", !open);
  btn.textContent = open ? "🔍 Search" : "✕ Close Search";
  if (!open) document.getElementById("search").focus();
}

function closeSearch() {
  document.getElementById("searchPanel")?.classList.remove("open");
  const btn = document.getElementById("searchToggleBtn");
  if (btn) btn.textContent = "🔍 Search";
}

function clearSearch() {
  ["search", "from", "to"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("filterType").value = "";
  renderRecords();
}

// ─── SELECTION MODE ───────────────────────────────────
function startRecordSelection(mode) {
  if (mode === "edit"   && !isAdmin())           { showToast("You don't have permission to edit records.",   "error"); return; }
  if (mode === "delete" && !can("deleteRecord")) { showToast("You don't have permission to delete records.", "error"); return; }

  selectionMode = mode;
  selectedIds.clear();

  document.getElementById("selectColHeader").style.display    = "table-cell";
  document.getElementById("startEditBtn").style.display       = "none";
  document.getElementById("startDeleteBtn").style.display     = "none";
  document.getElementById("confirmSelectionBtn").style.display = "";
  document.getElementById("cancelSelectionBtn").style.display  = "";
  document.getElementById("confirmSelectionBtn").textContent   =
    mode === "delete" ? "Delete Selected" : "Edit Selected";

  renderRecords();
}

function cancelRecordSelection() {
  selectionMode = null;
  selectedIds.clear();

  document.getElementById("selectColHeader").style.display     = "none";
  document.getElementById("startEditBtn").style.display        = isAdmin() ? "" : "none";
  document.getElementById("startDeleteBtn").style.display      = can("deleteRecord") ? "" : "none";
  document.getElementById("confirmSelectionBtn").style.display = "none";
  document.getElementById("cancelSelectionBtn").style.display  = "none";

  const selectAll = document.getElementById("selectAllRecords");
  if (selectAll) selectAll.checked = false;

  renderRecords();
}

function toggleSelectRecord(id, checkbox) {
  if (checkbox.checked) {
    selectedIds.add(id);
    checkbox.closest("tr").classList.add("selected-row");
  } else {
    selectedIds.delete(id);
    checkbox.closest("tr").classList.remove("selected-row");
  }
}

function confirmRecordSelection() {
  if (selectedIds.size === 0) { showToast("Select at least one record.", "error"); return; }

  if (selectionMode === "delete") {
    pendingDeleteIds = [...selectedIds];
    const count = pendingDeleteIds.length;
    document.getElementById("deleteModalMsg").textContent =
      `Delete ${count} record${count !== 1 ? "s" : ""}? This cannot be undone.`;
    document.getElementById("deleteModal").classList.remove("hidden");

  } else if (selectionMode === "edit") {
    if (selectedIds.size !== 1) { showToast("Select exactly one record to edit.", "error"); return; }
    editRecord([...selectedIds][0]);
  }
}

function closeDeleteModal() {
  document.getElementById("deleteModal").classList.add("hidden");
  pendingDeleteIds = [];
}

function proceedDelete() {
  if (!can("deleteRecord")) { showToast("Permission denied.", "error"); return; }
  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;
  const count = pendingDeleteIds.length;
  wp.records = wp.records.filter(r => !pendingDeleteIds.includes(r.id));
  saveData();
  closeDeleteModal();
  cancelRecordSelection();
  renderRecords();
  renderChart();
  renderDashboard();
  showToast(`${count} record${count !== 1 ? "s" : ""} deleted.`);
}

function editRecord(id) {
  if (!isAdmin()) { showToast("Permission denied.", "error"); return; }
  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;
  const r = wp.records.find(rec => rec.id === id);
  if (!r) return;

  document.getElementById("amt").value    = r.amount;
  document.getElementById("date").value   = r.date;
  document.getElementById("head").value   = r.head;
  document.getElementById("note").value   = r.note || "";
  document.getElementById("medium").value = r.medium || "Cash";
  document.getElementById("bank").value   = r.bank || "SBI";
  document.getElementById("type").value   = r.type;

  wp.records = wp.records.filter(rec => rec.id !== id);
  saveData();

  const card = document.getElementById("recordcard");
  card.classList.add("show");
  card.style.display = "grid";
  document.getElementById("recordToggleBtn").textContent = "✕ Close Form";

  cancelRecordSelection();
  renderRecords();
  showToast("Record loaded for editing. Save to update.", "success");
  window.scrollTo({ top: card.offsetTop - 20, behavior: "smooth" });
}

// ─── CHART ────────────────────────────────────────────
function renderChart() {
  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;

  const chartEmpty = document.getElementById("chartEmpty");
  const canvas     = document.getElementById("pieChart");

  // Viewer doesn't see amounts on chart either
  if (!can("amounts")) {
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    chartEmpty.style.display = "";
    chartEmpty.textContent   = "Chart hidden for viewer accounts.";
    canvas.style.display     = "none";
    return;
  }

  const income  = wp.records.filter(r => r.type === "income").reduce((s, r) => s + +r.amount, 0);
  const expense = wp.records.filter(r => r.type === "expense").reduce((s, r) => s + +r.amount, 0);

  if (income === 0 && expense === 0) {
    chartEmpty.style.display = "";
    chartEmpty.textContent   = "No data to chart yet.";
    canvas.style.display     = "none";
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    return;
  }

  chartEmpty.style.display = "none";
  canvas.style.display     = "";

  if (pieChart) pieChart.destroy();

  pieChart = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels: ["Income", "Expense"],
      datasets: [{
        data: [income, expense],
        backgroundColor: ["rgba(21,128,61,0.85)", "rgba(220,38,38,0.82)"],
        borderColor:     ["#15803d", "#dc2626"],
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 12, weight: "700" }, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}` } }
      }
    }
  });
}

// ─── MAIN HEADS ───────────────────────────────────────
function openMainHeads() {
  if (!can("mainHeads")) { showToast("You don't have access to Main Heads.", "error"); return; }

  const headMap = {};
  workplaces.forEach(wp => {
    wp.records.forEach(r => {
      const key = r.head.trim().toLowerCase();
      if (!headMap[key]) headMap[key] = { name: r.head.trim(), income: 0, expense: 0, count: 0 };
      headMap[key].count++;
      if (r.type === "income") headMap[key].income  += +r.amount;
      else                     headMap[key].expense += +r.amount;
    });
  });

  const container = document.getElementById("mainHeads");
  const heads     = Object.values(headMap).sort((a, b) => a.name.localeCompare(b.name));

  if (heads.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-state-icon">🗂️</span>
        No records yet. Add records across your sites to see heads here.
      </div>`;
  } else {
    container.innerHTML = heads.map(h => {
      const net = h.income - h.expense;
      return `
        <div class="site-card" onclick="openHeadRecords('${escAttr(h.name)}')">
          <div class="card-top">
            <div>
              <h3>${escHtml(h.name)}</h3>
              <p class="muted-sm" style="margin-top:4px">${h.count} record${h.count !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div class="amount" style="color:${net >= 0 ? "var(--income)" : "var(--expense)"}">
            ${fmt(net)}
          </div>
        </div>`;
    }).join("");
  }

  switchView("mainHeadsView");
}

function openHeadRecords(headName) {
  document.getElementById("headTitle").textContent = headName;
  const tbody = document.getElementById("headRecs");
  const rows  = [];

  workplaces.forEach(wp => {
    wp.records
      .filter(r => r.head.trim().toLowerCase() === headName.trim().toLowerCase())
      .forEach(r => rows.push({ ...r, wpName: wp.name }));
  });

  rows.sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No records for this head.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${formatDate(r.date)}</td>
        <td>${escHtml(r.wpName)}</td>
        <td>${escHtml(r.head)}</td>
        <td>${escHtml(r.note || "—")}</td>
        <td class="money">${fmt(r.amount)}</td>
        <td><span class="badge badge-${r.type}">${r.type}</span></td>
      </tr>`).join("");
  }

  switchView("headRecordsView");
}

// ─── IMAGE MODAL ──────────────────────────────────────
function openImage(recordId) {
  let photoData = null;
  for (const wp of workplaces) {
    const r = wp.records.find(r => r.id === recordId);
    if (r?.photo) { photoData = r.photo; break; }
  }
  if (!photoData) return;
  document.getElementById("modalImage").src = photoData;
  document.getElementById("imageModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeImage() {
  document.getElementById("imageModal").classList.add("hidden");
  document.body.style.overflow = "";
}

// ─── EXCEL EXPORT ─────────────────────────────────────
function downloadWorkspaceExcel() {
  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;
  if (wp.records.length === 0) { showToast("No records to export.", "error"); return; }

  const rows = wp.records
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(r => ({
      Date:   r.date,
      Head:   r.head,
      Note:   r.note || "",
      Amount: can("amounts") ? r.amount : "hidden",
      Medium: r.medium,
      Bank:   r.bank,
      Type:   r.type,
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Records");
  XLSX.writeFile(wb, `${wp.name}_records.xlsx`);
  showToast("Excel exported ✓", "success");
}

// ─── EXCEL IMPORT ─────────────────────────────────────
function importExcel() {
  if (!can("importExcel")) { showToast("You don't have permission to import.", "error"); return; }

  const file = document.getElementById("excelFile").files[0];
  if (!file) { showToast("Choose an Excel file first.", "error"); return; }

  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      let imported = 0;

      rows.forEach(row => {
        const amount = parseFloat(row.Amount || row.amount || 0);
        const date   = sanitizeDate(row.Date || row.date || "");
        const head   = String(row.Head || row.head || "").trim();
        const type   = (row.Type || row.type || "expense").toLowerCase();
        if (!amount || !head) return;

        wp.records.push({
          id:     uid(),
          amount,
          date:   date || todayISO(),
          head,
          note:   String(row.Note || row.note || "").trim(),
          medium: String(row.Medium || row.medium || "Cash").trim(),
          bank:   String(row.Bank || row.bank || "SBI").trim(),
          type:   ["income", "expense"].includes(type) ? type : "expense",
          photo:  null,
        });
        imported++;
      });

      saveData();
      renderRecords();
      renderChart();
      renderDashboard();

      document.getElementById("excelFile").value = "";
      document.getElementById("excelFileName").textContent = "No file chosen";

      showToast(`${imported} record${imported !== 1 ? "s" : ""} imported ✓`, "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to read Excel file.", "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

// ─── HELPERS ──────────────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function fmt(n) {
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {
  return String(str).replace(/'/g, "\\'");
}

function sanitizeDate(val) {
  if (!val) return "";
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split("/");
    return `${y}-${m}-${d}`;
  }
  return "";
}

// ─── TOAST ────────────────────────────────────────────
let toastTimer = null;

function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className   = "toast" + (type ? ` ${type}` : "");
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

// ─── SHAKE ────────────────────────────────────────────
function shake(el) {
  if (!el) return;
  el.style.animation = "none";
  el.offsetHeight;
  el.style.animation = "shake 0.38s ease";
  setTimeout(() => el.style.animation = "", 400);
}

(function injectShake() {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      18%     { transform: translateX(-7px); }
      36%     { transform: translateX(7px); }
      54%     { transform: translateX(-5px); }
      72%     { transform: translateX(5px); }
    }
    .viewer-badge {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 12px;
      border-radius: 999px;
      background: rgba(255,255,255,0.18);
      color: rgba(255,255,255,0.85);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
  `;
  document.head.appendChild(style);
})();

// ─── KEYBOARD SHORTCUTS ───────────────────────────────
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeImage();
    closeDeleteModal();
    closeSidebar();
  }
});

// ═══════════════════════════════════════════════════════
//   RA BILLS
// ═══════════════════════════════════════════════════════
let raBills = [];

async function loadRAData() {
  const { data, error } = await supabaseClient.from('ra_bills').select();
  if (error) {
    console.error('RA Bills load error:', error);
    raBills = [];
  } else {
    // Map snake_case DB columns back to camelCase used in the app
    raBills = (data || []).map(b => ({
      id:         b.id,
      date:       b.date,
      site:       b.site,
      billNo:     b.bill_no,
      work:       b.work,
      remark:     b.remark,
      sanctioned: b.sanctioned,
      gst:        b.gst,
      cgst:       b.cgst,
      it:         b.it,
      net:        b.net,
      photo:      b.photo,
      createdAt:  b.created_at,
    }));
    // Sort newest first
    raBills.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
}

async function saveRAData(bill, action = 'insert') {
  const row = {
    id:         bill.id,
    date:       bill.date,
    site:       bill.site || null,
    bill_no:    bill.billNo || null,
    work:       bill.work || null,
    remark:     bill.remark || null,
    sanctioned: Number(bill.sanctioned) || 0,
    gst:        Number(bill.gst) || 0,
    cgst:       Number(bill.cgst) || 0,
    it:         Number(bill.it) || 0,
    net:        Number(bill.net) || 0,
    photo:      bill.photo || null,
    created_at: bill.createdAt,
  };

  if (action === 'insert') {
    const { error } = await supabaseClient.from('ra_bills').insert(row);
    if (error) {
      console.error('RA insert error — full details:', JSON.stringify(error, null, 2));
      const msg = error.message || error.details || 'Unknown error';
      showToast(`Save failed: ${msg}`, 'error');
      return false;
    }
  } else if (action === 'delete') {
    const { error } = await supabaseClient.from('ra_bills').delete().eq('id', bill.id);
    if (error) {
      console.error('RA delete error — full details:', JSON.stringify(error, null, 2));
      showToast(`Delete failed: ${error.message || 'Unknown error'}`, 'error');
      return false;
    }
  }
  return true;
}

// ── Populate site dropdown from workplaces ─────────────
function populateRASiteDropdown() {
  const sel = document.getElementById("raSite");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Select site —</option>' +
    workplaces.map(wp => `<option value="${escHtml(wp.name)}"${wp.name === current ? " selected" : ""}>${escHtml(wp.name)}</option>`).join("");
}

// ── Toggle form ────────────────────────────────────────
// ── Photo state ───────────────────────────────────────
let raPhotoData = null; // base64 string

function handleRAPhoto(input) {
  const file = input.files[0];
  if (!file) return;

  const isPDF = file.type === "application/pdf";
  const label = document.getElementById("raFileLabel");
  const icon  = document.getElementById("raFileIcon");
  const name  = document.getElementById("raFileName");
  const preview = document.getElementById("raPhotoPreview");
  const img     = document.getElementById("raPhotoImg");

  const reader = new FileReader();
  reader.onload = e => {
    raPhotoData = e.target.result;
    icon.textContent = isPDF ? "📄" : "🖼️";
    name.textContent = file.name;
    label.style.borderColor = "rgba(20,184,166,0.6)";
    label.style.color = "#5eead4";

    if (!isPDF) {
      img.src = raPhotoData;
      preview.style.display = "block";
    } else {
      preview.style.display = "none"; // PDFs: no image preview, just name shown
    }
  };
  reader.readAsDataURL(file);
}

function removeRAPhoto() {
  raPhotoData = null;
  document.getElementById("raPhoto").value = "";
  document.getElementById("raFileIcon").textContent = "📎";
  document.getElementById("raFileName").textContent = "Click to attach image or PDF";
  const label = document.getElementById("raFileLabel");
  label.style.borderColor = "";
  label.style.color = "";
  document.getElementById("raPhotoPreview").style.display = "none";
  document.getElementById("raPhotoImg").src = "";
}

function toggleRAForm() {
  const card = document.getElementById("raCard");
  const open = card.style.display === "none" || card.style.display === "";
  card.style.display = open ? "block" : "none";
  if (open) {
    populateRASiteDropdown();
    document.getElementById("raDate").value = todayISO();
    calcRA();
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ── Live calculation ───────────────────────────────────
function calcRA() {
  const sanctioned = parseFloat(document.getElementById("raSanctioned").value) || 0;
  const gst        = sanctioned * 0.01;
  const cgst       = sanctioned * 0.01;
  const it         = sanctioned * 0.04;
  const totalDeduct = gst + cgst + it;
  const net        = sanctioned - totalDeduct;

  document.getElementById("raGST").textContent         = fmt(gst);
  document.getElementById("raCGST").textContent        = fmt(cgst);
  document.getElementById("raIT").textContent          = fmt(it);
  document.getElementById("raTotalDeduct").textContent = fmt(totalDeduct);
  document.getElementById("raNet").textContent         = fmt(net);
}

// ── Save bill ─────────────────────────────────────────
async function saveRABill() {
  const site       = document.getElementById("raSite").value.trim();
  const date       = document.getElementById("raDate").value;
  const billNo     = document.getElementById("raBillNo").value.trim();
  const work       = document.getElementById("raWork").value.trim();
  const remark     = document.getElementById("raRemark").value.trim();
  const sanctioned = parseFloat(document.getElementById("raSanctioned").value) || 0;

  if (!date)       { showToast("Please pick a date.", "error"); return; }
  if (!sanctioned) { showToast("Enter the sanctioned amount.", "error"); return; }
  if (!site)       { showToast("Please select a site.", "error"); return; }

  const gst   = sanctioned * 0.01;
  const cgst  = sanctioned * 0.01;
  const it    = sanctioned * 0.04;
  const net   = sanctioned - gst - cgst - it;

  const btn = document.getElementById("raSaveBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

  const bill = {
    id: uid(), date, site, billNo, work, remark,
    sanctioned, gst, cgst, it, net,
    photo: raPhotoData || null,
    createdAt: new Date().toISOString()
  };

  // ── Save RA bill to Supabase ──
  const ok = await saveRAData(bill, 'insert');
  if (!ok) {
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save RA Bill"; }
    return;
  }
  raBills.unshift(bill);

  // ── Also add as an income record in the matching workplace ──
  const wp = workplaces.find(w => w.name.toLowerCase() === site.toLowerCase());
  if (wp) {
    const noteText = [
      billNo ? `Bill No: ${billNo}` : '',
      work   ? work                 : '',
      remark ? remark               : '',
      `(RA Bill — Net after GST/CGST/IT deductions)`
    ].filter(Boolean).join(' | ');

    wp.records.push({
      id:     uid(),
      amount: net,
      date,
      head:   'RA Bill',
      note:   billNo ? `${billNo}` : 'RA Bill',
      medium: 'Net Banking',
      bank:   'SBI',
      type:   'income',
      photo:  raPhotoData || null,
    });

    await saveData();
    renderDashboard();
    showToast(`RA Bill saved & added to "${wp.name}" as income ✓`, "success");
  } else {
    showToast("RA Bill saved ✓  (site not found — record not auto-added)", "success");
  }

  renderRABills();

  // Reset form
  ["raSite","raBillNo","raWork","raRemark","raSanctioned"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("raDate").value = todayISO();
  calcRA();
  removeRAPhoto();
  document.getElementById("raCard").style.display = "none";
  if (btn) { btn.disabled = false; btn.textContent = "💾 Save RA Bill"; }
}

// ── Delete bill ───────────────────────────────────────
async function deleteRABill(id) {
  if (!confirm("Delete this RA Bill? This cannot be undone.")) return;
  const bill = raBills.find(b => b.id === id);
  if (!bill) return;
  const ok = await saveRAData(bill, 'delete');
  if (!ok) return;
  raBills = raBills.filter(b => b.id !== id);
  renderRABills();
  showToast("RA Bill deleted.");
}

// ── View attached photo (reuses existing image modal) ──
function viewRAPhoto(src) {
  const modal = document.getElementById("imageModal");
  const img   = document.getElementById("modalImage");
  if (!modal || !img) return;
  img.src = src;
  modal.classList.remove("hidden");
}

// ── Render list ───────────────────────────────────────
function renderRABills() {
  const tbody  = document.getElementById("raBillsBody");
  const empty  = document.getElementById("raBillsEmpty");
  const table  = document.getElementById("raBillsTable");
  const count  = document.getElementById("raBillCount");
  if (!tbody) return;

  count.textContent = `${raBills.length} bill${raBills.length !== 1 ? "s" : ""}`;

  if (raBills.length === 0) {
    table.style.display = "none";
    empty.style.display = "flex";
    return;
  }

  table.style.display = "";
  empty.style.display = "none";

  tbody.innerHTML = raBills.map(b => {
    const photoCell = b.photo
      ? `<td><button class="ghost-btn" style="padding:4px 8px;font-size:12px;min-height:unset;" onclick="viewRAPhoto('${b.photo}')">🖼️ View</button></td>`
      : `<td style="color:rgba(255,255,255,0.3);font-size:12px;">—</td>`;
    return `
    <tr>
      <td>${formatDate(b.date)}</td>
      <td>${escHtml(b.billNo || "—")}</td>
      <td>${escHtml(b.site || "—")}</td>
      <td>${escHtml(b.work || "—")}</td>
      <td class="money">${fmt(b.sanctioned)}</td>
      <td class="money">${fmt(b.gst)}</td>
      <td class="money">${fmt(b.cgst)}</td>
      <td class="money">${fmt(b.it)}</td>
      <td class="money ra-net-cell">${fmt(b.net)}</td>
      <td>${escHtml(b.remark || "—")}</td>
      ${photoCell}
      <td><button class="danger-btn icon-btn" style="padding:4px 8px;font-size:12px;" onclick="deleteRABill('${b.id}')">🗑</button></td>
    </tr>`;
  }).join("");
}

// ── Hook into switchView to render when opening ────────
const _origSwitchView = switchView;
switchView = function(viewId) {
  _origSwitchView(viewId);
  if (viewId === "raBillsView") {
    populateRASiteDropdown();
    loadRAData().then(() => renderRABills());
  }
};