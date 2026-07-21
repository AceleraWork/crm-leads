const STAGES = ["Nuevo", "Contactado", "No respondió", "MQL", "Cita agendada", "Show", "Persona interesada", "Cliente", "Perdido"];
const FUNNEL = ["Lead", "Contactado", "MQL", "Cita agendada", "Show", "Persona interesada", "Cliente"];
const LOST_REASONS = ["No contestó", "No calificado", "Sin plata", "No le interesó", "Precio", "Otro"];
const META_COLUMNS_TO_IGNORE = new Set(["is_organic", "platform", "form_id", "form_name", "ad_id", "adset_id", "campaign_id", "lead_status"]);
const STORAGE_KEY = "alta-crm-state-v1";
const BENCHMARK_KEY = "alta-crm-benchmarks-v1";
const DEFAULT_SOURCE_URL = "https://docs.google.com/spreadsheets/d/1e_czwxsoT-g6MCkDywN2jw-bblDYk7xeVREAvX0VLFY/edit?usp=sharing";
const AUTO_SYNC_MS = 2 * 60 * 1000;
const USER = "Luciano";

const questionSituation = "cuál_describe_mejor_tu_situación_actual?";
const questionGoal = "cuál_es_tu_principal_objetivo_al_aprender_ia?";
const defaultBenchmarks = {
  Contactado: 70,
  MQL: 60,
  "Cita agendada": 70,
  Show: 70,
  "Persona interesada": 60,
  Cliente: 20,
};

let state = loadState();
let selectedLeadId = null;
let selectedLostReason = "";
let funnelChart;

const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  if (!state.leads.length) {
    state.leads = buildSampleLeads();
    saveState();
  }

  bindEvents();
  render();
  syncFromSavedSource(true);
  setInterval(renderTimeSensitive, 60000);
  setInterval(() => syncFromSavedSource(true), AUTO_SYNC_MS);
  if (window.lucide) window.lucide.createIcons();
});

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab, .view").forEach((el) => el.classList.remove("active"));
      tab.classList.add("active");
      $(`#${tab.dataset.view}View`).classList.add("active");
      render();
    });
  });

  ["campaignFilter", "offerFilter", "searchInput", "dateFrom", "dateTo", "dashboardCampaign", "dashboardOffer"].forEach((id) => {
    $(`#${id}`)?.addEventListener("input", render);
  });

  $("#importBtn").addEventListener("click", () => $("#importDialog").showModal());
  $("#syncBtn").addEventListener("click", syncFromSavedSource);
  $("#saveSource").addEventListener("click", importFromDialog);
  $("#clearDemoBtn").addEventListener("click", clearDemoLeads);
  $("#loadSample").addEventListener("click", () => {
    state.leads = buildSampleLeads();
    saveState();
    $("#importDialog").close();
    render();
  });
  $("#closeDrawer").addEventListener("click", closeDrawer);
  $("#drawerBackdrop").addEventListener("click", closeDrawer);
  $("#prevLead").addEventListener("click", () => navigateLead(-1));
  $("#nextLead").addEventListener("click", () => navigateLead(1));
  $("#benchmarksBtn").addEventListener("click", editBenchmarks);

  LOST_REASONS.forEach((reason) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reason-btn";
    button.textContent = reason;
    button.addEventListener("click", () => selectLostReason(reason));
    $("#reasonGrid").append(button);
  });
  $("#confirmLost").addEventListener("click", confirmLostLead);
}

function render() {
  renderFilters();
  renderPipeline();
  renderDashboard();
  renderFollowups();
  renderTimeSensitive();
  if (window.lucide) window.lucide.createIcons();
}

function renderTimeSensitive() {
  const critical = state.leads.filter((lead) => lead.stage === "Nuevo" && urgencyFor(lead).level === "red").length;
  $("#criticalCount").textContent = critical;
}

function renderFilters() {
  const campaigns = ["all", ...new Set(state.leads.map((lead) => lead.campaign_name).filter(Boolean))];
  fillSelect($("#campaignFilter"), campaigns, "Todas las campañas");
  fillSelect($("#dashboardCampaign"), campaigns, "Todas las campañas");
  fillSelect($("#dashboardOffer"), ["all", "Oferta Curso AI", "Oferta AI Agency", "Ambas"], "Todas");
}

function fillSelect(select, values, allLabel) {
  if (!select) return;
  const current = select.value || "all";
  select.innerHTML = values
    .map((value) => `<option value="${escapeHtml(value)}">${value === "all" ? allLabel : escapeHtml(value)}</option>`)
    .join("");
  select.value = values.includes(current) ? current : "all";
}

function renderPipeline() {
  const kanban = $("#kanban");
  const leads = filteredPipelineLeads();
  kanban.innerHTML = STAGES.map((stage) => {
    const count = leads.filter((lead) => lead.stage === stage).length;
    return `
      <section class="column" data-stage="${stage}">
        <div class="column-header"><span>${stage}</span><span>${count}</span></div>
        <div class="column-body" data-stage="${stage}"></div>
      </section>
    `;
  }).join("");

  document.querySelectorAll(".column-body").forEach((body) => {
    body.addEventListener("dragover", (event) => event.preventDefault());
    body.addEventListener("drop", onDropLead);
  });

  leads.forEach((lead) => {
    const card = document.createElement("article");
    const urgency = urgencyFor(lead);
    card.className = `lead-card card-urgency-${urgency.level}`;
    card.draggable = true;
    card.dataset.id = lead.id;
    card.innerHTML = `
      <div class="card-top">
        <span class="lead-name">${escapeHtml(lead.full_name || "Sin nombre")}</span>
        <span class="platform ${platformFor(lead)}">${platformFor(lead).toUpperCase()}</span>
      </div>
      <div class="meta-row"><i data-lucide="megaphone"></i>${escapeHtml(lead.campaign_name || "Sin campaña")}</div>
      <div class="meta-row"><span class="urgency-pill urgency-${urgency.level}">${urgency.label}</span><span>${timeAgo(lead.created_time)}</span></div>
      ${lead.stage === "No respondió" ? `<div class="meta-row"><span class="attempt-badge">${attemptLabel(lead.contact_attempts)}</span></div>` : ""}
      ${lead.stage === "Perdido" && lead.lost_reason ? `<div class="meta-row"><span class="lost-badge">${escapeHtml(lead.lost_reason)}</span></div>` : ""}
    `;
    card.addEventListener("dragstart", () => card.classList.add("dragging"));
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("click", () => openLead(lead.id));
    $(`.column-body[data-stage="${lead.stage}"]`).append(card);
  });
}

function filteredPipelineLeads() {
  const campaign = $("#campaignFilter").value || "all";
  const offer = $("#offerFilter").value || "all";
  const search = ($("#searchInput").value || "").toLowerCase().trim();
  return state.leads.filter((lead) => {
    const campaignOk = campaign === "all" || lead.campaign_name === campaign;
    const offerOk = offer === "all" || lead.offer === offer;
    const haystack = [lead.full_name, lead.whatsapp, lead.campaign_name, lead.adset_name, lead.ad_name].join(" ").toLowerCase();
    return campaignOk && offerOk && (!search || haystack.includes(search));
  });
}

function onDropLead(event) {
  event.preventDefault();
  const card = $(".lead-card.dragging");
  if (!card) return;
  requestStageMove(card.dataset.id, event.currentTarget.dataset.stage);
}

function requestStageMove(id, stage) {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead || lead.stage === stage) return;
  if (stage === "Perdido" && !lead.lost_reason) {
    openLostDialog(id);
    return;
  }
  moveLead(id, stage);
}

function moveLead(id, stage) {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead || lead.stage === stage) return;
  const previous = lead.stage;
  lead.stage = stage;
  lead.transitions.unshift({ from: previous, to: stage, at: new Date().toISOString(), by: USER });
  if (previous === "Nuevo" && stage === "Contactado" && !lead.first_contacted_at) {
    lead.first_contacted_at = new Date().toISOString();
    lead.response_minutes = diffMinutes(lead.created_time, lead.first_contacted_at);
  }
  if (stage === "No respondió" && !lead.contact_attempts) {
    lead.contact_attempts = 1;
  }
  saveState();
  render();
  if (selectedLeadId === id) renderDrawer(lead);
}

function openLead(id) {
  selectedLeadId = id;
  const lead = state.leads.find((item) => item.id === id);
  renderDrawer(lead);
  $("#leadDrawer").classList.add("open");
  $("#leadDrawer").setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  $("#leadDrawer").classList.remove("open");
  $("#leadDrawer").setAttribute("aria-hidden", "true");
  selectedLeadId = null;
}

function renderDrawer(lead) {
  if (!lead) return;
  const urgency = urgencyFor(lead);
  $("#drawerTitle").textContent = lead.full_name || "Sin nombre";
  $("#drawerStage").textContent = lead.stage;
  $("#drawerContent").innerHTML = `
    <section class="drawer-section">
      <h3>Identidad</h3>
      <div class="detail-grid">
        <div class="detail"><span>WhatsApp</span><a href="${whatsappUrl(lead.whatsapp)}" target="_blank" rel="noreferrer">${escapeHtml(lead.whatsapp || "Sin número")}</a></div>
        <div class="detail"><span>Tiempo desde llegada</span><strong><span class="urgency-pill urgency-${urgency.level}">${urgency.label}</span> ${timeAgo(lead.created_time)}</strong></div>
        <div class="detail"><span>Campaña</span><strong>${escapeHtml(lead.campaign_name || "-")}</strong></div>
        <div class="detail"><span>Adset / Ad</span><strong>${escapeHtml(lead.adset_name || "-")} / ${escapeHtml(lead.ad_name || "-")}</strong></div>
      </div>
    </section>

    <section class="drawer-section">
      <h3>Calificación</h3>
      <div class="chip-row">
        <span class="chip">${labelize(lead[questionSituation])}</span>
        <span class="chip">${labelize(lead[questionGoal])}</span>
      </div>
    </section>

    <section class="drawer-section">
      <h3>Pipeline</h3>
      <div class="detail-grid">
        <label>Oferta
          <select id="leadOffer">${["Oferta Curso AI", "Oferta AI Agency", "Ambas", "Sin definir"].map((offer) => `<option ${lead.offer === offer ? "selected" : ""}>${offer}</option>`).join("")}</select>
        </label>
        <label>Etapa
          <select id="leadStage">${STAGES.map((stage) => `<option ${lead.stage === stage ? "selected" : ""}>${stage}</option>`).join("")}</select>
        </label>
        <label>Próxima acción
          <input id="nextAction" value="${escapeHtml(lead.next_action || "")}" placeholder="Escribir por WhatsApp" />
        </label>
        <label>Fecha
          <input id="nextActionDate" type="datetime-local" value="${toLocalInput(lead.next_action_at)}" />
        </label>
      </div>
      <div class="lead-actions">
        ${lead.stage === "Perdido" ? `<button class="primary-btn" id="reactivateLead"><i data-lucide="rotate-ccw"></i> Reactivar lead</button>` : `<button class="danger-btn" id="markLost"><i data-lucide="circle-x"></i> Marcar como perdido</button>`}
        <button class="ghost-btn delete-lead-btn" id="deleteLead"><i data-lucide="trash-2"></i> Borrar contacto</button>
      </div>
    </section>

    ${lead.stage === "No respondió" ? `
      <section class="drawer-section">
        <h3>Intentos de contacto</h3>
        <div class="attempt-control" id="attemptControl">
          ${[1, 2, 3].map((attempt) => `<button class="reason-btn ${Number(lead.contact_attempts || 1) === attempt ? "selected" : ""}" type="button" data-attempt="${attempt}">Contactado ${attempt} ${attempt === 1 ? "vez" : "veces"}</button>`).join("")}
        </div>
      </section>
    ` : ""}

    <section class="drawer-section">
      <h3>Notas</h3>
      <textarea id="newNote" rows="3" placeholder="Agregar nota a la bitácora"></textarea>
      <button class="primary-btn" id="addNote"><i data-lucide="plus"></i> Agregar nota</button>
      <div>${lead.notes.map((note) => `<div class="note">${escapeHtml(note.text)}<small>${formatDate(note.at)} · ${escapeHtml(note.by)}</small></div>`).join("") || `<p class="meta-row">Sin notas todavía.</p>`}</div>
    </section>

    ${lead.stage === "Perdido" ? `
      <section class="drawer-section lost-section">
        <h3>Razón de pérdida</h3>
        <div class="detail-grid">
          <div class="detail"><span>Motivo</span><strong>${escapeHtml(lead.lost_reason || "Sin motivo")}</strong></div>
          <div class="detail"><span>Fecha</span><strong>${formatDate(lead.lost_at)}</strong></div>
        </div>
      </section>
    ` : ""}
  `;

  $("#leadOffer").addEventListener("change", (event) => updateLead(lead.id, { offer: event.target.value }));
  $("#leadStage").addEventListener("change", (event) => requestStageMove(lead.id, event.target.value));
  $("#nextAction").addEventListener("change", (event) => updateLead(lead.id, { next_action: event.target.value }));
  $("#nextActionDate").addEventListener("change", (event) => updateLead(lead.id, { next_action_at: event.target.value ? new Date(event.target.value).toISOString() : "" }));
  $("#addNote").addEventListener("click", () => addNote(lead.id));
  $("#markLost")?.addEventListener("click", () => openLostDialog(lead.id));
  $("#reactivateLead")?.addEventListener("click", () => moveLead(lead.id, "Persona interesada"));
  $("#deleteLead").addEventListener("click", () => deleteLead(lead.id));
  document.querySelectorAll("#attemptControl button").forEach((button) => {
    button.addEventListener("click", () => updateLead(lead.id, { contact_attempts: Number(button.dataset.attempt) }));
  });
  if (window.lucide) window.lucide.createIcons();
}

function updateLead(id, patch) {
  const lead = state.leads.find((item) => item.id === id);
  Object.assign(lead, patch);
  saveState();
  render();
  renderDrawer(lead);
}

function addNote(id) {
  const text = $("#newNote").value.trim();
  if (!text) return;
  const lead = state.leads.find((item) => item.id === id);
  lead.notes.unshift({ text, at: new Date().toISOString(), by: USER });
  saveState();
  renderDrawer(lead);
}

function deleteLead(id) {
  const lead = state.leads.find((item) => item.id === id);
  if (!lead) return;
  const confirmed = confirm(`¿Borrar a ${lead.full_name || "este contacto"} del CRM local? No borra la fila del Google Sheet.`);
  if (!confirmed) return;
  state.deletedLeadIds = [...new Set([...(state.deletedLeadIds || []), id])];
  state.leads = state.leads.filter((item) => item.id !== id);
  saveState();
  closeDrawer();
  render();
}

function clearDemoLeads() {
  const demoIds = new Set(buildSampleLeads().map((lead) => lead.id));
  const found = state.leads.filter((lead) => demoIds.has(lead.id)).length;
  if (!found) return;
  const confirmed = confirm(`¿Borrar ${found} contactos de prueba?`);
  if (!confirmed) return;
  state.deletedLeadIds = [...new Set([...(state.deletedLeadIds || []), ...demoIds])];
  state.leads = state.leads.filter((lead) => !demoIds.has(lead.id));
  saveState();
  render();
}

function navigateLead(direction) {
  const current = state.leads.find((lead) => lead.id === selectedLeadId);
  if (!current) return;
  const columnLeads = filteredPipelineLeads().filter((lead) => lead.stage === current.stage);
  const index = columnLeads.findIndex((lead) => lead.id === selectedLeadId);
  const next = columnLeads[index + direction];
  if (next) openLead(next.id);
}

function openLostDialog(id) {
  selectedLeadId = id;
  selectedLostReason = "";
  $("#otherReason").classList.add("hidden");
  document.querySelectorAll(".reason-btn").forEach((btn) => btn.classList.remove("selected"));
  $("#lostDialog").showModal();
}

function selectLostReason(reason) {
  selectedLostReason = reason;
  document.querySelectorAll(".reason-btn").forEach((btn) => btn.classList.toggle("selected", btn.textContent === reason));
  $("#otherReason").classList.toggle("hidden", reason !== "Otro");
}

function confirmLostLead() {
  if (!selectedLostReason) return;
  const reason = selectedLostReason === "Otro" ? $("#otherReason").value.trim() : selectedLostReason;
  if (!reason) return;
  const lead = state.leads.find((item) => item.id === selectedLeadId);
  lead.lost_reason = reason;
  lead.lost_at = new Date().toISOString();
  moveLead(lead.id, "Perdido");
  $("#lostDialog").close();
}

function renderDashboard() {
  const leads = filteredDashboardLeads();
  const counts = FUNNEL.map((stage) => {
    if (stage === "Lead") return leads.length;
    return leads.filter((lead) => reachedStage(lead, stage)).length;
  });
  const benchmarks = loadBenchmarks();
  const rows = FUNNEL.slice(1).map((stage, index) => {
    const previous = counts[index] || 0;
    const current = counts[index + 1] || 0;
    const rate = previous ? Math.round((current / previous) * 100) : 0;
    const benchmark = benchmarks[stage] || 0;
    return `<div class="table-row"><strong>${stage}</strong><span>${current} leads</span><span>${rate}% vs ${benchmark}%</span><span class="rate-pill ${rate >= benchmark ? "rate-good" : "rate-bad"}">${rate >= benchmark ? "OK" : "Bajo"}</span></div>`;
  });
  $("#funnelTable").innerHTML = rows.join("");

  const responseTimes = leads.map((lead) => lead.response_minutes).filter((value) => Number.isFinite(value));
  $("#avgResponse").textContent = responseTimes.length ? `${Math.round(avg(responseTimes))} min` : "-";
  $("#medianResponse").textContent = responseTimes.length ? `${Math.round(median(responseTimes))} min` : "-";

  renderFunnelChart(counts);
  renderAgencySegment(leads);
}

function filteredDashboardLeads() {
  const from = $("#dateFrom").value ? new Date(`${$("#dateFrom").value}T00:00:00`) : null;
  const to = $("#dateTo").value ? new Date(`${$("#dateTo").value}T23:59:59`) : null;
  const campaign = $("#dashboardCampaign").value || "all";
  const offer = $("#dashboardOffer").value || "all";
  return state.leads.filter((lead) => {
    const created = new Date(lead.created_time);
    return (!from || created >= from) && (!to || created <= to) && (campaign === "all" || lead.campaign_name === campaign) && (offer === "all" || lead.offer === offer);
  });
}

function renderFunnelChart(counts) {
  const ctx = $("#funnelChart");
  if (!ctx || !window.Chart) return;
  if (funnelChart) funnelChart.destroy();
  funnelChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: FUNNEL,
      datasets: [{ data: counts, backgroundColor: ["#0f766e", "#2563eb", "#7c3aed", "#d97706", "#0891b2", "#15803d", "#111827"], borderRadius: 6 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      responsive: true,
    },
  });
}

function renderAgencySegment(leads) {
  const segment = leads.filter((lead) => lead[questionGoal] === "ofrecer_servicios_de_ia_a_clientes");
  $("#agencySegment").innerHTML = segment.length
    ? segment.map((lead) => `<div class="table-row"><strong>${escapeHtml(lead.full_name)}</strong><span>${escapeHtml(lead.whatsapp)}</span><span>${escapeHtml(lead.campaign_name)}</span><button class="ghost-btn" onclick="openLead('${lead.id}')">Abrir</button></div>`).join("")
    : `<p class="meta-row">No hay leads en este segmento con los filtros actuales.</p>`;
}

function renderFollowups() {
  const now = new Date();
  const due = state.leads
    .filter((lead) => lead.next_action_at && new Date(lead.next_action_at) <= endOfToday(now) && lead.stage !== "Cliente" && lead.stage !== "Perdido")
    .sort((a, b) => new Date(a.next_action_at) - new Date(b.next_action_at));
  $("#followupCount").textContent = `${due.length} pendientes`;
  $("#followupList").innerHTML = due.length
    ? due.map((lead) => `<article class="followup-item"><div><strong>${escapeHtml(lead.full_name)}</strong><div class="meta-row">${escapeHtml(lead.next_action)} · ${formatDate(lead.next_action_at)} · ${lead.stage}</div></div><button class="primary-btn" onclick="openLead('${lead.id}')"><i data-lucide="message-circle"></i> Abrir</button></article>`).join("")
    : `<p class="metric-panel">No hay próximas acciones vencidas ni para hoy.</p>`;
}

async function importFromDialog() {
  const url = $("#csvUrl").value.trim();
  const pasted = $("#csvText").value.trim();
  let csv = pasted;
  if (url) {
    const response = await fetch(sourceFetchUrl(url));
    csv = await response.text();
    state.sourceUrl = normalizeSheetUrl(url);
  }
  if (!csv) return;
  mergeLeads(parseCsv(csv));
  saveState();
  $("#importDialog").close();
  render();
}

async function syncFromSavedSource(silent = false) {
  if (!state.sourceUrl) {
    if (!silent) $("#importDialog").showModal();
    return;
  }
  try {
    const response = await fetch(sourceFetchUrl(state.sourceUrl), { cache: "no-store" });
    const csv = await response.text();
    mergeLeads(parseCsv(csv));
    state.lastSyncAt = new Date().toISOString();
    saveState();
    render();
    $("#criticalHint").textContent = `Sincronizado: ${formatDate(state.lastSyncAt)}. Se actualiza cada 2 min.`;
  } catch (error) {
    if (!silent) alert("No pude sincronizar el Google Sheet. Revisa que el servidor local sea server.py y que el Sheet sea accesible.");
  }
}

function normalizeSheetUrl(url) {
  const match = String(url).match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/);
  if (!match) return url;
  const gid = new URL(url).searchParams.get("gid");
  return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ""}`;
}

function sourceFetchUrl(url) {
  const normalized = normalizeSheetUrl(url);
  if (normalized.includes("docs.google.com") && ["localhost", "127.0.0.1"].includes(location.hostname)) {
    return `/sheet.csv?url=${encodeURIComponent(normalized)}`;
  }
  return normalized;
}

function mergeLeads(rows) {
  const existing = new Map(state.leads.map((lead) => [lead.id, lead]));
  const deleted = new Set(state.deletedLeadIds || []);
  rows.forEach((row) => {
    const clean = {};
    Object.entries(row).forEach(([key, value]) => {
      if (!META_COLUMNS_TO_IGNORE.has(key)) clean[key] = value;
    });
    if (!clean.id || existing.has(clean.id) || deleted.has(clean.id)) return;
    state.leads.push(normalizeLead(clean));
  });
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  const headers = rows.shift()?.map((header) => header.trim()) || [];
  return rows.filter((item) => item.some(Boolean)).map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index] || ""])));
}

function normalizeLead(row) {
  const inferredOffer = row[questionGoal] === "ofrecer_servicios_de_ia_a_clientes" ? "Oferta AI Agency" : "Oferta Curso AI";
  return {
    ...row,
    whatsapp: row["número_de_whatsapp"] || row.whatsapp || "",
    stage: "Nuevo",
    offer: inferredOffer,
    notes: [],
    transitions: [{ from: "Sheet", to: "Nuevo", at: new Date().toISOString(), by: "Meta Lead Ads" }],
    next_action: "",
    next_action_at: "",
    contact_attempts: 0,
  };
}

function buildSampleLeads() {
  const now = Date.now();
  return [
    sampleLead("101", "Mariana Torres", "573001112233", now - 7 * 60 * 1000, "Curso AI - Conversión Julio", "Intereses IA", "Video corto 01", "tengo_mi_propio_negocio", "automatizar_procesos_en_mi_trabajo"),
    sampleLead("102", "Andrés Molina", "573102224455", now - 38 * 60 * 1000, "Curso AI - Conversión Julio", "Lookalike compradores", "Carrusel casos", "soy_consultor_o_freelancer", "ofrecer_servicios_de_ia_a_clientes"),
    sampleLead("103", "Paula Ríos", "573203334455", now - 132 * 60 * 1000, "Curso AI - Conversión Julio", "Broad Colombia", "Lead magnet IA", "estoy_buscando_nuevas_oportunidades", "generar_nuevas_fuentes_de_ingresos"),
    sampleLead("104", "Carlos Medina", "573154445566", now - 2 * 24 * 60 * 60 * 1000, "AI Agency - Retargeting", "Consultores", "Webinar Agency", "soy_consultor_o_freelancer", "ofrecer_servicios_de_ia_a_clientes", "Persona interesada", "Ambas"),
    sampleLead("105", "Laura Gaitán", "573016667788", now - 4 * 24 * 60 * 60 * 1000, "Curso AI - Conversión Julio", "Startups", "Testimonio founders", "trabajo_en_una_startup", "implementar_ia_en_mi_empresa", "MQL"),
  ];
}

function sampleLead(id, fullName, whatsapp, created, campaign, adset, ad, situation, goal, stage = "Nuevo", offer = "") {
  const lead = normalizeLead({ id, created_time: new Date(created).toISOString(), full_name: fullName, número_de_whatsapp: whatsapp, campaign_name: campaign, adset_name: adset, ad_name: ad, [questionSituation]: situation, [questionGoal]: goal });
  lead.stage = stage;
  lead.offer = offer || lead.offer;
  if (stage !== "Nuevo") {
    lead.first_contacted_at = new Date(created + 26 * 60 * 1000).toISOString();
    lead.response_minutes = diffMinutes(lead.created_time, lead.first_contacted_at);
  }
  if (id === "105") {
    lead.next_action = "Confirmar horario de cita";
    lead.next_action_at = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  }
  return lead;
}

function urgencyFor(lead) {
  if (lead.stage !== "Nuevo") return { level: "green", label: "Contactado" };
  const minutes = diffMinutes(lead.created_time, new Date().toISOString());
  if (minutes < 15) return { level: "green", label: "Nuevo" };
  if (minutes <= 60) return { level: "yellow", label: "Responder pronto" };
  return { level: "red", label: "Más de 1h" };
}

function attemptLabel(attempts) {
  const count = Math.min(3, Math.max(1, Number(attempts || 1)));
  return `Contactado ${count} ${count === 1 ? "vez" : "veces"}`;
}

function platformFor(lead) {
  const source = `${lead.ad_name || ""} ${lead.adset_name || ""} ${lead.campaign_name || ""}`.toLowerCase();
  return source.includes("instagram") || source.includes("ig") ? "ig" : "fb";
}

function reachedStage(lead, stage) {
  if (lead.stage === "No respondió" && !["Contactado"].includes(stage)) return false;
  const target = STAGES.indexOf(stage);
  const current = STAGES.indexOf(lead.stage);
  return current >= target && lead.stage !== "Perdido";
}

function editBenchmarks() {
  const benchmarks = loadBenchmarks();
  const next = { ...benchmarks };
  Object.keys(next).forEach((key) => {
    const value = prompt(`Benchmark ${key} (%)`, next[key]);
    if (value !== null && !Number.isNaN(Number(value))) next[key] = Number(value);
  });
  localStorage.setItem(BENCHMARK_KEY, JSON.stringify(next));
  renderDashboard();
}

function loadBenchmarks() {
  return { ...defaultBenchmarks, ...JSON.parse(localStorage.getItem(BENCHMARK_KEY) || "{}") };
}

function loadState() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"leads":[]}');
  return { ...saved, deletedLeadIds: saved.deletedLeadIds || [], sourceUrl: saved.sourceUrl || DEFAULT_SOURCE_URL };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function diffMinutes(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

function timeAgo(value) {
  const minutes = diffMinutes(value, new Date().toISOString());
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} días`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function whatsappUrl(number) {
  const clean = String(number || "").replace(/\D/g, "");
  return clean ? `https://wa.me/${clean}` : "#";
}

function labelize(value) {
  return escapeHtml(String(value || "Sin respuesta").replaceAll("_", " ").replaceAll(" - ", " / "));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function endOfToday(now) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
}
