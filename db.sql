-- Banco e tabelas para controle de comissões (concessionaria)

-- No Postgres não existe CREATE DATABASE IF NOT EXISTS,
-- você cria o banco direto no Render. Então omitimos essa parte.

-- Tabela clients
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  max_amount NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela payments
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  client_id INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
