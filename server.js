const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const { create } = require('xmlbuilder2');
const path = require('path');


const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexão com Postgres no Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Teste de conexão ao iniciar
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Conexão com o banco de dados estabelecida!');
    client.release();
  } catch (err) {
    console.error('❌ Erro na conexão com o banco de dados:', err.message);
    process.exit(1);
  }
})();

// Helper: recebe month 'YYYY-MM' opcional e retorna start/end (1 -> 30)
function cycleRangeFromMonth(monthStr) {
  const now = monthStr ? new Date(monthStr + '-01') : new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month, 30);
  const fmt = d => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

// ==================== API ENDPOINTS ====================

// Criar cliente
app.post('/api/clients', async (req, res) => {
  const { name, max_amount } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const result = await pool.query(
      'INSERT INTO clients (name, max_amount) VALUES ($1, $2) RETURNING id, name, max_amount',
      [name, max_amount || 150.00]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

// Listar clientes
app.get('/api/clients', async (req, res) => {
  const month = req.query.month;
  const { start, end } = cycleRangeFromMonth(month);
  try {
    const query = `
      SELECT c.id, c.name, c.max_amount,
             COALESCE(SUM(p.amount), 0) AS received
      FROM clients c
      LEFT JOIN payments p
        ON p.client_id = c.id
       AND p.payment_date BETWEEN $1 AND $2
      GROUP BY c.id, c.name, c.max_amount
      ORDER BY c.name;
    `;
    const { rows } = await pool.query(query, [start, end]);
    const clients = rows.map(r => {
      const received = parseFloat(r.received);
      const max = parseFloat(r.max_amount);
      return {
        id: r.id,
        name: r.name,
        max_amount: +max.toFixed(2),
        received: +received.toFixed(2),
        remaining: +(Math.max(0, max - received)).toFixed(2)
      };
    });
    res.json({ cycle: { start, end }, clients });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

// Registrar pagamento
app.post('/api/payments', async (req, res) => {
  const { client_id, amount, payment_date } = req.body;
  if (!client_id || !amount) return res.status(400).json({ error: 'client_id e amount obrigatórios' });

  const date = payment_date || new Date().toISOString().slice(0, 10);
  try {
    // Verifica se o cliente existe
    const check = await pool.query('SELECT id FROM clients WHERE id = $1', [client_id]);
    if (check.rowCount === 0) {
      return res.status(400).json({ error: `Cliente com ID ${client_id} não encontrado` });
    }

    await pool.query(
      'INSERT INTO payments (client_id, amount, payment_date) VALUES ($1, $2, $3)',
      [client_id, amount, date]
    );

    res.json({ ok: true, message: 'Pagamento registrado!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar pagamento', details: err.message });
  }
});

// Totais
app.get('/api/totals', async (req, res) => {
  const month = req.query.month;
  const { start, end } = cycleRangeFromMonth(month);
  try {
    const totalToReceiveRes = await pool.query('SELECT COALESCE(SUM(max_amount),0) AS total_to_receive FROM clients');
    const totalToReceive = parseFloat(totalToReceiveRes.rows[0].total_to_receive);

    const totalReceivedRes = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS total_received FROM payments WHERE payment_date BETWEEN $1 AND $2',
      [start, end]
    );
    const totalReceived = parseFloat(totalReceivedRes.rows[0].total_received);

    const totalRemaining = +(Math.max(0, totalToReceive - totalReceived)).toFixed(2);

    res.json({
      cycle: { start, end },
      totalToReceive: +totalToReceive.toFixed(2),
      totalReceived: +totalReceived.toFixed(2),
      totalRemaining
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao calcular totais' });
  }
});

// Exportar XML
app.get('/api/export/xml', async (req, res) => {
  const month = req.query.month;
  const { start, end } = cycleRangeFromMonth(month);
  try {
    const clientsRes = await pool.query('SELECT id, name, max_amount FROM clients ORDER BY name');
    const paymentsRes = await pool.query(
      'SELECT client_id, amount, payment_date FROM payments WHERE payment_date BETWEEN $1 AND $2 ORDER BY payment_date',
      [start, end]
    );

    const root = { report: { cycle: { start, end }, clients: [] } };
    const clientsMap = {};
    for (const c of clientsRes.rows) {
      clientsMap[c.id] = { id: c.id, name: c.name, max_amount: parseFloat(c.max_amount), payments: [] };
    }
    for (const p of paymentsRes.rows) {
      if (clientsMap[p.client_id]) clientsMap[p.client_id].payments.push({ amount: parseFloat(p.amount), date: p.payment_date });
    }
    for (const id in clientsMap) {
      const c = clientsMap[id];
      const received = c.payments.reduce((s, x) => s + x.amount, 0);
      const remaining = Math.max(0, c.max_amount - received);
      root.report.clients.push({
        client: {
          id: c.id,
          name: c.name,
          max_amount: c.max_amount.toFixed(2),
          received: received.toFixed(2),
          remaining: remaining.toFixed(2),
          payments: { payment: c.payments.map(p => ({ amount: p.amount.toFixed(2), date: p.date })) }
        }
      });
    }

    const doc = create(root);
    const xml = doc.end({ prettyPrint: true });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio_${start}_to_${end}.xml"`);
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar XML' });
  }
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
