
const api = {
  clients: (m) => `/api/clients${m ? '?month='+m : ''}`,
  totals: (m) => `/api/totals${m ? '?month='+m : ''}`,
  addClient: '/api/clients',
  addPayment: '/api/payments',
  exportXml: (m) => `/api/export/xml${m ? '?month='+m : ''}`
};

const $ = id => document.getElementById(id);

async function fetchClients() {
  const month = getMonthVal();
  const res = await fetch(api.clients(month));
  return res.json();
}

async function fetchTotals() {
  const month = getMonthVal();
  const res = await fetch(api.totals(month));
  return res.json();
}

function getMonthVal() {
  const m = $('month').value;
  if (!m) return null;
  return m;
}

async function refreshAll() {
  const month = getMonthVal();
  const [clientsRes, totalsRes] = await Promise.all([fetchClients(), fetchTotals()]);
  renderClients(clientsRes.clients || []);
  renderTotals(totalsRes);
  populateClientSelect(clientsRes.clients || []);
}

function renderClients(clients) {
  const tbody = document.querySelector('#clientsTable tbody');
  tbody.innerHTML = '';
  clients.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td>R$ ${c.received.toFixed(2)}</td>
      <td>R$ ${c.remaining.toFixed(2)}</td>
      <td>R$ ${c.max_amount.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderTotals(t) {
  if (!t) { $('totals').textContent = ''; return; }
  $('totals').innerHTML = `
    <div class="card small">
      Período: <strong>${t.cycle.start}</strong> → <strong>${t.cycle.end}</strong><br>
      Total a receber: <strong>R$ ${t.totalToReceive.toFixed(2)}</strong><br>
      Total recebido: <strong>R$ ${t.totalReceived.toFixed(2)}</strong><br>
      Total faltante: <strong>R$ ${t.totalRemaining.toFixed(2)}</strong>
    </div>
  `;
}

function populateClientSelect(clients) {
  const sel = $('selectClient');
  sel.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = '';
  opt.text = '-- selecione cliente --';
  sel.appendChild(opt);
  clients.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id;
    o.text = `${c.name} (faltam R$ ${c.remaining.toFixed(2)})`;
    sel.appendChild(o);
  });
}

async function addClient() {
  const name = $('clientName').value.trim();
  const max = parseFloat($('clientMax').value) || 150.00;
  if (!name) return alert('Informe o nome do cliente');
  await fetch(api.addClient, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, max_amount: max })
  });
  $('clientName').value=''; $('clientMax').value='';
  await refreshAll();
}

async function addPayment() {
  const clientId = parseInt($('selectClient').value);
  const amount = parseFloat($('payAmount').value);
  const date = $('payDate').value || (new Date()).toISOString().slice(0,10);
  if (!clientId) return alert('Selecione um cliente');
  if (!amount || amount <= 0) return alert('Insira um valor válido');
  await fetch(api.addPayment, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ client_id: clientId, amount, payment_date: date })
  });
  $('payAmount').value=''; $('payDate').value='';
  await refreshAll();
}

async function exportXml() {
  const month = getMonthVal();
  const url = api.exportXml(month);
  window.location = url;
}

function escapeHtml(str){ return String(str).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

document.addEventListener('DOMContentLoaded', () => {
  $('btnRefresh').addEventListener('click', refreshAll);
  $('btnAddClient').addEventListener('click', addClient);
  $('btnAddPayment').addEventListener('click', addPayment);
  $('btnExportXml').addEventListener('click', exportXml);

  const now = new Date();
  const mm = now.toISOString().slice(0,7);
  $('month').value = mm;

  refreshAll();
});
