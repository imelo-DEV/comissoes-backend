
Concessionaria - Controle de Comissões (Node.js + MySQL)

Como usar:
1) Instale MySQL e rode o script db.sql (ou importe no Workbench):
   - o script cria o banco 'concessionaria' e as tabelas 'clients' e 'payments' com seed de exemplo.

2) Ajuste credenciais no arquivo server.js (variável DB_CONFIG -> password, user, host se necessário).

3) Na pasta do projeto rode:
   npm install
   npm start

4) Abra no navegador: http://localhost:3000/
   - Cadastre clientes (valor máximo padrão R$150)
   - Registre pagamentos parciais
   - Selecione mês (campo month) para ver o período 1->30 do mês selecionado
   - Exporte XML com os dados do período via botão 'Exportar XML'

Observações:
- O backend usa queries parametrizadas (mysql2/promise).
- O XML gerado é simples e pode ser aberto pelo Excel (ou importado como XML).
- Futuras melhorias: autenticação, bloqueio de período após fechamento, exportar XLSX direto, validações.
