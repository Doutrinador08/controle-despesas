/**
 * FinTrack Pro - Aplicação Completa de Controle de Despesas e Orçamento
 */

const state = {
  currentYearMonth: '', // Formato 'YYYY-MM'
  activeView: 'dashboard',
  txModalType: 'expense',
  editingTxId: null,
  filters: {
    search: '',
    type: 'all',
    category: 'all',
    status: 'all',
    recurrence: 'all'
  },
  charts: {
    categoryChart: null,
    evolutionChart: null
  }
};

// Utilitários de Formatação
function formatCurrency(val) {
  return Number(val || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDateBR(isoDate) {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getMonthLabel(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function shiftYearMonth(yearMonth, deltaMonths) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  if (type === 'success') el.style.borderLeftColor = 'var(--success)';
  if (type === 'danger') el.style.borderLeftColor = 'var(--danger)';
  if (type === 'warning') el.style.borderLeftColor = 'var(--warning)';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

// Inicialização da Aplicação
window.addEventListener('DOMContentLoaded', async () => {
  const now = new Date();
  state.currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Tema salvo
  const savedTheme = localStorage.getItem('fintrack_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButton(savedTheme);

  await window.expenseDB.init();
  updateDbStatusBadge();

  bindEvents();
  refreshAll();
});

function updateDbStatusBadge() {
  const label = document.getElementById('dbModeLabel');
  if (!label) return;
  if (window.expenseDB.mode === 'sqlite-wasm') {
    label.innerHTML = `<span class="db-status-dot"></span> SQLite WASM + IndexedDB`;
  } else {
    label.innerHTML = `<span class="db-status-dot" style="background:#f59e0b"></span> Banco Local Ativo`;
  }
}

function bindEvents() {
  // Navegação lateral
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.getAttribute('data-view'));
    });
  });

  // Navegação de Mês
  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    state.currentYearMonth = shiftYearMonth(state.currentYearMonth, -1);
    refreshAll();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    state.currentYearMonth = shiftYearMonth(state.currentYearMonth, 1);
    refreshAll();
  });

  document.getElementById('currentMonthLabel').addEventListener('click', () => {
    const now = new Date();
    state.currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    refreshAll();
    showToast('Retornado para o mês atual');
  });

  // Alternar Tema
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('fintrack_theme', next);
    updateThemeButton(next);
    renderCharts();
  });

  // Abrir Modal Nova Transação
  document.getElementById('openNewTxBtn').addEventListener('click', () => openTransactionModal());

  // Fechar Modal
  document.getElementById('closeTxModalBtn').addEventListener('click', closeTransactionModal);
  document.getElementById('cancelTxModalBtn').addEventListener('click', closeTransactionModal);

  // Alternar Tipo Receita / Despesa no Modal
  document.getElementById('switchExpenseBtn').addEventListener('click', () => setModalTxType('expense'));
  document.getElementById('switchIncomeBtn').addEventListener('click', () => setModalTxType('income'));

  // Recorrência no Modal
  document.getElementById('txRecurrence').addEventListener('change', (e) => {
    const val = e.target.value;
    const instGroup = document.getElementById('installmentsFieldGroup');
    const instLabel = document.getElementById('installmentsLabel');
    if (val === 'single') {
      instGroup.style.display = 'none';
    } else if (val === 'installment') {
      instGroup.style.display = 'flex';
      instLabel.textContent = 'Número de Parcelas (2x a 48x)';
      document.getElementById('txInstallments').value = 3;
    } else if (val === 'fixed') {
      instGroup.style.display = 'flex';
      instLabel.textContent = 'Repetir por quantos meses?';
      document.getElementById('txInstallments').value = 12;
    }
  });

  // Submissão do Formulário de Transação
  document.getElementById('txForm').addEventListener('submit', handleSaveTransaction);

  // Filtros da aba Transações
  document.getElementById('filterSearch').addEventListener('input', (e) => {
    state.filters.search = e.target.value.toLowerCase();
    renderTransactionsTable();
  });
  document.getElementById('filterType').addEventListener('change', (e) => {
    state.filters.type = e.target.value;
    renderTransactionsTable();
  });
  document.getElementById('filterCategory').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    renderTransactionsTable();
  });
  document.getElementById('filterStatus').addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    renderTransactionsTable();
  });
  document.getElementById('filterRecurrence').addEventListener('change', (e) => {
    state.filters.recurrence = e.target.value;
    renderTransactionsTable();
  });

  // Formulário Nova Categoria
  document.getElementById('categoryForm').addEventListener('submit', handleAddCategory);

  // Botões de Exportação e Banco de Dados
  document.getElementById('exportCsvBtn').addEventListener('click', exportMonthCSV);
  document.getElementById('exportAllCsvBtn').addEventListener('click', exportAllCSV);
  document.getElementById('exportJsonBtn').addEventListener('click', exportJSONFile);
  document.getElementById('exportSqliteBtn').addEventListener('click', exportSQLiteFile);

  document.getElementById('importFileInput').addEventListener('change', handleFileImport);
  document.getElementById('runSqlBtn').addEventListener('click', handleRunCustomSQL);
  document.getElementById('resetDemoBtn').addEventListener('click', async () => {
    if (confirm('Deseja restaurar os dados de demonstração? Os lançamentos atuais serão substituídos.')) {
      await window.expenseDB.resetWithDemoData();
      refreshAll();
      showToast('Dados de demonstração restaurados com sucesso!', 'success');
    }
  });
  document.getElementById('clearDbBtn').addEventListener('click', async () => {
    if (confirm('Tem certeza que deseja zerar todas as transações cadastradas? As categorias e metas serão mantidas.')) {
      await window.expenseDB.clearAllTransactions();
      refreshAll();
      showToast('Todas as transações foram removidas.', 'warning');
    }
  });
}

function updateThemeButton(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro';
  }
}

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-view') === viewName);
  });
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });
  refreshAll();
}

function refreshAll() {
  document.getElementById('currentMonthLabel').textContent = getMonthLabel(state.currentYearMonth);
  populateCategorySelects();
  renderDashboard();
  renderTransactionsTable();
  renderBudgetsView();
  renderCategoriesView();
}

function getCategoryMetaMap() {
  const cats = window.expenseDB.getCategories();
  const map = {};
  cats.forEach(c => {
    map[c.name] = c;
  });
  return map;
}

function populateCategorySelects() {
  const cats = window.expenseDB.getCategories();
  const filterCat = document.getElementById('filterCategory');
  const currentFilterVal = filterCat.value;

  filterCat.innerHTML = `<option value="all">Todas as Categorias</option>` +
    cats.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  filterCat.value = currentFilterVal || 'all';

  updateModalCategoryOptions();
}

function updateModalCategoryOptions(selectedCategory = null) {
  const cats = window.expenseDB.getCategories().filter(c => c.type === state.txModalType);
  const select = document.getElementById('txCategory');
  select.innerHTML = cats.map(c => `<option value="${c.name}">${c.icon} ${c.name}</option>`).join('');
  if (selectedCategory && cats.some(c => c.name === selectedCategory)) {
    select.value = selectedCategory;
  }
}

// ==========================================
// DASHBOARD & GRÁFICOS
// ==========================================
function renderDashboard() {
  const txs = window.expenseDB.getTransactionsByMonth(state.currentYearMonth);
  const prevMonth = shiftYearMonth(state.currentYearMonth, -1);
  const prevTxs = window.expenseDB.getTransactionsByMonth(prevMonth);
  const budgets = window.expenseDB.getBudgets();
  const catMap = getCategoryMetaMap();

  const incomeTotal = txs.filter(t => t.type === 'income').reduce((acc, t) => acc + Number(t.amount), 0);
  const expenseTotal = txs.filter(t => t.type === 'expense').reduce((acc, t) => acc + Number(t.amount), 0);
  const balance = incomeTotal - expenseTotal;

  const paidIncome = txs.filter(t => t.type === 'income' && t.paid).reduce((acc, t) => acc + Number(t.amount), 0);
  const paidExpense = txs.filter(t => t.type === 'expense' && t.paid).reduce((acc, t) => acc + Number(t.amount), 0);
  const pendingExpense = expenseTotal - paidExpense;

  const prevExpenseTotal = prevTxs.filter(t => t.type === 'expense').reduce((acc, t) => acc + Number(t.amount), 0);
  let expenseDiffText = 'Sem dados no mês anterior';
  if (prevExpenseTotal > 0) {
    const diffPct = ((expenseTotal - prevExpenseTotal) / prevExpenseTotal) * 100;
    const sign = diffPct > 0 ? '+' : '';
    expenseDiffText = `${sign}${diffPct.toFixed(1)}% vs. mês anterior`;
  }

  const totalBudgetLimit = Object.values(budgets).reduce((acc, v) => acc + Number(v), 0);
  const budgetPct = totalBudgetLimit > 0 ? (expenseTotal / totalBudgetLimit) * 100 : 0;

  // Atualiza KPIs
  const balanceEl = document.getElementById('kpiBalance');
  balanceEl.textContent = formatCurrency(balance);
  balanceEl.className = `kpi-value ${balance >= 0 ? 'positive' : 'negative'}`;
  document.getElementById('kpiBalanceSub').textContent = `Saldo efetivado hoje: ${formatCurrency(paidIncome - paidExpense)}`;

  document.getElementById('kpiIncome').textContent = formatCurrency(incomeTotal);
  document.getElementById('kpiIncomeSub').textContent = `Recebido: ${formatCurrency(paidIncome)}`;

  document.getElementById('kpiExpense').textContent = formatCurrency(expenseTotal);
  document.getElementById('kpiExpenseSub').textContent = `Pendente a pagar: ${formatCurrency(pendingExpense)} (${expenseDiffText})`;

  document.getElementById('kpiBudget').textContent = totalBudgetLimit > 0 ? `${budgetPct.toFixed(0)}%` : 'Sem meta';
  document.getElementById('kpiBudgetSub').textContent = totalBudgetLimit > 0
    ? `${formatCurrency(expenseTotal)} de ${formatCurrency(totalBudgetLimit)}`
    : 'Defina limites na aba Metas';

  // Verifica Alertas de Orçamento por Categoria
  const expenseByCategory = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + Number(t.amount);
  });

  const alertsContainer = document.getElementById('budgetAlertsContainer');
  alertsContainer.innerHTML = '';
  for (const [catName, limit] of Object.entries(budgets)) {
    if (limit <= 0) continue;
    const spent = expenseByCategory[catName] || 0;
    const ratio = (spent / limit) * 100;
    const icon = catMap[catName]?.icon || '⚠️';
    if (ratio >= 100) {
      const banner = document.createElement('div');
      banner.className = 'alert-banner danger';
      banner.innerHTML = `
        <span>🚨 <strong>Limite Excedido em ${icon} ${catName}:</strong> Você gastou <strong>${formatCurrency(spent)}</strong> de uma meta de ${formatCurrency(limit)} (${ratio.toFixed(0)}%).</span>
        <button class="btn btn-sm btn-secondary" onclick="switchView('budgets')">Ajustar Meta</button>
      `;
      alertsContainer.appendChild(banner);
    } else if (ratio >= 80) {
      const banner = document.createElement('div');
      banner.className = 'alert-banner warning';
      banner.innerHTML = `
        <span>⚠️ <strong>Atenção em ${icon} ${catName}:</strong> Você já atingiu <strong>${ratio.toFixed(0)}%</strong> do orçamento mensal (${formatCurrency(spent)} de ${formatCurrency(limit)}).</span>
        <button class="btn btn-sm btn-secondary" onclick="switchView('budgets')">Ver Metas</button>
      `;
      alertsContainer.appendChild(banner);
    }
  }

  // Lista rápida das últimas 6 transações do mês no Dashboard
  const recentTbody = document.getElementById('dashboardRecentTbody');
  const recentSlice = txs.slice(0, 6);
  if (recentSlice.length === 0) {
    recentTbody.innerHTML = `<tr><td colspan="5" class="empty-state">Nenhum lançamento neste mês. Clique em "+ Novo Lançamento" para adicionar!</td></tr>`;
  } else {
    recentTbody.innerHTML = recentSlice.map(t => {
      const cat = catMap[t.category] || { icon: '🏷️', color: '#64748b' };
      const isIncome = t.type === 'income';
      return `
        <tr>
          <td>${formatDateBR(t.date)}</td>
          <td>
            <div style="font-weight:600">${escapeHtml(t.description)}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary)">${t.payment_method}</div>
          </td>
          <td><span class="category-pill">${cat.icon} ${escapeHtml(t.category)}</span></td>
          <td>
            <span class="badge ${t.paid ? 'badge-paid' : 'badge-pending'}" onclick="quickTogglePaid('${t.id}')" title="Clique para alternar status">
              ${t.paid ? '✓ Efetivado' : '⏳ Pendente'}
            </span>
          </td>
          <td style="text-align:right;font-weight:700;color:${isIncome ? 'var(--success)' : 'var(--danger)'}">
            ${isIncome ? '+' : '-'} ${formatCurrency(t.amount)}
          </td>
        </tr>
      `;
    }).join('');
  }

  renderCharts();
}

function renderCharts() {
  const txs = window.expenseDB.getTransactionsByMonth(state.currentYearMonth);
  const catMap = getCategoryMetaMap();

  // Dados para gráfico de pizza/rosca por categoria
  const expByCat = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    expByCat[t.category] = (expByCat[t.category] || 0) + Number(t.amount);
  });

  const catLabels = Object.keys(expByCat);
  const catValues = catLabels.map(k => expByCat[k]);
  const catColors = catLabels.map(k => catMap[k]?.color || '#6366f1');

  // Dados para Evolução dos últimos 6 meses
  const months = [];
  const monthLabels = [];
  const monthIncomes = [];
  const monthExpenses = [];

  for (let i = -4; i <= 1; i++) {
    const ym = shiftYearMonth(state.currentYearMonth, i);
    months.push(ym);
    const [y, m] = ym.split('-').map(Number);
    const shortName = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    monthLabels.push(shortName);

    const mTxs = window.expenseDB.getTransactionsByMonth(ym);
    const inc = mTxs.filter(t => t.type === 'income').reduce((a, b) => a + Number(b.amount), 0);
    const exp = mTxs.filter(t => t.type === 'expense').reduce((a, b) => a + Number(b.amount), 0);
    monthIncomes.push(inc);
    monthExpenses.push(exp);
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const textColor = isLight ? '#5b21b6' : '#c4b5fd';
  const gridColor = isLight ? 'rgba(88, 28, 135, 0.08)' : 'rgba(168, 85, 247, 0.14)';

  if (typeof window.Chart !== 'undefined') {
    const ctxCat = document.getElementById('categoryChartCanvas').getContext('2d');
    if (state.charts.categoryChart) state.charts.categoryChart.destroy();

    if (catLabels.length === 0) {
      state.charts.categoryChart = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: ['Sem despesas no mês'],
          datasets: [{ data: [1], backgroundColor: [gridColor], borderWidth: 0 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } }, tooltip: { enabled: false } }
        }
      });
    } else {
      state.charts.categoryChart = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: catLabels,
          datasets: [{
            data: catValues,
            backgroundColor: catColors,
            borderWidth: 2,
            borderColor: isLight ? '#ffffff' : '#140924'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '64%',
          plugins: {
            legend: {
              position: 'right',
              labels: { color: textColor, padding: 14, font: { size: 12 } }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.parsed;
                  const total = catValues.reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return ` ${ctx.label}: ${formatCurrency(val)} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }

    const ctxEvo = document.getElementById('evolutionChartCanvas').getContext('2d');
    if (state.charts.evolutionChart) state.charts.evolutionChart.destroy();

    state.charts.evolutionChart = new Chart(ctxEvo, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: 'Receitas',
            data: monthIncomes,
            backgroundColor: '#10e862',
            borderRadius: 6
          },
          {
            label: 'Despesas',
            data: monthExpenses,
            backgroundColor: '#a855f7',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: textColor },
            grid: { display: false }
          },
          y: {
            ticks: {
              color: textColor,
              callback: (v) => 'R$ ' + v.toLocaleString('pt-BR')
            },
            grid: { color: gridColor }
          }
        },
        plugins: {
          legend: {
            labels: { color: textColor }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
            }
          }
        }
      }
    });
  }
}

// ==========================================
// TRANSAÇÕES (LISTAGEM, FILTROS E MODAL)
// ==========================================
function renderTransactionsTable() {
  const txs = window.expenseDB.getTransactionsByMonth(state.currentYearMonth);
  const catMap = getCategoryMetaMap();

  const filtered = txs.filter(t => {
    if (state.filters.type !== 'all' && t.type !== state.filters.type) return false;
    if (state.filters.category !== 'all' && t.category !== state.filters.category) return false;
    if (state.filters.status !== 'all') {
      const isPaid = Boolean(t.paid);
      if (state.filters.status === 'paid' && !isPaid) return false;
      if (state.filters.status === 'pending' && isPaid) return false;
    }
    if (state.filters.recurrence !== 'all' && t.recurrence !== state.filters.recurrence) return false;
    if (state.filters.search) {
      const hay = `${t.description} ${t.category} ${t.payment_method} ${t.notes || ''}`.toLowerCase();
      if (!hay.includes(state.filters.search)) return false;
    }
    return true;
  });

  const tbody = document.getElementById('transactionsTbody');
  const summaryFooter = document.getElementById('filteredSummaryText');

  const sumFiltered = filtered.reduce((acc, t) => {
    return acc + (t.type === 'income' ? Number(t.amount) : -Number(t.amount));
  }, 0);
  summaryFooter.innerHTML = `Exibindo <strong>${filtered.length}</strong> lançamento(s) • Saldo dos itens filtrados: <strong style="color:${sumFiltered >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(sumFiltered)}</strong>`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhuma transação encontrada para os filtros selecionados neste mês.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => {
    const cat = catMap[t.category] || { icon: '🏷️', color: '#64748b' };
    const isIncome = t.type === 'income';
    let recBadge = '<span class="badge" style="background:var(--bg-tertiary);color:var(--text-secondary)">Única</span>';
    if (t.recurrence === 'installment') {
      recBadge = `<span class="badge badge-recurrence">💳 Parcela ${t.installment_current}/${t.installment_total}</span>`;
    } else if (t.recurrence === 'fixed') {
      recBadge = `<span class="badge badge-recurrence">🔄 Fixa Mensal</span>`;
    }

    return `
      <tr>
        <td>${formatDateBR(t.date)}</td>
        <td>
          <div style="font-weight:600">${escapeHtml(t.description)}</div>
          ${t.notes ? `<div style="font-size:0.75rem;color:var(--text-secondary)">${escapeHtml(t.notes)}</div>` : ''}
        </td>
        <td><span class="category-pill">${cat.icon} ${escapeHtml(t.category)}</span></td>
        <td>
          <div>${escapeHtml(t.payment_method)}</div>
          <div style="margin-top:0.2rem">${recBadge}</div>
        </td>
        <td>
          <span class="badge ${t.paid ? 'badge-paid' : 'badge-pending'}" onclick="quickTogglePaid('${t.id}')" title="Clique para alternar entre Pago e Pendente">
            ${t.paid ? '✓ Efetivado' : '⏳ Pendente'}
          </span>
        </td>
        <td style="text-align:right;font-weight:700;color:${isIncome ? 'var(--success)' : 'var(--danger)'}">
          ${isIncome ? '+' : '-'} ${formatCurrency(t.amount)}
        </td>
        <td style="text-align:right;white-space:nowrap">
          <button class="btn btn-sm btn-secondary" onclick="editTransaction('${t.id}')" title="Editar">✏️</button>
          <button class="btn btn-sm btn-secondary" onclick="removeTransaction('${t.id}')" title="Excluir">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.quickTogglePaid = async function(id) {
  await window.expenseDB.toggleTransactionPaid(id);
  refreshAll();
  showToast('Status do lançamento atualizado!', 'success');
};

function setModalTxType(type) {
  state.txModalType = type;
  const expBtn = document.getElementById('switchExpenseBtn');
  const incBtn = document.getElementById('switchIncomeBtn');
  expBtn.className = `type-switch-btn ${type === 'expense' ? 'active-expense' : ''}`;
  incBtn.className = `type-switch-btn ${type === 'income' ? 'active-income' : ''}`;
  updateModalCategoryOptions();
}

function openTransactionModal(txToEdit = null) {
  const modal = document.getElementById('txModalOverlay');
  const title = document.getElementById('txModalTitle');
  const recurrenceSection = document.getElementById('recurrenceContainer');

  if (txToEdit) {
    state.editingTxId = txToEdit.id;
    title.textContent = 'Editar Lançamento';
    setModalTxType(txToEdit.type);
    document.getElementById('txDescription').value = txToEdit.description;
    document.getElementById('txAmount').value = txToEdit.amount;
    document.getElementById('txDate').value = txToEdit.date;
    updateModalCategoryOptions(txToEdit.category);
    document.getElementById('txPaymentMethod').value = txToEdit.payment_method || 'PIX';
    document.getElementById('txPaid').checked = Boolean(txToEdit.paid);
    document.getElementById('txNotes').value = txToEdit.notes || '';
    recurrenceSection.style.display = 'none';
  } else {
    state.editingTxId = null;
    title.textContent = 'Novo Lançamento Financeiro';
    setModalTxType('expense');
    document.getElementById('txForm').reset();
    const todayIso = `${state.currentYearMonth}-${String(new Date().getDate()).padStart(2, '0')}`;
    document.getElementById('txDate').value = todayIso;
    document.getElementById('txPaid').checked = true;
    document.getElementById('txRecurrence').value = 'single';
    document.getElementById('installmentsFieldGroup').style.display = 'none';
    recurrenceSection.style.display = 'contents';
    updateModalCategoryOptions();
  }

  modal.classList.add('open');
}

function closeTransactionModal() {
  document.getElementById('txModalOverlay').classList.remove('open');
  state.editingTxId = null;
}

window.editTransaction = function(id) {
  const all = window.expenseDB.getAllTransactions();
  const found = all.find(t => t.id === id);
  if (found) openTransactionModal(found);
};

window.removeTransaction = async function(id) {
  const all = window.expenseDB.getAllTransactions();
  const found = all.find(t => t.id === id);
  if (!found) return;

  if (found.group_id) {
    const deleteAllGroup = confirm(
      `"${found.description}" faz parte de um parcelamento ou recorrência.\n\n` +
      `Clique em OK para excluir TODAS as parcelas/recorrências vinculadas, ou em Cancelar para escolher excluir apenas este mês.`
    );
    if (deleteAllGroup) {
      await window.expenseDB.deleteTransaction(id, true, found.group_id);
      refreshAll();
      showToast('Todas as parcelas/recorrências do grupo foram excluídas.', 'warning');
      return;
    }
  }

  if (confirm(`Deseja excluir o lançamento "${found.description}"?`)) {
    await window.expenseDB.deleteTransaction(id, false);
    refreshAll();
    showToast('Lançamento excluído.', 'warning');
  }
};

async function handleSaveTransaction(e) {
  e.preventDefault();
  const description = document.getElementById('txDescription').value.trim();
  const amount = parseFloat(document.getElementById('txAmount').value);
  const date = document.getElementById('txDate').value;
  const category = document.getElementById('txCategory').value;
  const payment_method = document.getElementById('txPaymentMethod').value;
  const paid = document.getElementById('txPaid').checked ? 1 : 0;
  const notes = document.getElementById('txNotes').value.trim();

  if (!description || isNaN(amount) || amount <= 0 || !date) {
    showToast('Preencha a descrição, um valor válido e a data.', 'danger');
    return;
  }

  if (state.editingTxId) {
    await window.expenseDB.updateTransaction({
      id: state.editingTxId,
      description,
      amount,
      type: state.txModalType,
      category,
      date,
      payment_method,
      paid,
      notes
    });
    showToast('Lançamento atualizado com sucesso!', 'success');
  } else {
    const recurrence = document.getElementById('txRecurrence').value;
    const count = Math.max(1, Math.min(60, parseInt(document.getElementById('txInstallments').value || '1', 10)));
    const createdAt = new Date().toISOString();

    if (recurrence === 'single' || count === 1) {
      await window.expenseDB.addTransactionBatch([{
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        description,
        amount,
        type: state.txModalType,
        category,
        date,
        payment_method,
        recurrence: 'single',
        installment_current: 1,
        installment_total: 1,
        group_id: null,
        paid,
        notes,
        created_at: createdAt
      }]);
      showToast('Lançamento registrado com sucesso!', 'success');
    } else {
      // Gera os lançamentos parcelados ou fixos mensais nos meses subsequentes
      const groupId = 'grp_' + Date.now();
      const [baseYear, baseMonth, baseDay] = date.split('-').map(Number);
      const batch = [];

      for (let i = 0; i < count; i++) {
        const targetDate = new Date(baseYear, baseMonth - 1 + i, 1);
        const maxDayInMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
        const day = String(Math.min(baseDay, maxDayInMonth)).padStart(2, '0');
        const ym = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${day}`;

        const suffix = recurrence === 'installment' ? ` (Parcela ${i + 1}/${count})` : '';
        batch.push({
          id: `tx_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          description: `${description}${suffix}`,
          amount,
          type: state.txModalType,
          category,
          date: ym,
          payment_method,
          recurrence,
          installment_current: i + 1,
          installment_total: count,
          group_id: groupId,
          paid: i === 0 ? paid : 0, // A primeira segue o checkbox; as próximas iniciam pendentes
          notes,
          created_at: createdAt
        });
      }

      await window.expenseDB.addTransactionBatch(batch);
      showToast(`${count} lançamentos gerados automaticamente nos meses seguintes!`, 'success');
    }
  }

  closeTransactionModal();
  refreshAll();
}

// ==========================================
// METAS E ORÇAMENTO MENSAL
// ==========================================
function renderBudgetsView() {
  const expenseCategories = window.expenseDB.getCategories().filter(c => c.type === 'expense');
  const budgets = window.expenseDB.getBudgets();
  const txs = window.expenseDB.getTransactionsByMonth(state.currentYearMonth);

  const spentByCat = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    spentByCat[t.category] = (spentByCat[t.category] || 0) + Number(t.amount);
  });

  const container = document.getElementById('budgetsGrid');
  container.innerHTML = expenseCategories.map(cat => {
    const limit = Number(budgets[cat.name] || 0);
    const spent = Number(spentByCat[cat.name] || 0);
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    const barWidth = Math.min(100, pct);
    let statusClass = 'safe';
    if (pct >= 100) statusClass = 'danger';
    else if (pct >= 75) statusClass = 'warning';

    const remaining = limit - spent;

    return `
      <div class="budget-card">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:0.5rem;font-weight:600;font-size:1rem">
            <span style="font-size:1.3rem">${cat.icon}</span>
            <span>${escapeHtml(cat.name)}</span>
          </div>
          <span class="badge ${pct >= 100 ? 'badge-expense' : (pct >= 75 ? 'badge-pending' : 'badge-income')}">
            ${limit > 0 ? `${pct.toFixed(0)}% usado` : 'Sem meta'}
          </span>
        </div>

        <div style="display:flex;justify-content:space-between;font-size:0.86rem;color:var(--text-secondary)">
          <span>Gasto no mês: <strong style="color:var(--text-primary)">${formatCurrency(spent)}</strong></span>
          <span>Meta: <strong style="color:var(--text-primary)">${limit > 0 ? formatCurrency(limit) : 'Não definida'}</strong></span>
        </div>

        <div class="budget-progress-track">
          <div class="budget-progress-fill ${statusClass}" style="width:${barWidth}%"></div>
        </div>

        <div style="font-size:0.8rem;color:var(--text-secondary)">
          ${limit > 0
            ? (remaining >= 0
                ? `Disponível no mês: <strong style="color:var(--success)">${formatCurrency(remaining)}</strong>`
                : `Excedido em: <strong style="color:var(--danger)">${formatCurrency(Math.abs(remaining))}</strong>`)
            : 'Defina um teto mensal abaixo para receber alertas automáticos.'}
        </div>

        <div style="display:flex;gap:0.5rem;margin-top:0.25rem">
          <input type="number" step="10" min="0" class="form-control" id="budget_input_${cat.id}" value="${limit || ''}" placeholder="Meta mensal (R$)" />
          <button class="btn btn-sm btn-primary" onclick="saveCategoryBudget('${escapeQuotes(cat.name)}', 'budget_input_${cat.id}')">Salvar</button>
        </div>
      </div>
    `;
  }).join('');
}

window.saveCategoryBudget = async function(categoryName, inputId) {
  const val = parseFloat(document.getElementById(inputId).value || '0');
  await window.expenseDB.setBudget(categoryName, val);
  refreshAll();
  showToast(`Meta de orçamento para "${categoryName}" atualizada!`, 'success');
};

// ==========================================
// CATEGORIAS PERSONALIZADAS
// ==========================================
function renderCategoriesView() {
  const cats = window.expenseDB.getCategories();
  const tbody = document.getElementById('categoriesTbody');

  tbody.innerHTML = cats.map(c => `
    <tr>
      <td style="font-size:1.3rem">${c.icon}</td>
      <td style="font-weight:600">${escapeHtml(c.name)}</td>
      <td>
        <span class="badge ${c.type === 'income' ? 'badge-income' : 'badge-expense'}">
          ${c.type === 'income' ? 'Receita' : 'Despesa'}
        </span>
      </td>
      <td>
        <span style="display:inline-block;width:18px;height:18px;border-radius:4px;background:${c.color};vertical-align:middle;margin-right:6px"></span>
        <code>${c.color}</code>
      </td>
      <td style="text-align:right">
        <button class="btn btn-sm btn-secondary" onclick="removeCategory('${c.id}', '${escapeQuotes(c.name)}')">🗑️</button>
      </td>
    </tr>
  `).join('');
}

async function handleAddCategory(e) {
  e.preventDefault();
  const name = document.getElementById('newCatName').value.trim();
  const type = document.getElementById('newCatType').value;
  const icon = document.getElementById('newCatIcon').value.trim() || '🏷️';
  const color = document.getElementById('newCatColor').value || '#6366f1';

  if (!name) return;
  try {
    await window.expenseDB.addCategory({ name, type, icon, color });
    document.getElementById('categoryForm').reset();
    refreshAll();
    showToast(`Categoria "${name}" criada com sucesso!`, 'success');
  } catch (err) {
    showToast('Já existe uma categoria com este nome.', 'danger');
  }
}

window.removeCategory = async function(id, name) {
  if (confirm(`Deseja remover a categoria "${name}"?`)) {
    await window.expenseDB.deleteCategory(id);
    refreshAll();
    showToast(`Categoria "${name}" removida.`, 'warning');
  }
};

// ==========================================
// EXPORTAÇÃO, IMPORTAÇÃO & CONSOLE SQLITE
// ==========================================
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function transactionsToCSV(txs) {
  const headers = ['ID', 'Data', 'Tipo', 'Categoria', 'Descricao', 'Valor', 'Forma_Pagamento', 'Modalidade', 'Parcela_Atual', 'Total_Parcelas', 'Efetivado', 'Observacoes'];
  const rows = txs.map(t => [
    t.id,
    t.date,
    t.type === 'income' ? 'Receita' : 'Despesa',
    `"${String(t.category || '').replace(/"/g, '""')}"`,
    `"${String(t.description || '').replace(/"/g, '""')}"`,
    Number(t.amount).toFixed(2).replace('.', ','),
    `"${String(t.payment_method || '').replace(/"/g, '""')}"`,
    t.recurrence,
    t.installment_current || 1,
    t.installment_total || 1,
    t.paid ? 'Sim' : 'Nao',
    `"${String(t.notes || '').replace(/"/g, '""')}"`
  ]);
  return '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
}

function exportMonthCSV() {
  const txs = window.expenseDB.getTransactionsByMonth(state.currentYearMonth);
  const csv = transactionsToCSV(txs);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `despesas_${state.currentYearMonth}.csv`);
  showToast(`Relatório CSV de ${state.currentYearMonth} exportado!`, 'success');
}

function exportAllCSV() {
  const txs = window.expenseDB.getAllTransactions();
  const csv = transactionsToCSV(txs);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `fintrack_historico_completo.csv`);
  showToast('Histórico completo exportado em CSV!', 'success');
}

function exportJSONFile() {
  const data = window.expenseDB.exportJSONData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `fintrack_backup_${state.currentYearMonth}.json`);
  showToast('Backup JSON completo exportado!', 'success');
}

function exportSQLiteFile() {
  const binary = window.expenseDB.exportSQLiteBinary();
  if (!binary) {
    showToast('Banco SQLite binário indisponível no modo offline; utilize a exportação JSON/CSV.', 'warning');
    return;
  }
  const blob = new Blob([binary], { type: 'application/x-sqlite3' });
  downloadBlob(blob, `fintrack_database.sqlite`);
  showToast('Arquivo de banco de dados .sqlite exportado!', 'success');
}

async function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    if (file.name.endsWith('.sqlite') || file.name.endsWith('.db')) {
      const buf = await file.arrayBuffer();
      await window.expenseDB.importSQLiteBinary(new Uint8Array(buf));
      refreshAll();
      showToast('Banco de dados SQLite importado com sucesso!', 'success');
    } else if (file.name.endsWith('.json')) {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await window.expenseDB.importJSONData(parsed);
      refreshAll();
      showToast('Backup JSON importado com sucesso!', 'success');
    } else if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error('Arquivo CSV vazio');
      const batch = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';');
        if (cols.length < 6) continue;
        batch.push({
          id: 'tx_imp_' + Date.now() + '_' + i,
          date: cols[1].trim(),
          type: cols[2].toLowerCase().includes('receita') ? 'income' : 'expense',
          category: cols[3].replace(/^"|"$/g, '').trim() || 'Outras Despesas',
          description: cols[4].replace(/^"|"$/g, '').trim() || 'Importado via CSV',
          amount: parseFloat(cols[5].replace(',', '.')) || 0,
          payment_method: (cols[6] || 'PIX').replace(/^"|"$/g, '').trim(),
          recurrence: 'single',
          installment_current: 1,
          installment_total: 1,
          group_id: null,
          paid: 1,
          notes: 'Importado via CSV',
          created_at: new Date().toISOString()
        });
      }
      await window.expenseDB.addTransactionBatch(batch);
      refreshAll();
      showToast(`${batch.length} lançamentos importados do CSV!`, 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao importar arquivo: ' + err.message, 'danger');
  } finally {
    e.target.value = '';
  }
}

function handleRunCustomSQL() {
  const sql = document.getElementById('sqlQueryInput').value.trim();
  const out = document.getElementById('sqlResultContainer');
  if (!sql) return;

  try {
    const res = window.expenseDB.executeCustomSQL(sql);
    refreshAll();
    if (!res || res.length === 0) {
      out.innerHTML = `<div style="padding:1rem;color:var(--success)">✓ Comando SQL executado com sucesso (sem linhas retornadas).</div>`;
      return;
    }

    const { columns, values } = res[0];
    out.innerHTML = `
      <div class="table-responsive" style="margin-top:1rem">
        <table class="data-table">
          <thead>
            <tr>${columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${values.map(row => `<tr>${row.map(v => `<td>${escapeHtml(String(v ?? 'NULL'))}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    out.innerHTML = `<div style="padding:1rem;color:var(--danger)">Erro SQL: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeQuotes(str) {
  return String(str ?? '').replace(/'/g, "\\'");
}
