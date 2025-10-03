const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const { create } = require('xmlbuilder2');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ajuste essas credenciais para seu MySQL local
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '211022', // <<< troque aqui
  database: 'concessionaria',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(DB_CONFIG);

// Teste de conexão no startup (para debug)
pool.getConnection()
  .then((conn) => {
    console.log('✅ Conexão com o banco de dados estabelecida!');
    conn.release();
  })
  .catch((err) => {
    console.error('❌ Erro na conexão com o banco de dados:', err.message);
    process.exit(1);  // Para o servidor se der erro
  });

// Helper: recebe month 'YYYY-MM' opcional e retorna start/end (1 -> 30)
function cycleRangeFromMonth(monthStr) {
  const now = monthStr ? new Date(monthStr + '-01') : new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month, 30);
  const fmt = d => d.toISOString().slice(0,10);
  return { start: fmt(start), end: fmt(end) };
}

// API endpoints

app.post('/api/clients', async (req, res) => {
  const { name, max_amount } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  try {
    const conn = await pool.getConnection();
    const [result] = await conn.execute(
      'INSERT INTO clients (name, max_amount) VALUES (?, ?)',
      [name, max_amount || 150.00]
    );
    conn.release();
    res.json({ id: result.insertId, name, max_amount: max_amount || 150.00 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

app.get('/api/clients', async (req, res) => {
  const month = req.query.month;
  const { start, end } = cycleRangeFromMonth(month);
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute(
      `SELECT c.id, c.name, c.max_amount,
          IFNULL(SUM(p.amount),0) AS received
       FROM clients c
       LEFT JOIN payments p
         ON p.client_id = c.id
         AND p.payment_date BETWEEN ? AND ?
       GROUP BY c.id, c.name, c.max_amount
       ORDER BY c.name`,
      [start, end]
    );
    conn.release();
    const clients = rows.map(r => {
      const received = parseFloat(r.received);
      const max = parseFloat(r.max_amount);
      return {
        id: r.id,
        name: r.name,
        max_amount: Math.round(max*100)/100,
        received: Math.round(received*100)/100,
        remaining: Math.round(Math.max(0, max - received)*100)/100
      };
    });
    res.json({ cycle: { start, end }, clients });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

app.post('/api/payments', async (req, res) => {
  console.log('📥 POST /api/payments - Dados recebidos:', req.body);
  const { client_id, amount, payment_date } = req.body;
  
  if (!client_id || !amount) {
    console.log('❌ Validação: client_id ou amount ausentes');
    return res.status(400).json({ error: 'client_id e amount obrigatórios' });
  }
  
  const clientIdNum = parseInt(client_id);
  if (isNaN(clientIdNum) || clientIdNum <= 0) {
    console.log('❌ client_id inválido:', client_id);
    return res.status(400).json({ error: 'client_id deve ser um número inteiro positivo' });
  }
  
  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    console.log('❌ amount inválido:', amount);
    return res.status(400).json({ error: 'amount deve ser um número positivo' });
  }
  
  const date = payment_date || new Date().toISOString().slice(0, 10);
  console.log('📅 Data:', date, '| Client ID:', clientIdNum, '| Amount:', amountNum);
  
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('🔗 Conexão OK');
    
    // Verificação crucial: client_id existe?
    const [clientCheck] = await conn.execute('SELECT id, name FROM clients WHERE id = ?', [clientIdNum]);
    if (clientCheck.length === 0) {
      console.log('❌ client_id não existe:', clientIdNum);
      return res.status(400).json({ error: `Cliente com ID ${clientIdNum} não encontrado. Clientes disponíveis: rode GET /api/clients` });
    }
    console.log('✅ Cliente OK:', clientCheck[0].name);
    
    const [result] = await conn.execute(
      'INSERT INTO payments (client_id, amount, payment_date) VALUES (?, ?, ?)',
      [clientIdNum, amountNum, date]
    );
    console.log('✅ INSERT sucesso! ID:', result.insertId);
    res.json({ ok: true, id: result.insertId, message: 'Pagamento registrado!' });
  } catch (err) {
    console.error('💥 Erro no INSERT:', err.message);
    console.error('Código:', err.code, '| SQL State:', err.sqlState);
    res.status(500).json({ error: 'Erro ao registrar pagamento', details: err.message });
  } finally {
    if (conn) conn.release();
  }
});

app.get('/api/totals', async (req, res) => {
  const month = req.query.month;
  const { start, end } = cycleRangeFromMonth(month);
  try {
    const conn = await pool.getConnection();
    const [rowsMax] = await conn.execute('SELECT IFNULL(SUM(max_amount),0) AS total_to_receive FROM clients');
    const totalToReceive = parseFloat(rowsMax[0].total_to_receive);
    const [rowsRec] = await conn.execute(
      'SELECT IFNULL(SUM(amount),0) AS total_received FROM payments WHERE payment_date BETWEEN ? AND ?',
      [start, end]
    );
    conn.release();
    const totalReceived = parseFloat(rowsRec[0].total_received);
    const totalRemaining = Math.round(Math.max(0, totalToReceive - totalReceived) * 100)/100;
    res.json({
      cycle: { start, end },
      totalToReceive: Math.round(totalToReceive*100)/100,
      totalReceived: Math.round(totalReceived*100)/100,
      totalRemaining
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao calcular totais' });
  }
});

app.get('/api/export/xml', async (req, res) => {
  const month = req.query.month;
  const { start, end } = cycleRangeFromMonth(month);
  try {
    const conn = await pool.getConnection();
    const [clients] = await conn.execute('SELECT id, name, max_amount FROM clients ORDER BY name');
    const [payments] = await conn.execute(
      'SELECT id, client_id, amount, payment_date FROM payments WHERE payment_date BETWEEN ? AND ? ORDER BY payment_date',
      [start, end]
    );
    conn.release();

    const root = { report: { cycle: { start, end }, clients: [] } };
    const clientsMap = {};
    for (const c of clients) clientsMap[c.id] = { id: c.id, name: c.name, max_amount: parseFloat(c.max_amount), payments: [] };
    for (const p of payments) {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
