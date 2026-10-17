# FinTrack Pro — Controle de Despesas e Orçamento (SQLite + IndexedDB)

Aplicação web completa para gestão financeira pessoal e familiar com banco de dados relacional **SQLite (via WebAssembly `sql.js`)** persistido automaticamente no `IndexedDB` do navegador — pronta para abrir direto no navegador sem precisar instalar Node.js ou servidores externos.

## ✨ Funcionalidades Incluídas

1. **Dashboard Financeiro Interativo**
   - Resumo em tempo real de **Saldo do Mês**, **Receitas**, **Despesas** (efetivadas vs. pendentes) e **% do Orçamento Consumido**.
   - Comparativo percentual automático com o mês anterior.
   - Gráficos interativos (`Chart.js`): **Despesas por Categoria (Rosca)** e **Evolução Mensal (Barras Receitas vs. Despesas)**.
2. **Cadastro de Receitas, Despesas, Parcelamentos e Gastos Fixos**
   - Suporte a lançamentos **Únicos**, **Parcelados (2x a 60x)** e **Fixos/Recorrentes Mensais** (gera automaticamente as parcelas nos meses seguintes com vínculo de grupo).
   - Alternância rápida entre **Pago/Efetivado** e **Pendente** com um clique na tabela.
3. **Metas e Orçamento Mensal por Categoria**
   - Defina tetos de gastos para cada categoria (Alimentação, Moradia, Lazer, Transporte, etc.).
   - Barras de progresso inteligentes e **alertas automáticos no topo do painel** ao atingir 80% (Atenção) ou 100% (Limite Excedido).
4. **Filtros Avançados e Categorias Personalizáveis**
   - Filtre lançamentos por período (navegador de meses), texto, tipo, categoria, status e modalidade.
   - Crie novas categorias com ícone (emoji) e cor personalizada para os gráficos.
5. **Banco de Dados SQLite Real + Exportação/Importação**
   - Exporte e importe o arquivo binário **`.sqlite`** (compatível com DBeaver, DB Browser for SQLite, etc.), **`.json`** ou planilhas **`.csv`** (compatível com Excel).
   - **Console SQL Interativo** integrado na aba *Banco SQLite & Dados* para rodar consultas SQL personalizadas.

## 🚀 Como Executar

Basta dar um duplo clique no arquivo [`index.html`](./index.html) para abrir diretamente no seu navegador padrão.
