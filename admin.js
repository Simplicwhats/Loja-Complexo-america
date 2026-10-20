
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
}[c]));

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

function toast(msg, error = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');

  t.className =
    'fixed bottom-5 right-5 z-50 max-w-md rounded-xl border px-4 py-3 text-sm shadow-2xl ' +
    (error
      ? 'border-rose-700 bg-rose-950 text-rose-100'
      : 'border-sky-700 bg-slate-900 text-slate-100');

  setTimeout(() => t.classList.add('hidden'), 4500);
}

function showView(id) {
  ['login-view', 'denied-view', 'dashboard-view'].forEach(v => {
    $(v).classList.toggle('hidden', v !== id);
  });
}

async function signIn() {
  if (!sb) {
    $('login-message').textContent =
      'Configure a chave pública do Supabase em config.js.';
    $('login-message').classList.remove('hidden');
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
    $('login-message').textContent =
      'Não foi possível iniciar o Discord: ' + error.message;
    $('login-message').classList.remove('hidden');
  }
}

async function verifySession() {
  if (!sb) {
    showView('login-view');
    return;
  }

  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    showView('login-view');
    $('logout-btn').classList.add('hidden');
    return;
  }

  currentUser = session.user;

  $('admin-user').textContent =
    currentUser.email ||
    currentUser.user_metadata?.global_name ||
    'Conta autenticada';

  $('logout-btn').classList.remove('hidden');

  const { data: grant, error } = await sb
    .from('store_admins')
    .select('user_id')
    .eq('user_id', currentUser.id)
    .maybeSingle();

  if (error) {
    showView('login-view');
    $('login-message').textContent =
      'Não foi possível validar as permissões. Execute sql/admin-panel.sql e confira o RLS. Detalhe: ' +
      error.message;
    $('login-message').classList.remove('hidden');
    return;
  }

  if (!grant) {
    showView('denied-view');
    return;
  }

  showView('dashboard-view');
  await loadAll();
}

async function loadAll() {
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

    for (const r of results) {
      if (r.error) throw r.error;
    }

    [categories, products, orders, jobs] =
      results.map(r => r.data || []);

    renderAll();
  } catch (e) {
    toast('Erro ao carregar dados: ' + e.message, true);
  }
}

function renderAll() {
  $('stat-products').textContent =
    products.filter(p => p.active).length;

  $('stat-orders').textContent = orders.length;

  $('stat-paid').textContent =
    orders.filter(o =>
      ['paid', 'delivery_pending', 'delivered'].includes(o.status)
    ).length;

  $('stat-delivery').textContent =
    jobs.filter(j =>
      ['pending', 'failed', 'processing'].includes(j.status)
    ).length;

  renderOrders();
  renderJobs();
  renderProducts();
  renderCategories();
}

function fmtDate(s) {
  return s ? new Date(s).toLocaleString('pt-BR') : '—';
}

function statusBadge(s) {
  const tone = ({
    paid: 'text-emerald-300',
    delivered: 'text-emerald-300',
    delivery_pending: 'text-amber-300',
    pending: 'text-sky-300',
    failed: 'text-rose-300',
    refunded: 'text-purple-300',
    processing: 'text-amber-300'
  })[s] || 'text-slate-300';

  return `<span class="badge ${tone}">${esc(statusText[s] || s || '—')}</span>`;
}

function renderOrders() {
  const q = ($('order-search').value || '').toLowerCase();

  const rows = orders.filter(o =>
    [o.id, o.fivem_id, o.payer_email, JSON.stringify(o.items)]
      .join(' ')
      .toLowerCase()
      .includes(q)
  );

  $('orders-table').innerHTML = rows.length
    ? rows.map(o => `
      <tr>
        <td>
          <div class="font-bold">${esc(String(o.id).slice(0, 8))}…</div>
          <div class="muted text-xs">${esc(o.provider_payment_id || 'Sem ID de pagamento')}</div>
        </td>
        <td>
          <div>${esc(o.payer_email || '—')}</div>
          <div class="text-sky-300 text-xs mt-1">ID FiveM: ${esc(o.fivem_id)}</div>
        </td>
        <td>
          ${(Array.isArray(o.items) ? o.items : [])
            .map(i => `${esc(i.name)} × ${esc(i.quantity || 1)}`)
            .join('<br>') || '—'}
        </td>
        <td class="font-bold">${money(o.amount)}</td>
        <td>${statusBadge(o.status)}</td>
        <td>${fmtDate(o.created_at)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="muted">Nenhum pedido encontrado.</td></tr>';
}

function renderJobs() {
  $('deliveries-table').innerHTML = jobs.length
    ? jobs.map(j => `
      <tr>
        <td>
          <b>${esc(String(j.order_id).slice(0, 8))}…</b>
          <div class="muted text-xs">${fmtDate(j.created_at)}</div>
        </td>
        <td class="text-sky-300">${esc(j.fivem_id)}</td>
        <td>
          ${(Array.isArray(j.items) ? j.items : [])
            .map(i => `${esc(i.name)} × ${esc(i.quantity || 1)}`)
            .join('<br>') || '—'}
        </td>
        <td>${statusBadge(j.status)}</td>
        <td>${Number(j.attempts || 0)}</td>
        <td class="text-rose-200">${esc(j.last_error || '—')}</td>
        <td>
          ${j.status === 'failed'
            ? `<button class="btn btn-secondary text-xs" data-requeue="${esc(j.id)}">Reenfileirar</button>`
            : '<span class="muted">—</span>'}
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="7" class="muted">Ainda não há entregas na fila.</td></tr>';
}

function renderProducts() {
  $('products-table').innerHTML = products.length
    ? products.map(p => `
      <tr>
        <td>
          <div class="font-bold">${esc(p.name)}</div>
          <div class="muted text-xs" style="white-space:pre-line">${esc(p.description || '')}</div>
        </td>
        <td>${esc(p.store_categories?.name || categories.find(c => c.id === p.category_id)?.name || 'Sem categoria')}</td>
        <td>${esc(p.product_type)}</td>
        <td class="font-black text-sky-300">${money(p.price)}</td>
        <td>
          ${p.active
            ? '<span class="text-emerald-300">Ativo</span>'
            : '<span class="text-rose-300">Oculto</span>'}
        </td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-secondary text-xs" data-edit-product="${esc(p.id)}">Editar</button>
            <button class="btn ${p.active ? 'btn-danger' : 'btn-secondary'} text-xs" data-toggle-product="${esc(p.id)}">
              ${p.active ? 'Ocultar' : 'Ativar'}
            </button>
          </div>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="muted">Nenhum produto cadastrado.</td></tr>';
}

function renderCategories() {
  $('categories-list').innerHTML = categories.length
    ? categories.map(c => `
      <div class="rounded-xl bg-slate-900/70 border border-slate-800 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="font-black">${esc(c.name)}</div>
            <div class="muted text-xs mt-1">/${esc(c.slug)} · ordem ${c.sort_order}</div>
            <p class="muted text-sm mt-2">${esc(c.description || 'Sem descrição')}</p>
            <div class="mt-2">
              ${c.active
                ? '<span class="text-emerald-300 text-xs">Ativa</span>'
                : '<span class="text-rose-300 text-xs">Inativa</span>'}
            </div>
          </div>
          <button class="btn btn-secondary text-xs" data-edit-category="${esc(c.id)}">Editar</button>
        </div>
      </div>
    `).join('')
    : '<p class="muted">Nenhuma categoria cadastrada.</p>';
}

function openModal(title, html, save) {
  $('modal-title').textContent = title;
  $('editor-form').innerHTML = html;
  $('modal').classList.remove('hidden');
  $('modal').classList.add('flex');

  $('editor-form').onsubmit = async e => {
    e.preventDefault();

    const b = $('editor-form').querySelector('[type=submit]');
    b.disabled = true;

    try {
      await save(new FormData(e.currentTarget));

      $('modal').classList.add('hidden');
      $('modal').classList.remove('flex');

      await loadAll();
      toast('Alterações salvas.');
    } catch (err) {
      toast(err.message || 'Não foi possível salvar.', true);
    } finally {
      b.disabled = false;
    }
  };
}

const field = (label, name, value = '', type = 'text', extra = '') => `
  <label class="block">
    <span class="block text-sm font-bold mb-2">${label}</span>
    <input class="field" name="${name}" type="${type}" value="${esc(value)}" ${extra}>
  </label>
`;

function editProduct(p = {}) {
  const catOpts = categories.map(c => `
    <option value="${esc(c.id)}" ${p.category_id === c.id ? 'selected' : ''}>
      ${esc(c.name)}
    </option>
  `).join('');

  const typeOpts = ['vip', 'veiculo', 'dinheiro', 'especial', 'item']
    .map(t => `
      <option value="${t}" ${p.product_type === t ? 'selected' : ''}>${t}</option>
    `).join('');

  const descriptionField = `
    <label class="block">
      <span class="block text-sm font-bold mb-2">Descrição do produto</span>
      <textarea
        class="field w-full"
        name="description"
        rows="7"
        maxlength="10000"
        placeholder="Digite os benefícios, um por linha..."
        style="resize:vertical;white-space:pre-wrap"
      >${esc(p.description || '')}</textarea>
      <span class="muted text-xs mt-1 block">
        Escreva cada benefício em uma linha separada. Pressione Enter para quebrar a linha.
      </span>
    </label>
  `;

  openModal(
    p.id ? 'Editar produto' : 'Novo produto',

    `
      ${field('Nome do produto', 'name', p.name || '')}

      ${descriptionField}

      <div class="grid sm:grid-cols-2 gap-4">
        ${field('Preço (R$)', 'price', p.price ?? '', 'number', 'min="0.01" step="0.01" required')}

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
          <select class="field" name="product_type">
            ${typeOpts}
          </select>
        </label>

        ${field('Ordem de exibição', 'sort_order', p.sort_order ?? 0, 'number', 'step="1"')}
      </div>

      ${field('URL da imagem (opcional)', 'image_url', p.image_url || '', 'url')}

      <div class="grid sm:grid-cols-2 gap-4">
        <label class="block">
          <span class="block text-sm font-bold mb-2">Proporção da imagem</span>
          <select class="field" name="image_ratio">
            <option value="auto" ${(p.image_ratio || 'auto') === 'auto' ? 'selected' : ''}>Automática (usar tamanho original)</option>
            <option value="1:2" ${p.image_ratio === '1:2' ? 'selected' : ''}>1:2 — Vertical</option>
            <option value="2:3" ${p.image_ratio === '2:3' ? 'selected' : ''}>2:3 — Retrato</option>
            <option value="1:1" ${p.image_ratio === '1:1' ? 'selected' : ''}>1:1 — Quadrada</option>
            <option value="4:3" ${p.image_ratio === '4:3' ? 'selected' : ''}>4:3 — Paisagem</option>
            <option value="3:2" ${p.image_ratio === '3:2' ? 'selected' : ''}>3:2 — Paisagem</option>
            <option value="16:9" ${p.image_ratio === '16:9' ? 'selected' : ''}>16:9 — Horizontal</option>
          </select>
        </label>

        <label class="block">
          <span class="block text-sm font-bold mb-2">Como ajustar a imagem</span>
          <select class="field" name="image_fit">
            <option value="contain" ${(p.image_fit || 'contain') === 'contain' ? 'selected' : ''}>Mostrar imagem inteira</option>
            <option value="cover" ${p.image_fit === 'cover' ? 'selected' : ''}>Preencher espaço (pode cortar)</option>
          </select>
        </label>
      </div>

      ${field(
        'Instruções/dados da entrega (JSON)',
        'delivery_payload',
        JSON.stringify(p.delivery_payload || {})
      )}

      <label class="flex items-center gap-3 text-sm">
        <input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}>
        Produto visível na loja
      </label>

      <button type="submit" class="btn btn-primary w-full">Salvar produto</button>
    `,

    async f => {
      const name = String(f.get('name') || '').trim();
      const price = Number(f.get('price'));

      if (!name || !Number.isFinite(price) || price <= 0) {
        throw new Error('Informe nome e preço válido.');
      }

      let payload = {};

      try {
        payload = JSON.parse(String(f.get('delivery_payload') || '{}'));
      } catch {
        throw new Error('O campo de entrega precisa conter JSON válido.');
      }

      const data = {
        name,
        description: String(f.get('description') || ''),
        price,
        category_id: String(f.get('category_id') || '') || null,
        product_type: String(f.get('product_type')),
        sort_order: Number(f.get('sort_order') || 0),
        image_url: String(f.get('image_url') || ''),
        image_ratio: String(f.get('image_ratio') || 'auto'),
        image_fit: String(f.get('image_fit') || 'contain'),
        active: f.get('active') === 'on',
        delivery_payload: payload,
        updated_at: new Date().toISOString()
      };

      const q = p.id
        ? sb.from('store_products').update(data).eq('id', p.id)
        : sb.from('store_products').insert(data);

      const { error } = await q;

      if (error) throw error;
    }
  );
}

function editCategory(c = {}) {
  openModal(
    c.id ? 'Editar categoria' : 'Nova categoria',

    `
      ${field('Nome', 'name', c.name || '')}
      ${field('Slug (URL curta, sem espaços)', 'slug', c.slug || '')}
      ${field('Descrição', 'description', c.description || '')}

      <div class="grid sm:grid-cols-2 gap-4">
        ${field('Ordem', 'sort_order', c.sort_order ?? 0, 'number', 'step="1"')}

        <label class="flex items-center gap-3 pt-8 text-sm">
          <input type="checkbox" name="active" ${c.active !== false ? 'checked' : ''}>
          Categoria ativa
        </label>
      </div>

      <button type="submit" class="btn btn-primary w-full">Salvar categoria</button>
    `,

    async f => {
      const name = String(f.get('name') || '').trim();

      const slug = String(f.get('slug') || '')
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
        description: String(f.get('description') || ''),
        sort_order: Number(f.get('sort_order') || 0),
        active: f.get('active') === 'on',
        updated_at: new Date().toISOString()
      };

      const q = c.id
        ? sb.from('store_categories').update(data).eq('id', c.id)
        : sb.from('store_categories').insert(data);

      const { error } = await q;

      if (error) throw error;
    }
  );
}

async function requeue(id) {
  if (!confirm(
    'Reenfileirar esta entrega com falha? O recurso real do FiveM precisa estar conectado para processá-la.'
  )) return;

  try {
    const { data: { session } } = await sb.auth.getSession();

    const r = await fetch(
      `${cfg.FUNCTIONS_BASE_URL}/admin-requeue-delivery`,
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

    const d = await r.json().catch(() => ({}));

    if (!r.ok) {
      throw new Error(d.error || `HTTP ${r.status}`);
    }

    toast('Entrega reenfileirada; ainda não significa que foi entregue.');
    await loadAll();
  } catch (e) {
    toast('Falha ao reenfileirar: ' + e.message, true);
  }
}

function selectTab(tab) {
  document.querySelectorAll('.navbtn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('hidden', p.id !== 'tab-' + tab);
  });
}

document.addEventListener('click', async e => {
  const n = e.target.closest('[data-tab]');
  if (n) selectTab(n.dataset.tab);

  const ep = e.target.closest('[data-edit-product]');
  if (ep) {
    editProduct(products.find(p => p.id === ep.dataset.editProduct) || {});
  }

  const tp = e.target.closest('[data-toggle-product]');

  if (tp) {
    const p = products.find(x => x.id === tp.dataset.toggleProduct);

    if (p) {
      const { error } = await sb
        .from('store_products')
        .update({
          active: !p.active,
          updated_at: new Date().toISOString()
        })
        .eq('id', p.id);

      if (error) {
        toast(error.message, true);
      } else {
        toast(p.active ? 'Produto ocultado.' : 'Produto ativado.');
        await loadAll();
      }
    }
  }

  const ec = e.target.closest('[data-edit-category]');

  if (ec) {
    editCategory(categories.find(c => c.id === ec.dataset.editCategory) || {});
  }

  const rq = e.target.closest('[data-requeue]');

  if (rq) {
    requeue(rq.dataset.requeue);
  }
});

$('discord-login').addEventListener('click', signIn);

$('logout-btn').addEventListener('click', async () => {
  await sb?.auth.signOut();
  location.reload();
});

$('denied-logout').addEventListener('click', async () => {
  await sb?.auth.signOut();
  location.reload();
});

$('refresh-all').addEventListener('click', loadAll);
$('new-product').addEventListener('click', () => editProduct());
$('new-category').addEventListener('click', () => editCategory());
$('order-search').addEventListener('input', renderOrders);

$('modal-close').addEventListener('click', () => {
  $('modal').classList.add('hidden');
  $('modal').classList.remove('flex');
});

$('modal').addEventListener('click', e => {
  if (e.target === $('modal')) {
    $('modal').classList.add('hidden');
    $('modal').classList.remove('flex');
  }
});

if (sb) {
  sb.auth.onAuthStateChange(() => setTimeout(verifySession, 0));
  verifySession();
} else {
  showView('login-view');
  $('login-message').textContent =
    'Configure SUPABASE_ANON_KEY em config.js e execute sql/admin-panel.sql.';
  $('login-message').classList.remove('hidden');
}

})();
