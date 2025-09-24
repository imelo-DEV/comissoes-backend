
-- banco e tabelas para controle de comissões (concessionaria)
CREATE DATABASE IF NOT EXISTS concessionaria CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE concessionaria;

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  max_amount DECIMAL(10,2) NOT NULL DEFAULT 150.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- seed example
INSERT INTO clients (name, max_amount) VALUES ('Cliente A', 150.00), ('Cliente B', 150.00);
INSERT INTO payments (client_id, amount, payment_date) VALUES
 (1, 50.00, CURDATE()),
 (1, 25.00, CURDATE()),
 (2, 100.00, CURDATE());
