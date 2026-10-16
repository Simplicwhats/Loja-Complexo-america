
(() => {
'use strict';

const cfg = window.COMPLEXO_CONFIG || {};
const $ = id => document.getElementById(id);

const money = n => Number(n || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);

const sb = window.supabase &&
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_ANON_KEY.startsWith('COLE_AQUI')
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
      )
    : null;

let currentUser = null;
let categories = [];
let products = [];
let orders = [];
let jobs = [];

const statusText = {
  pending: 'Aguardando PIX',
  paid: 'Pago',
  failed: 'Falhou',
  refunded: 'Estornado',
  delivery_pending: 'Aguardando entrega',
  delivered: 'Entregue',
  processing: 'Em processamento'
};

/* Elementos: evita o erro addEventListener de null */
function bind(id, event, callback) {
  const element = $(id);

  if (!element) {
    console.warn(`Elemento #${id} não encontrado no admin.html`);
    return;
  }

  element.addEventListener(event, callback);
}

function toast(msg, error = false) {
  const t = $('toast');

  if (!t) {
    console[error ? 'error' : 'log'](msg);
    return;
  }

  t.textContent = msg;
  t.className =
    'fixed bottom-5 right-5 z-50 max-w-md rounded-xl border px-4 py-3 text-sm shadow-2xl ' +
    (error
      ? 'border-rose-700 bg-rose-950 text-rose-100'
      : 'border-sky-700 bg-slate-900 text-slate-100');
}

function showView(id) {
  ['login-view', 'denied-view', 'dashboard-view'].forEach(v => {
    const el = $(v);
    if (el) el.classList.toggle('hidden', v !== id);
  });
}

function showLoginMessage(message) {
  const el = $('login-message');
  if (!el) return;

  el.textContent = message;
  el.classList.remove('hidden');
}

async function signIn() {
  if (!sb) {
    showLoginMessage(
      'Configure SUPABASE_URL e SUPABASE_ANON_KEY em config.js.'
    );
    return;
  }

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: location.href.split('#')[0],
      scopes: 'identify email'
    }
  });

  if (error) {
    showLoginMessage(
      'Não foi possível iniciar o Discord: ' + error.message
    );
  }
}

async function verifySession() {
  if (!sb) {
    showView('login-view');
    showLoginMessage(
      'Configure o Supabase em config.js antes de acessar o painel.'
    );
    return;
  }

  try {
    const { data, error: sessionError } = await sb.auth.getSession();

    if (sessionError) throw sessionError;

    const session = data.session;

    if (!session) {
      showView('login-view');
      $('logout-btn')?.classList.add('hidden');
      return;
    }

    currentUser = session.user;

    if ($('admin-user')) {
      $('admin-user').textContent =
        currentUser.email ||
        currentUser.user_metadata?.global_name ||
        'Conta autenticada';
    }

    $('logout-btn')?.classList.remove('hidden');

    const { data: grant, error } = await sb
      .from('store_admins')
      .select('user_id')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error) {
      showView('login-view');
      showLoginMessage(
        'Não foi possível validar as permissões: ' + error.message
      );
      return;
    }

    if (!grant) {
      showView('denied-view');
      return;
    }

    showView('dashboard-view');
    await loadAll();

  } catch (error) {
    showView('login-view');
    showLoginMessage('Erro ao verificar sessão: ' + error.message);
  }
}

async function loadAll() {
  if (!sb) return;

  try {
    const results = await Promise.all([
      sb.from('store_categories')
        .select('*')
        .order('sort_order')
        .order('name'),

      sb.from('store_products')
        .select('*,store_categories(name,slug)')
        .order('sort_order')
        .order('name'),

      sb.from('store_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),

      sb.from('delivery_jobs')
        .select('*,store_orders(payer_email,amount,status,created_at)')
        .order('created_at', { ascending: false })
        .limit(500)
    ]);

    for (const result of results) {
      if (result.error) throw result.error;
    }

    [categories, products, orders, jobs] =
      results.map(result => result.data || []);

    renderAll();

  } catch (error) {
    toast('Erro ao carregar dados: ' + error.message, true);
  }
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function renderAll() {
  setText('stat-products', products.filter(p => p.active).length);
  setText('stat-orders', orders.length);
  setText(
    'stat-paid',
    orders.filter(o =>
      ['paid', 'delivery_pending', 'delivered'].includes(o.status)
    ).length
  );
  setText(
    'stat-delivery',
    jobs.filter(j =>
      ['pending', 'failed', 'processing'].includes(j.status)
    ).length
  );

  renderOrders();
  renderJobs();
  renderProducts();
  renderCategories();
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

function statusBadge(status) {
  const tone = {
    paid: 'text-emerald-300',
    delivered: 'text-emerald-300',
    delivery_pending: 'text-amber-300',
    pending: 'text-sky-300',
    failed: 'text-rose-300',
    refunded: 'text-purple-300',
    processing: 'text-amber-300'
  }[status] || 'text-slate-300';

  return `<span class="badge ${tone}">${esc(
    statusText[status] || status || '—'
  )}</span>`;
}

function renderOrders() {
  const tbody = $('orders-table');
  if (!tbody) return;

  const q = ($('order-search')?.value || '').toLowerCase();

  const rows = orders.filter(o =>
    [o.id, o.fivem_id, o.payer_email, JSON.stringify(o.items)]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );

  tbody.innerHTML = rows.length
    ? rows.map(o => `
      <tr>
        <td>
          <div class="font-bold">${esc(String(o.id).slice(0, 8))}…</div>
          <div class="muted text-xs">
            ${esc(o.provider_payment_id || 'Sem ID de pagamento')}
          </div>
        </td>
        <td>
          <div>${esc(o.payer_email || '—')}</div>
          <div class="text-sky-300 text-xs mt-1">
            ID FiveM: ${esc(o.fivem_id || '—')}
          </div>
        </td>
        <td>${(Array.isArray(o.items) ? o.items : [])
          .map(i => `${esc(i.name)} × ${esc(i.quantity || 1)}`)
          .join('<br>') || '—'}</td>
        <td class="font-bold">${money(o.amount)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${fmtDate(o.created_at)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="muted">Nenhum pedido encontrado.</td></tr>';
}

function renderJobs() {
  const tbody = $('deliveries-table');
  if (!tbody) return;

  tbody.innerHTML = jobs.length
    ? jobs.map(j => `
      <tr>
        <td>
          <b>${esc(String(j.order_id).slice(0, 8))}…</b>
          <div class="muted text-xs">${fmtDate(j.created_at)}</div>
        </td>
        <td class="text-sky-300">${esc(j.fivem_id || '—')}</td>
        <td>${(Array.isArray(j.items) ? j.items : [])
          .map(i => `${esc(i.name)} × ${esc(i.quantity || 1)}`)
          .join('<br>') || '—'}</td>
        <td>${statusBadge(j.status)}</td>
        <td>${Number(j.attempts || 0)}</td>
        <td class="text-rose-200">${esc(j.last_error || '—')}</td>
        <td>
          ${j.status === 'failed'
            ? `<button class="btn btn-secondary text-xs"
                data-requeue="${esc(j.id)}">Reenfileirar</button>`
            : '<span class="muted">—</span>'}
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="7" class="muted">Ainda não há entregas na fila.</td></tr>';
}

function renderProducts() {
  const tbody = $('products-table');
  if (!tbody) return;

  tbody.innerHTML = products.length
    ? products.map(p => `
      <tr>
        <td>
          <div class="font-bold">${esc(p.name)}</div>
          <div class="muted text-xs">${esc(p.description || '')}</div>
        </td>
        <td>${esc(
          p.store_categories?.name ||
          categories.find(c => c.id === p.category_id)?.name ||
          'Sem categoria'
        )}</td>
        <td>${esc(p.product_type)}</td>
        <td class="font-black text-sky-300">${money(p.price)}</td>
        <td>${p.active
          ? '<span class="text-emerald-300">Ativo</span>'
          : '<span class="text-rose-300">Oculto</span>'}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-secondary text-xs"
              data-edit-product="${esc(p.id)}">Editar</button>
            <button class="btn ${p.active ? 'btn-danger' : 'btn-secondary'} text-xs"
              data-toggle-product="${esc(p.id)}">
              ${p.active ? 'Ocultar' : 'Ativar'}
            </button>
          </div>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="muted">Nenhum produto cadastrado.</td></tr>';
}

function renderCategories() {
  const list = $('categories-list');
  if (!list) return;

  list.innerHTML = categories.length
    ? categories.map(c => `
      <div class="rounded-xl bg-slate-900/70 border border-slate-800 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-black">${esc(c.name)}</div>
            <div class="muted text-xs mt-1">
              /${esc(c.slug)} · ordem ${c.sort_order}
            </div>
            <p class="muted text-sm mt-2">
              ${esc(c.description || 'Sem descrição')}
            </p>
            <div class="mt-2">
              ${c.active
                ? '<span class="text-emerald-300 text-xs">Ativa</span>'
                : '<span class="text-rose-300 text-xs">Inativa</span>'}
            </div>
          </div>
          <button class="btn btn-secondary text-xs"
            data-edit-category="${esc(c.id)}">Editar</button>
        </div>
      </div>
    `).join('')
    : '<p class="muted">Nenhuma categoria cadastrada.</p>';
}

function openModal(title, html, save) {
  if (!$('modal') || !$('editor-form') || !$('modal-title')) {
    toast('O modal de edição não existe no admin.html.', true);
    return;
  }

  $('modal-title').textContent = title;
  $('editor-form').innerHTML = html;
  $('modal').classList.remove('hidden');
  $('modal').classList.add('flex');

  $('editor-form').onsubmit = async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('[type=submit]');
    if (button) button.disabled = true;

    try {
      await save(new FormData(form));

      $('modal')?.classList.add('hidden');
      $('modal')?.classList.remove('flex');

      await loadAll();
      toast('Alterações salvas.');

    } catch (error) {
      toast(error.message || 'Não foi possível salvar.', true);
    } finally {
      if (button) button.disabled = false;
    }
  };
}

const field = (label, name, value = '', type = 'text', extra = '') =>
  `<label class="block">
    <span class="block text-sm font-bold mb-2">${label}</span>
    <input class="field" name="${name}" type="${type}"
      value="${esc(value)}" ${extra}>
  </label>`;

function editProduct(p = {}) {
  const catOpts = categories.map(c => `
    <option value="${esc(c.id)}"
      ${p.category_id === c.id ? 'selected' : ''}>
      ${esc(c.name)}
    </option>
  `).join('');

  const typeOpts = ['vip', 'veiculo', 'dinheiro', 'especial', 'item']
    .map(t => `<option value="${t}"
      ${p.product_type === t ? 'selected' : ''}>${t}</option>`)
    .join('');

  openModal(
    p.id ? 'Editar produto' : 'Novo produto',
    `
      ${field('Nome do produto', 'name', p.name || '', 'text', 'required')}
      ${field('Descrição', 'description', p.description || '')}

      <div class="grid sm:grid-cols-2 gap-4">
        ${field('Preço (R$)', 'price', p.price ?? '', 'number',
          'min="0.01" step="0.01" required')}

        <label class="block">
          <span class="block text-sm font-bold mb-2">Categoria</span>
          <select class="field" name="category_id">
            <option value="">Sem categoria</option>
            ${catOpts}
          </select>
        </label>
      </div>

      <div class="grid sm:grid-cols-2 gap-4">
        <label class="block">
          <span class="block text-sm font-bold mb-2">Tipo de entrega</span>
          <select class="field" name="product_type">${typeOpts}</select>
        </label>
        ${field('Ordem de exibição', 'sort_order',
          p.sort_order ?? 0, 'number', 'step="1"')}
      </div>

      ${field('URL da imagem (opcional)', 'image_url',
        p.image_url || '', 'url')}

      ${field('Instruções/dados da entrega (JSON)',
        'delivery_payload', JSON.stringify(p.delivery_payload || {}))}

      <label class="flex items-center gap-3 text-sm">
        <input type="checkbox" name="active"
          ${p.active !== false ? 'checked' : ''}>
        Produto visível na loja
      </label>

      <button type="submit" class="btn btn-primary w-full">
        Salvar produto
      </button>
    `,
    async form => {
      const name = String(form.get('name') || '').trim();
      const price = Number(form.get('price'));

      if (!name || !Number.isFinite(price) || price <= 0) {
        throw new Error('Informe nome e preço válido.');
      }

      let payload = {};

      try {
        payload = JSON.parse(
          String(form.get('delivery_payload') || '{}')
        );
      } catch {
        throw new Error('O campo de entrega precisa conter JSON válido.');
      }

      const data = {
        name,
        description: String(form.get('description') || ''),
        price,
        category_id: String(form.get('category_id') || '') || null,
        product_type: String(form.get('product_type')),
        sort_order: Number(form.get('sort_order') || 0),
        image_url: String(form.get('image_url') || ''),
        active: form.get('active') === 'on',
        delivery_payload: payload,
        updated_at: new Date().toISOString()
      };

      const query = p.id
        ? sb.from('store_products').update(data).eq('id', p.id)
        : sb.from('store_products').insert(data);

      const { error } = await query;
      if (error) throw error;
    }
  );
}

function editCategory(c = {}) {
  openModal(
    c.id ? 'Editar categoria' : 'Nova categoria',
    `
      ${field('Nome', 'name', c.name || '', 'text', 'required')}
      ${field('Slug (URL curta, sem espaços)', 'slug',
        c.slug || '', 'text', 'required')}
      ${field('Descrição', 'description', c.description || '')}

      <div class="grid sm:grid-cols-2 gap-4">
        ${field('Ordem', 'sort_order', c.sort_order ?? 0,
          'number', 'step="1"')}

        <label class="flex items-center gap-3 pt-8 text-sm">
          <input type="checkbox" name="active"
            ${c.active !== false ? 'checked' : ''}>
          Categoria ativa
        </label>
      </div>

      <button type="submit" class="btn btn-primary w-full">
        Salvar categoria
      </button>
    `,
    async form => {
      const name = String(form.get('name') || '').trim();
      const slug = String(form.get('slug') || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-');

      if (!name || !slug) {
        throw new Error('Informe nome e slug.');
      }

      const data = {
        name,
        slug,
        description: String(form.get('description') || ''),
        sort_order: Number(form.get('sort_order') || 0),
        active: form.get('active') === 'on',
        updated_at: new Date().toISOString()
      };

      const query = c.id
        ? sb.from('store_categories').update(data).eq('id', c.id)
        : sb.from('store_categories').insert(data);

      const { error } = await query;
      if (error) throw error;
    }
  );
}

async function requeue(id) {
  if (!confirm(
    'Reenfileirar esta entrega com falha? O recurso real do FiveM precisa estar conectado para processá-la.'
  )) return;

  try {
    const { data } = await sb.auth.getSession();
    const session = data.session;

    if (!session) throw new Error('Faça login novamente.');

    const base = cfg.FUNCTIONS_BASE_URL;

    if (!base) {
      throw new Error('FUNCTIONS_BASE_URL não está configurada em config.js.');
    }

    const response = await fetch(
      `${base}/admin-requeue-delivery`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ job_id: id })
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    toast('Entrega reenfileirada; isso não confirma a entrega no jogo.');
    await loadAll();

  } catch (error) {
    toast('Falha ao reenfileirar: ' + error.message, true);
  }
}

function selectTab(tab) {
  document.querySelectorAll('.navbtn').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== 'tab-' + tab);
  });
}

/* Cliques delegados para abas, produtos, categorias e entregas */
document.addEventListener('click', async event => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const tab = target.closest('[data-tab]');
  if (tab) selectTab(tab.dataset.tab);

  const editP = target.closest('[data-edit-product]');
  if (editP) {
    editProduct(products.find(p => p.id === editP.dataset.editProduct) || {});
  }

  const toggleP = target.closest('[data-toggle-product]');
  if (toggleP && sb) {
    const product = products.find(
      p => p.id === toggleP.dataset.toggleProduct
    );

    if (product) {
      const { error } = await sb
        .from('store_products')
        .update({
          active: !product.active,
          updated_at: new Date().toISOString()
        })
        .eq('id', product.id);

      if (error) {
        toast(error.message, true);
      } else {
        toast(product.active ? 'Produto ocultado.' : 'Produto ativado.');
        await loadAll();
      }
    }
  }

  const editC = target.closest('[data-edit-category]');
  if (editC) {
    editCategory(
      categories.find(c => c.id === editC.dataset.editCategory) || {}
    );
  }

  const requeueButton = target.closest('[data-requeue]');
  if (requeueButton) await requeue(requeueButton.dataset.requeue);
});

/* Todos os eventos verificam se o elemento existe */
bind('discord-login', 'click', signIn);

bind('logout-btn', 'click', async () => {
  if (sb) await sb.auth.signOut();
  location.reload();
});

bind('denied-logout', 'click', async () => {
  if (sb) await sb.auth.signOut();
  location.reload();
});

bind('refresh-all', 'click', loadAll);
bind('new-product', 'click', () => editProduct());
bind('new-category', 'click', () => editCategory());
bind('order-search', 'input', renderOrders);

bind('modal-close', 'click', () => {
  $('modal')?.classList.add('hidden');
  $('modal')?.classList.remove('flex');
});

bind('modal', 'click', event => {
  const modal = $('modal');

  if (modal && event.target === modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
});

/* Inicialização */
if (sb) {
  sb.auth.onAuthStateChange(() => {
    setTimeout(verifySession, 0);
  });

  verifySession();
} else {
  showView('login-view');
  showLoginMessage(
    'Configure SUPABASE_URL e SUPABASE_ANON_KEY em config.js.'
  );
}

})();
