/**
 * Camada de Banco de Dados Relacional (SQLite via sql.js WebAssembly + IndexedDB)
 * Inclui fallback automático em memória/localStorage caso o navegador esteja offline no primeiro acesso.
 */

const DB_NAME = 'FinTrackSQLiteDB';
const DB_STORE = 'sqlite_store';
const DB_KEY = 'fintrack_db_binary';
const LS_FALLBACK_KEY = 'fintrack_relational_backup_v1';

const DEFAULT_CATEGORIES = [
  { id: 'cat_alim', name: 'Alimentação', type: 'expense', color: '#ef4444', icon: '🍽️', defaultLimit: 1200 },
  { id: 'cat_mora', name: 'Moradia', type: 'expense', color: '#f59e0b', icon: '🏠', defaultLimit: 2200 },
  { id: 'cat_tran', name: 'Transporte', type: 'expense', color: '#3b82f6', icon: '🚗', defaultLimit: 600 },
  { id: 'cat_laze', name: 'Lazer', type: 'expense', color: '#8b5cf6', icon: '🎬', defaultLimit: 500 },
  { id: 'cat_saud', name: 'Saúde', type: 'expense', color: '#10b981', icon: '💊', defaultLimit: 450 },
  { id: 'cat_educ', name: 'Educação', type: 'expense', color: '#06b6d4', icon: '📚', defaultLimit: 400 },
  { id: 'cat_assi', name: 'Assinaturas', type: 'expense', color: '#ec4899', icon: '📱', defaultLimit: 200 },
  { id: 'cat_outr_d', name: 'Outras Despesas', type: 'expense', color: '#64748b', icon: '📦', defaultLimit: 300 },
  { id: 'cat_sala', name: 'Salário', type: 'income', color: '#10b981', icon: '💼', defaultLimit: 0 },
  { id: 'cat_free', name: 'Freelance / Extra', type: 'income', color: '#3b82f6', icon: '💻', defaultLimit: 0 },
  { id: 'cat_inve', name: 'Rendimentos', type: 'income', color: '#8b5cf6', icon: '📈', defaultLimit: 0 },
  { id: 'cat_outr_r', name: 'Outras Receitas', type: 'income', color: '#14b8a6', icon: '💰', defaultLimit: 0 }
];

class ExpenseDatabase {
  constructor() {
    this.sqlDb = null;
    this.SQL = null;
    this.mode = 'sqlite-wasm'; // 'sqlite-wasm' | 'indexed-json'
    this.fallbackState = {
      categories: [],
      budgets: [],
      transactions: []
    };
  }

  async init() {
    try {
      if (typeof window.initSqlJs === 'function') {
        this.SQL = await window.initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        });
        const savedBinary = await this.loadFromIndexedDB();
        if (savedBinary && savedBinary.byteLength > 0) {
          this.sqlDb = new this.SQL.Database(new Uint8Array(savedBinary));
          this.ensureSchema();
        } else {
          this.sqlDb = new this.SQL.Database();
          this.ensureSchema();
          // Verifica se havia backup JSON no localStorage
          const backupRaw = localStorage.getItem(LS_FALLBACK_KEY);
          if (backupRaw) {
            const parsed = JSON.parse(backupRaw);
            this.importJSONData(parsed, false);
          } else {
            this.seedInitialData();
          }
          await this.persist();
        }
        this.mode = 'sqlite-wasm';
        return;
      }
    } catch (err) {
      console.warn('SQL.js WASM indisponível (modo offline), ativando motor relacional local:', err);
    }

    // Fallback caso sem internet na primeira abertura
    this.mode = 'indexed-json';
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      this.fallbackState = JSON.parse(raw);
    } else {
      this.seedFallbackInitialData();
      this.saveFallback();
    }
  }

  ensureSchema() {
    if (!this.sqlDb) return;
    this.sqlDb.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        color TEXT NOT NULL,
        icon TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS budgets (
        category TEXT PRIMARY KEY,
        monthly_limit REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'PIX',
        recurrence TEXT NOT NULL DEFAULT 'single',
        installment_current INTEGER DEFAULT 1,
        installment_total INTEGER DEFAULT 1,
        group_id TEXT,
        paid INTEGER NOT NULL DEFAULT 1,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
      CREATE INDEX IF NOT EXISTS idx_tx_group ON transactions(group_id);
    `);
  }

  seedInitialData() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const prevDate = new Date(y, now.getMonth() - 1, 15);
    const py = prevDate.getFullYear();
    const pm = String(prevDate.getMonth() + 1).padStart(2, '0');

    this.sqlDb.run('BEGIN TRANSACTION;');
    try {
      const stmtCat = this.sqlDb.prepare('INSERT OR IGNORE INTO categories (id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)');
      const stmtBud = this.sqlDb.prepare('INSERT OR IGNORE INTO budgets (category, monthly_limit) VALUES (?, ?)');

      for (const c of DEFAULT_CATEGORIES) {
        stmtCat.run([c.id, c.name, c.type, c.color, c.icon]);
        if (c.type === 'expense' && c.defaultLimit > 0) {
          stmtBud.run([c.name, c.defaultLimit]);
        }
      }
      stmtCat.free();
      stmtBud.free();

      const sampleTx = [
        // Mês anterior
        ['tx_demo_1', 'Salário Mensal', 6500.00, 'income', 'Salário', `${py}-${pm}-05`, 'Transferência', 'fixed', 1, 12, 'grp_sal', 1, 'Salário líquido'],
        ['tx_demo_2', 'Aluguel + Condomínio', 1850.00, 'expense', 'Moradia', `${py}-${pm}-10`, 'Boleto', 'fixed', 1, 12, 'grp_alug', 1, 'Mensalidade imobiliária'],
        ['tx_demo_3', 'Supermercado Atacadão', 820.50, 'expense', 'Alimentação', `${py}-${pm}-12`, 'Cartão de Crédito', 'single', 1, 1, null, 1, 'Compras do mês'],
        ['tx_demo_4', 'Combustível e Pedágio', 340.00, 'expense', 'Transporte', `${py}-${pm}-18`, 'Cartão de Débito', 'single', 1, 1, null, 1, ''],
        ['tx_demo_5', 'Cinema e Jantar', 210.00, 'expense', 'Lazer', `${py}-${pm}-22`, 'PIX', 'single', 1, 1, null, 1, 'Final de semana'],
        // Mês atual
        ['tx_demo_6', 'Salário Mensal', 6500.00, 'income', 'Salário', `${y}-${m}-05`, 'Transferência', 'fixed', 2, 12, 'grp_sal', 1, 'Salário líquido'],
        ['tx_demo_7', 'Projeto Freelance Web', 1400.00, 'income', 'Freelance / Extra', `${y}-${m}-12`, 'PIX', 'single', 1, 1, null, 1, 'Entrega de landing page'],
        ['tx_demo_8', 'Aluguel + Condomínio', 1850.00, 'expense', 'Moradia', `${y}-${m}-10`, 'Boleto', 'fixed', 2, 12, 'grp_alug', 1, 'Mensalidade imobiliária'],
        ['tx_demo_9', 'Conta de Energia e Internet', 295.90, 'expense', 'Moradia', `${y}-${m}-14`, 'PIX', 'fixed', 1, 12, 'grp_net', 1, 'Fibra 600MB + Luz'],
        ['tx_demo_10', 'Supermercado Mensal', 745.80, 'expense', 'Alimentação', `${y}-${m}-08`, 'Cartão de Crédito', 'single', 1, 1, null, 1, 'Compras da quinzena'],
        ['tx_demo_11', 'Restaurantes e iFood', 280.00, 'expense', 'Alimentação', `${y}-${m}-16`, 'Cartão de Crédito', 'single', 1, 1, null, 1, 'Almoços de trabalho'],
        ['tx_demo_12', 'Notebook Trabalho (Parcela 1/6)', 450.00, 'expense', 'Educação', `${y}-${m}-15`, 'Cartão de Crédito', 'installment', 1, 6, 'grp_note', 1, 'Compra parcelada sem juros'],
        ['tx_demo_13', 'Academia + Plano de Saúde', 380.00, 'expense', 'Saúde', `${y}-${m}-20`, 'Cartão de Crédito', 'fixed', 1, 12, 'grp_saude', 0, 'Vence dia 20'],
        ['tx_demo_14', 'Streaming (Netflix + Spotify)', 84.80, 'expense', 'Assinaturas', `${y}-${m}-25`, 'Cartão de Crédito', 'fixed', 1, 12, 'grp_stream', 0, 'Assinaturas mensais']
      ];

      const stmtTx = this.sqlDb.prepare(`
        INSERT OR IGNORE INTO transactions
        (id, description, amount, type, category, date, payment_method, recurrence, installment_current, installment_total, group_id, paid, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const createdAt = new Date().toISOString();
      for (const row of sampleTx) {
        stmtTx.run([...row, createdAt]);
      }

      // Gera as próximas parcelas do Notebook (2/6 a 6/6) nos meses seguintes
      for (let i = 2; i <= 6; i++) {
        const fDate = new Date(y, now.getMonth() + (i - 1), 15);
        const fy = fDate.getFullYear();
        const fm = String(fDate.getMonth() + 1).padStart(2, '0');
        stmtTx.run([
          `tx_demo_note_${i}`,
          `Notebook Trabalho (Parcela ${i}/6)`,
          450.00,
          'expense',
          'Educação',
          `${fy}-${fm}-15`,
          'Cartão de Crédito',
          'installment',
          i,
          6,
          'grp_note',
          0,
          'Compra parcelada sem juros',
          createdAt
        ]);
      }

      stmtTx.free();
      this.sqlDb.run('COMMIT;');
    } catch (e) {
      this.sqlDb.run('ROLLBACK;');
      console.error('Erro no seed inicial:', e);
    }
  }

  seedFallbackInitialData() {
    this.fallbackState.categories = DEFAULT_CATEGORIES.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      color: c.color,
      icon: c.icon
    }));
    this.fallbackState.budgets = DEFAULT_CATEGORIES
      .filter(c => c.type === 'expense' && c.defaultLimit > 0)
      .map(c => ({ category: c.name, monthly_limit: c.defaultLimit }));
    this.fallbackState.transactions = [];
  }

  async persist() {
    if (this.mode === 'sqlite-wasm' && this.sqlDb) {
      const data = this.sqlDb.export();
      await this.saveToIndexedDB(data);
      // Também salva snapshot JSON leve no localStorage para redundância imediata
      try {
        const snapshot = this.exportJSONData();
        localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(snapshot));
      } catch (e) {
        // Ignora quota exceeded se ocorrer
      }
    } else {
      this.saveFallback();
    }
  }

  saveFallback() {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(this.fallbackState));
  }

  loadFromIndexedDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(DB_STORE, 'readonly');
        const store = tx.objectStore(DB_STORE);
        const getReq = store.get(DB_KEY);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  }

  saveToIndexedDB(uint8Array) {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(false);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE);
        }
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(DB_STORE, 'readwrite');
        const store = tx.objectStore(DB_STORE);
        store.put(uint8Array, DB_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    });
  }

  // Helpers de consulta SQL
  queryAll(sql, params = []) {
    if (this.mode === 'sqlite-wasm' && this.sqlDb) {
      const stmt = this.sqlDb.prepare(sql);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    }
    return [];
  }

  // Categorias
  getCategories() {
    if (this.mode === 'sqlite-wasm') {
      return this.queryAll('SELECT * FROM categories ORDER BY type DESC, name ASC');
    }
    return [...this.fallbackState.categories];
  }

  async addCategory({ name, type, color, icon }) {
    const id = 'cat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    if (this.mode === 'sqlite-wasm') {
      this.sqlDb.run(
        'INSERT INTO categories (id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)',
        [id, name.trim(), type, color, icon || '🏷️']
      );
    } else {
      this.fallbackState.categories.push({ id, name: name.trim(), type, color, icon: icon || '🏷️' });
    }
    await this.persist();
    return id;
  }

  async deleteCategory(id) {
    if (this.mode === 'sqlite-wasm') {
      this.sqlDb.run('DELETE FROM categories WHERE id = ?', [id]);
    } else {
      this.fallbackState.categories = this.fallbackState.categories.filter(c => c.id !== id);
    }
    await this.persist();
  }

  // Orçamentos / Metas
  getBudgets() {
    if (this.mode === 'sqlite-wasm') {
      const rows = this.queryAll('SELECT category, monthly_limit FROM budgets');
      const map = {};
      rows.forEach(r => { map[r.category] = Number(r.monthly_limit); });
      return map;
    }
    const map = {};
    this.fallbackState.budgets.forEach(b => { map[b.category] = Number(b.monthly_limit); });
    return map;
  }

  async setBudget(category, monthlyLimit) {
    const limit = Number(monthlyLimit) || 0;
    if (this.mode === 'sqlite-wasm') {
      if (limit <= 0) {
        this.sqlDb.run('DELETE FROM budgets WHERE category = ?', [category]);
      } else {
        this.sqlDb.run(
          'INSERT INTO budgets (category, monthly_limit) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit',
          [category, limit]
        );
      }
    } else {
      const idx = this.fallbackState.budgets.findIndex(b => b.category === category);
      if (limit <= 0 && idx !== -1) {
        this.fallbackState.budgets.splice(idx, 1);
      } else if (idx !== -1) {
        this.fallbackState.budgets[idx].monthly_limit = limit;
      } else if (limit > 0) {
        this.fallbackState.budgets.push({ category, monthly_limit: limit });
      }
    }
    await this.persist();
  }

  // Transações
  getTransactionsByMonth(yearMonth) {
    // yearMonth = 'YYYY-MM'
    if (this.mode === 'sqlite-wasm') {
      return this.queryAll(
        'SELECT * FROM transactions WHERE substr(date, 1, 7) = ? ORDER BY date DESC, created_at DESC',
        [yearMonth]
      );
    }
    return this.fallbackState.transactions
      .filter(t => String(t.date).startsWith(yearMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  getAllTransactions() {
    if (this.mode === 'sqlite-wasm') {
      return this.queryAll('SELECT * FROM transactions ORDER BY date DESC, created_at DESC');
    }
    return [...this.fallbackState.transactions].sort((a, b) => b.date.localeCompare(a.date));
  }

  async addTransactionBatch(items) {
    if (this.mode === 'sqlite-wasm') {
      this.sqlDb.run('BEGIN TRANSACTION;');
      try {
        const stmt = this.sqlDb.prepare(`
          INSERT INTO transactions
          (id, description, amount, type, category, date, payment_method, recurrence, installment_current, installment_total, group_id, paid, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of items) {
          stmt.run([
            item.id,
            item.description,
            Number(item.amount),
            item.type,
            item.category,
            item.date,
            item.payment_method || 'PIX',
            item.recurrence || 'single',
            Number(item.installment_current || 1),
            Number(item.installment_total || 1),
            item.group_id || null,
            item.paid ? 1 : 0,
            item.notes || '',
            item.created_at || new Date().toISOString()
          ]);
        }
        stmt.free();
        this.sqlDb.run('COMMIT;');
      } catch (e) {
        this.sqlDb.run('ROLLBACK;');
        throw e;
      }
    } else {
      this.fallbackState.transactions.push(...items);
    }
    await this.persist();
  }

  async updateTransaction(item) {
    if (this.mode === 'sqlite-wasm') {
      this.sqlDb.run(`
        UPDATE transactions
        SET description = ?, amount = ?, type = ?, category = ?, date = ?, payment_method = ?, paid = ?, notes = ?
        WHERE id = ?
      `, [
        item.description,
        Number(item.amount),
        item.type,
        item.category,
        item.date,
        item.payment_method,
        item.paid ? 1 : 0,
        item.notes || '',
        item.id
      ]);
    } else {
      const idx = this.fallbackState.transactions.findIndex(t => t.id === item.id);
      if (idx !== -1) {
        this.fallbackState.transactions[idx] = { ...this.fallbackState.transactions[idx], ...item };
      }
    }
    await this.persist();
  }

  async toggleTransactionPaid(id) {
    if (this.mode === 'sqlite-wasm') {
      this.sqlDb.run('UPDATE transactions SET paid = CASE WHEN paid = 1 THEN 0 ELSE 1 END WHERE id = ?', [id]);
    } else {
      const tx = this.fallbackState.transactions.find(t => t.id === id);
      if (tx) tx.paid = tx.paid ? 0 : 1;
    }
    await this.persist();
  }

  async deleteTransaction(id, deleteGroup = false, groupId = null) {
    if (this.mode === 'sqlite-wasm') {
      if (deleteGroup && groupId) {
        this.sqlDb.run('DELETE FROM transactions WHERE group_id = ?', [groupId]);
      } else {
        this.sqlDb.run('DELETE FROM transactions WHERE id = ?', [id]);
      }
    } else {
      if (deleteGroup && groupId) {
        this.fallbackState.transactions = this.fallbackState.transactions.filter(t => t.group_id !== groupId);
      } else {
        this.fallbackState.transactions = this.fallbackState.transactions.filter(t => t.id !== id);
      }
    }
    await this.persist();
  }

  // Executa query SQL livre na aba Banco de Dados
  executeCustomSQL(sql) {
    if (this.mode !== 'sqlite-wasm' || !this.sqlDb) {
      throw new Error('O motor SQLite WebAssembly não está carregado.');
    }
    const res = this.sqlDb.exec(sql);
    this.persist();
    return res;
  }

  exportSQLiteBinary() {
    if (this.mode === 'sqlite-wasm' && this.sqlDb) {
      return this.sqlDb.export();
    }
    return null;
  }

  async importSQLiteBinary(uint8Array) {
    if (!this.SQL) throw new Error('SQL.js não inicializado');
    this.sqlDb = new this.SQL.Database(uint8Array);
    this.ensureSchema();
    await this.persist();
  }

  exportJSONData() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      categories: this.getCategories(),
      budgets: this.getBudgets(),
      transactions: this.getAllTransactions()
    };
  }

  async importJSONData(data, shouldPersist = true) {
    if (!data || !Array.isArray(data.transactions)) {
      throw new Error('Formato de arquivo JSON inválido.');
    }
    if (this.mode === 'sqlite-wasm' && this.sqlDb) {
      this.sqlDb.run('BEGIN TRANSACTION;');
      try {
        this.sqlDb.run('DELETE FROM transactions;');
        this.sqlDb.run('DELETE FROM budgets;');
        this.sqlDb.run('DELETE FROM categories;');

        const cats = Array.isArray(data.categories) && data.categories.length ? data.categories : DEFAULT_CATEGORIES;
        const stmtCat = this.sqlDb.prepare('INSERT OR IGNORE INTO categories (id, name, type, color, icon) VALUES (?, ?, ?, ?, ?)');
        for (const c of cats) {
          stmtCat.run([c.id, c.name, c.type, c.color, c.icon || '🏷️']);
        }
        stmtCat.free();

        if (data.budgets && typeof data.budgets === 'object') {
          const stmtBud = this.sqlDb.prepare('INSERT OR IGNORE INTO budgets (category, monthly_limit) VALUES (?, ?)');
          for (const [catName, limit] of Object.entries(data.budgets)) {
            if (Number(limit) > 0) stmtBud.run([catName, Number(limit)]);
          }
          stmtBud.free();
        }

        const stmtTx = this.sqlDb.prepare(`
          INSERT OR IGNORE INTO transactions
          (id, description, amount, type, category, date, payment_method, recurrence, installment_current, installment_total, group_id, paid, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of data.transactions) {
          stmtTx.run([
            t.id || ('tx_' + Math.random().toString(36).slice(2)),
            t.description,
            Number(t.amount),
            t.type,
            t.category,
            t.date,
            t.payment_method || 'PIX',
            t.recurrence || 'single',
            Number(t.installment_current || 1),
            Number(t.installment_total || 1),
            t.group_id || null,
            t.paid ? 1 : 0,
            t.notes || '',
            t.created_at || new Date().toISOString()
          ]);
        }
        stmtTx.free();
        this.sqlDb.run('COMMIT;');
      } catch (e) {
        this.sqlDb.run('ROLLBACK;');
        throw e;
      }
    } else {
      this.fallbackState.categories = data.categories || DEFAULT_CATEGORIES;
      this.fallbackState.budgets = Object.entries(data.budgets || {}).map(([category, monthly_limit]) => ({ category, monthly_limit }));
      this.fallbackState.transactions = data.transactions || [];
    }

    if (shouldPersist) {
      await this.persist();
    }
  }

  async resetWithDemoData() {
    if (this.mode === 'sqlite-wasm' && this.sqlDb) {
      this.sqlDb.run('DELETE FROM transactions;');
      this.sqlDb.run('DELETE FROM budgets;');
      this.sqlDb.run('DELETE FROM categories;');
      this.seedInitialData();
      await this.persist();
    } else {
      this.seedFallbackInitialData();
      this.saveFallback();
    }
  }

  async clearAllTransactions() {
    if (this.mode === 'sqlite-wasm' && this.sqlDb) {
      this.sqlDb.run('DELETE FROM transactions;');
      await this.persist();
    } else {
      this.fallbackState.transactions = [];
      this.saveFallback();
    }
  }
}

window.expenseDB = new ExpenseDatabase();
