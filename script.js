/* =====================================================
   SHRADDHA CONSTRUCTION TRACKER — script.js
   ===================================================== */

// ─── CONSTANTS ────────────────────────────────────────
const CREDENTIALS = { username: "goraksha", password: "shraddhacnstr" };
const STORAGE_KEY  = "sc_workplaces";
const SESSION_KEY  = "sc_session";

// ─── STATE ────────────────────────────────────────────
let workplaces      = [];   // [{ id, name, records: [] }]
let currentWPId     = null;
let pieChart        = null;
let selectionMode   = null; // 'edit' | 'delete' | null
let selectedIds     = new Set();
let pendingDeleteIds = [];

// ─── INIT ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setDateDisplay();
  loadData();

  // Check session
  if (sessionStorage.getItem(SESSION_KEY) === "1") {
    showApp();
  }

  // Sync Excel file input label
  const excelInput = document.getElementById("excelFile");
  if (excelInput) {
    excelInput.addEventListener("change", () => {
      const label = document.getElementById("excelFileName");
      if (label) label.textContent = excelInput.files[0]?.name || "No file chosen";
    });
  }

  // Live search
  ["search","from","to","filterType"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", renderRecords);
  });

  // Select-all checkbox
  const selectAll = document.getElementById("selectAllRecords");
  if (selectAll) {
    selectAll.addEventListener("change", () => {
      const rows = document.querySelectorAll(".record-checkbox");
      rows.forEach(cb => {
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
function loadData() {
  try {
    workplaces = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    workplaces = [];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workplaces));
}

// ─── AUTH ─────────────────────────────────────────────
function login() {
  const btn      = document.getElementById("loginBtn");
  const errEl    = document.getElementById("loginError");
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  errEl.style.display = "none";

  if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
    btn.textContent = "Signing in…";
    btn.disabled    = true;
    setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
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
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginPage").style.display = "";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
}

function showApp() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("app").classList.remove("hidden");
  renderDashboard();
  switchView("dashboard");
}

function togglePassword() {
  const pw = document.getElementById("password");
  pw.type = pw.type === "password" ? "text" : "password";
}

// ─── VIEW SWITCHING ───────────────────────────────────
function switchView(viewId) {
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
      if (r.type === "income")  totalIncome  += +r.amount;
      else                      totalExpense += +r.amount;
    });
  });
  const net = totalIncome - totalExpense;

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
    </div>
  `;
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
    const income  = wp.records.filter(r => r.type === "income").reduce((s,r) => s + +r.amount, 0);
    const expense = wp.records.filter(r => r.type === "expense").reduce((s,r) => s + +r.amount, 0);
    const net     = income - expense;
    return `
      <div class="site-card" onclick="openWorkplace('${wp.id}')">
        <div class="card-top">
          <div>
            <h3>${escHtml(wp.name)}</h3>
            <p class="muted-sm" style="margin-top:4px">${wp.records.length} record${wp.records.length !== 1 ? 's' : ''}</p>
          </div>
          <button class="icon-btn danger-btn" style="min-width:32px;min-height:32px;padding:6px 8px;font-size:13px;"
            onclick="deleteWP(event,'${wp.id}')" title="Delete site">✕</button>
        </div>
        <div class="amount" style="color:${net >= 0 ? 'var(--income)' : 'var(--expense)'}">
          ${fmt(net)}
        </div>
      </div>`;
  }).join("");
}

// ─── WORKPLACE CRUD ───────────────────────────────────
function addWP() {
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

  // Reset UI state
  cancelRecordSelection();
  closeSearch();

  // Set today's date in the form
  document.getElementById("date").value = todayISO();

  switchView("workplace");
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

  // Validation
  let valid = true;
  if (!amt || isNaN(+amt) || +amt <= 0) {
    showFieldError("amt", "amtErr", true); valid = false;
  } else showFieldError("amt", "amtErr", false);

  if (!date) {
    showFieldError("date", "dateErr", true); valid = false;
  } else showFieldError("date", "dateErr", false);

  if (!head) {
    showFieldError("head", "headErr", true); valid = false;
  } else showFieldError("head", "headErr", false);

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
  ["amt","head","note"].forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
  document.getElementById("date").value   = todayISO();
  document.getElementById("medium").value = "Cash";
  document.getElementById("bank").value   = "SBI";
  document.getElementById("type").value   = "income";
  document.getElementById("photo").value  = "";
  ["amt","date","head"].forEach(id => showFieldError(id, id+"Err", false));
}

// ─── RENDER RECORDS TABLE ─────────────────────────────
function renderRecords() {
  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;

  const tbody    = document.getElementById("recs");
  const countEl  = document.getElementById("recordCount");
  const filtered = getFilteredRecords(wp.records);

  countEl.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

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

  tbody.innerHTML = filtered.map(r => {
    const isSelected = selectedIds.has(r.id);
    return `
      <tr class="${isSelected ? 'selected-row' : ''}" data-id="${r.id}">
        <td class="select-col" style="display:${inSelectMode ? 'table-cell' : 'none'}">
          <input type="checkbox" class="record-checkbox" data-id="${r.id}"
            ${isSelected ? 'checked' : ''}
            onchange="toggleSelectRecord('${r.id}', this)">
        </td>
        <td>${formatDate(r.date)}</td>
        <td>${escHtml(r.head)}</td>
        <td>${escHtml(r.note || "—")}</td>
        <td class="money">${fmt(r.amount)}</td>
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
    if (q && !r.head.toLowerCase().includes(q) && !(r.note||"").toLowerCase().includes(q)) return false;
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
  ["search","from","to"].forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });
  document.getElementById("filterType").value = "";
  renderRecords();
}

// ─── SELECTION MODE ───────────────────────────────────
function startRecordSelection(mode) {
  selectionMode = mode;
  selectedIds.clear();

  // Show selection UI
  document.getElementById("selectColHeader").style.display = "table-cell";
  document.getElementById("startEditBtn").style.display    = "none";
  document.getElementById("startDeleteBtn").style.display  = "none";
  document.getElementById("confirmSelectionBtn").style.display = "";
  document.getElementById("cancelSelectionBtn").style.display  = "";

  document.getElementById("confirmSelectionBtn").textContent =
    mode === "delete" ? "Delete Selected" : "Edit Selected";

  renderRecords();
}

function cancelRecordSelection() {
  selectionMode = null;
  selectedIds.clear();

  document.getElementById("selectColHeader").style.display    = "none";
  document.getElementById("startEditBtn").style.display       = "";
  document.getElementById("startDeleteBtn").style.display     = "";
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
  if (selectedIds.size === 0) {
    showToast("Select at least one record.", "error");
    return;
  }

  if (selectionMode === "delete") {
    pendingDeleteIds = [...selectedIds];
    const count = pendingDeleteIds.length;
    document.getElementById("deleteModalMsg").textContent =
      `Delete ${count} record${count !== 1 ? 's' : ''}? This cannot be undone.`;
    document.getElementById("deleteModal").classList.remove("hidden");

  } else if (selectionMode === "edit") {
    if (selectedIds.size !== 1) {
      showToast("Select exactly one record to edit.", "error");
      return;
    }
    editRecord([...selectedIds][0]);
  }
}

function closeDeleteModal() {
  document.getElementById("deleteModal").classList.add("hidden");
  pendingDeleteIds = [];
}

function proceedDelete() {
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
  showToast(`${count} record${count !== 1 ? 's' : ''} deleted.`);
}

function editRecord(id) {
  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;
  const r = wp.records.find(rec => rec.id === id);
  if (!r) return;

  // Populate form
  document.getElementById("amt").value    = r.amount;
  document.getElementById("date").value   = r.date;
  document.getElementById("head").value   = r.head;
  document.getElementById("note").value   = r.note || "";
  document.getElementById("medium").value = r.medium || "Cash";
  document.getElementById("bank").value   = r.bank || "SBI";
  document.getElementById("type").value   = r.type;

  // Remove original record
  wp.records = wp.records.filter(rec => rec.id !== id);
  saveData();

  // Show form
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

  const income  = wp.records.filter(r => r.type === "income").reduce((s,r) => s + +r.amount, 0);
  const expense = wp.records.filter(r => r.type === "expense").reduce((s,r) => s + +r.amount, 0);

  const chartEmpty = document.getElementById("chartEmpty");
  const canvas     = document.getElementById("pieChart");

  if (income === 0 && expense === 0) {
    chartEmpty.style.display = "";
    canvas.style.display = "none";
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    return;
  }

  chartEmpty.style.display = "none";
  canvas.style.display = "";

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
        legend: {
          position: "bottom",
          labels: { font: { size: 12, weight: "700" }, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}`
          }
        }
      }
    }
  });
}

// ─── MAIN HEADS ───────────────────────────────────────
function openMainHeads() {
  // Aggregate all records by head across all workplaces
  const headMap = {};
  workplaces.forEach(wp => {
    wp.records.forEach(r => {
      const key = r.head.trim().toLowerCase();
      if (!headMap[key]) headMap[key] = { name: r.head.trim(), income: 0, expense: 0, count: 0 };
      headMap[key].count++;
      if (r.type === "income")  headMap[key].income  += +r.amount;
      else                      headMap[key].expense += +r.amount;
    });
  });

  const container = document.getElementById("mainHeads");
  const heads = Object.values(headMap).sort((a,b) => a.name.localeCompare(b.name));

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
              <p class="muted-sm" style="margin-top:4px">${h.count} record${h.count !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div class="amount" style="color:${net >= 0 ? 'var(--income)' : 'var(--expense)'}">
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

  rows.sort((a,b) => b.date.localeCompare(a.date));

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

  if (wp.records.length === 0) {
    showToast("No records to export.", "error");
    return;
  }

  const rows = wp.records
    .slice()
    .sort((a,b) => b.date.localeCompare(a.date))
    .map(r => ({
      Date:    r.date,
      Head:    r.head,
      Note:    r.note || "",
      Amount:  r.amount,
      Medium:  r.medium,
      Bank:    r.bank,
      Type:    r.type,
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Records");
  XLSX.writeFile(wb, `${wp.name}_records.xlsx`);
  showToast("Excel exported ✓", "success");
}

// ─── EXCEL IMPORT ─────────────────────────────────────
function importExcel() {
  const file = document.getElementById("excelFile").files[0];
  if (!file) { showToast("Choose an Excel file first.", "error"); return; }

  const wp = workplaces.find(w => w.id === currentWPId);
  if (!wp) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb    = XLSX.read(e.target.result, { type: "array" });
      const ws    = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json(ws);

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
          type:   ["income","expense"].includes(type) ? type : "expense",
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

      showToast(`${imported} record${imported !== 1 ? 's' : ''} imported ✓`, "success");
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
  // Handles ISO strings or Excel date serials
  if (!val) return "";
  if (typeof val === "number") {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  // Try yyyy-mm-dd or dd/mm/yyyy
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

// ─── SHAKE ANIMATION ──────────────────────────────────
function shake(el) {
  if (!el) return;
  el.style.animation = "none";
  el.offsetHeight; // reflow
  el.style.animation = "shake 0.38s ease";
  setTimeout(() => el.style.animation = "", 400);
}

// Shake keyframe injected via JS so it's self-contained
(function injectShake() {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes shake {
      0%,100% { transform: translateX(0); }
      18%      { transform: translateX(-7px); }
      36%      { transform: translateX(7px); }
      54%      { transform: translateX(-5px); }
      72%      { transform: translateX(5px); }
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