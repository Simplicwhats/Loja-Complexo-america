/* Complexo América RP — frontend sem simulações de login, pagamento ou jogadores. */
(() => {
  'use strict';
  const cfg = window.COMPLEXO_CONFIG || {};
  const hasSupabaseConfig = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith('COLE_AQUI'));
  const supabase = hasSupabaseConfig && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let cart = [];
  let currentOrderId = null;
  let paymentPollTimer = null;
  const $ = id => document.getElementById(id);
  const money = value => Number(value).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  const showNotice = (id, message, kind='info') => { const el=$(id); if(!el)return; el.textContent=message; el.className=`ca-notice show ${kind}`; };
  const hideNotice = id => { const el=$(id); if(el){el.textContent='';el.className='ca-notice';} };
  const jsonHeaders = async () => {
    const headers={'Content-Type':'application/json'};
    if(supabase){const {data}=await supabase.auth.getSession();const token=data?.session?.access_token;if(token)headers.Authorization=`Bearer ${token}`;}
    if(cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith('COLE_AQUI')) headers.apikey=cfg.SUPABASE_ANON_KEY;
    return headers;
  };

  window.toggleCart = () => { $('cart-modal').classList.toggle('hidden'); renderCart(); };
  window.toggleLoginModal = () => $('login-modal').classList.toggle('hidden');
  window.toggleMobileMenu = () => $('mobile-menu').classList.toggle('hidden');
  window.toggleFaq = id => { const c=$(`faq-content-${id}`),i=$(`faq-icon-${id}`); if(c)c.classList.toggle('hidden');if(i)i.classList.toggle('rotate-180'); };
  window.addToCart = (name, price, type) => { cart.push({name:String(name),price:Number(price),type:String(type)});updateCartBadge();renderCart();const badge=$('cart-badge');badge.classList.add('scale-125');setTimeout(()=>badge.classList.remove('scale-125'),180); };
  window.removeFromCart = index => { cart.splice(index,1);updateCartBadge();renderCart(); };
  function updateCartBadge(){const b=$('cart-badge');b.textContent=String(cart.length);b.classList.toggle('hidden',cart.length===0);}
  function renderCart(){
    const c=$('cart-items-container'),t=$('cart-total'); if(!c||!t)return;
    if(!cart.length){c.innerHTML='<div class="text-center text-slate-500 py-8">Seu carrinho está vazio.</div>';t.textContent=money(0);return;}
    c.replaceChildren();
    cart.forEach((item,index)=>{const row=document.createElement('div');row.className='flex items-center justify-between bg-darkBg/60 p-3.5 rounded-2xl border border-slate-800';const info=document.createElement('div');const title=document.createElement('h4');title.className='text-sm font-bold text-white';title.textContent=item.name;const price=document.createElement('span');price.className='text-xs text-blue-300 font-semibold';price.textContent=money(item.price);info.append(title,price);const remove=document.createElement('button');remove.className='text-slate-400 hover:text-rose-400 p-2';remove.setAttribute('aria-label','Remover '+item.name);remove.innerHTML='<i class="fa-solid fa-trash text-sm"></i>';remove.addEventListener('click',()=>window.removeFromCart(index));row.append(info,remove);c.append(row);});
    t.textContent=money(cart.reduce((s,i)=>s+i.price,0));
  }
  window.loginWithDiscord = async () => {
    hideNotice('login-notice');
    if(!supabase){showNotice('login-notice','Configure SUPABASE_ANON_KEY no arquivo config.js antes de habilitar o login.','error');return;}
    try { const redirectTo=window.location.origin+window.location.pathname; const {error}=await supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo,scopes:'identify email'}}); if(error)throw error; }
    catch(e){showNotice('login-notice','Não foi possível iniciar o login: '+(e.message||'erro de autenticação'),'error');}
  };
  async function refreshAuth(){
    const label=$('auth-label'),mobile=$('auth-label-mobile');
    if(!supabase){if(label)label.textContent='Configurar login';if(mobile)mobile.textContent='Configurar login';return;}
    const {data}=await supabase.auth.getSession(); const session=data?.session; let text='Entrar com Discord';
    if(session){const meta=session.user.user_metadata||{};text=meta.global_name||meta.full_name||meta.name||session.user.email||'Conta conectada';}
    if(label)label.textContent=text;if(mobile)mobile.textContent=text;
    if(session && window.location.hash.includes('access_token')) history.replaceState(null,'',window.location.pathname+window.location.search);
  }
  window.proceedToCheckout = async () => {
    const fivemId=String($('fivem-id')?.value||'').trim(); const email=String($('buyer-email')?.value||'').trim();
    if(!/^[0-9]{1,12}$/.test(fivemId)){alert('Informe um passaporte/ID FiveM válido.');return;}
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){alert('Informe um e-mail válido para o pagamento PIX.');return;}
    if(!cart.length){alert('Seu carrinho está vazio.');return;}
    if(!supabase){alert('A loja ainda não está configurada: preencha a chave pública do Supabase em config.js. Nenhuma cobrança foi criada.');return;}
    const {data:sessionData}=await supabase.auth.getSession();
    if(!sessionData?.session){alert('Entre com sua conta Discord antes de realizar a compra.');window.toggleLoginModal();return;}
    $('cart-modal').classList.add('hidden');$('checkout-modal').classList.remove('hidden');$('checkout-loading').classList.remove('hidden');$('checkout-content').classList.add('hidden');$('checkout-error').classList.add('hidden');
    try{
      const headers=await jsonHeaders();
      const response=await fetch(`${cfg.FUNCTIONS_BASE_URL}/${cfg.CREATE_PAYMENT_FUNCTION}`,{method:'POST',headers,body:JSON.stringify({items:cart.map(i=>({name:i.name,type:i.type})),fivem_id:fivemId,payer_email:email})});
      const result=await response.json().catch(()=>({})); if(!response.ok)throw new Error(result.error||result.message||`Erro HTTP ${response.status}`);
      if(!result.order_id||!result.qr_code)throw new Error('O provedor não retornou os dados reais do PIX. Nenhum pagamento foi confirmado.');
      currentOrderId=result.order_id; $('checkout-order-id').textContent=currentOrderId;$('checkout-final-value').textContent=money(result.amount);$('checkout-user-id').textContent=fivemId;$('pix-code').value=result.qr_code;$('checkout-payment-status').textContent='Aguardando pagamento';
      const img=$('pix-qr-image'); if(result.qr_code_base64){img.src='data:image/png;base64,'+result.qr_code_base64;img.classList.remove('hidden');$('pix-no-qr').classList.add('hidden');}else{img.classList.add('hidden');$('pix-no-qr').classList.remove('hidden');}
      $('checkout-loading').classList.add('hidden');$('checkout-content').classList.remove('hidden');showNotice('checkout-notice','PIX gerado pelo provedor. Esta tela não confirma pagamento; aguarde o webhook validado.','info');startPaymentPolling();
    }catch(e){$('checkout-loading').classList.add('hidden');$('checkout-error').classList.remove('hidden');$('checkout-error-text').textContent=e.message||'Falha ao criar pagamento.';}
  };
  window.closeCheckout=()=>{ $('checkout-modal').classList.add('hidden'); if(paymentPollTimer){clearInterval(paymentPollTimer);paymentPollTimer=null;} };
  window.copyPixCode=async()=>{const value=$('pix-code')?.value||'';if(!value){showNotice('checkout-notice','Ainda não há código PIX para copiar.','error');return;}try{await navigator.clipboard.writeText(value);showNotice('checkout-notice','Código PIX copiado. O pagamento ainda precisa ser confirmado pelo provedor.','success');}catch{const input=$('pix-code');input.select();document.execCommand('copy');showNotice('checkout-notice','Código PIX copiado. O pagamento ainda precisa ser confirmado pelo provedor.','success');}};
  window.checkPaymentStatus=async()=>{
    if(!currentOrderId||!supabase){showNotice('checkout-notice','Não há pedido consultável nesta sessão.','error');return;}
    try{const headers=await jsonHeaders();const r=await fetch(`${cfg.FUNCTIONS_BASE_URL}/${cfg.PAYMENT_STATUS_FUNCTION}?order_id=${encodeURIComponent(currentOrderId)}`,{headers});const data=await r.json();if(!r.ok)throw new Error(data.error||'Não foi possível consultar o pedido.');const status=data.status||'pending';$('checkout-payment-status').textContent=({pending:'Aguardando pagamento',paid:'Pagamento confirmado',failed:'Pagamento recusado/cancelado',refunded:'Estornado',delivery_pending:'Pago — entrega aguardando integração'})[status]||status;
      if(status==='paid'||status==='delivery_pending'){showNotice('checkout-notice','Pagamento confirmado pelo backend. A entrega depende do worker/integração do servidor estar configurado.','success');cart=[];updateCartBadge();renderCart();if(paymentPollTimer){clearInterval(paymentPollTimer);paymentPollTimer=null;}}
      else showNotice('checkout-notice','Status verificado pelo backend: '+$('checkout-payment-status').textContent+'.','info');
    }catch(e){showNotice('checkout-notice',e.message||'Erro ao consultar status.','error');}
  };
  function startPaymentPolling(){if(paymentPollTimer)clearInterval(paymentPollTimer);paymentPollTimer=setInterval(()=>window.checkPaymentStatus(),10000);}

  let managedProducts=[],managedCategories=[],activeCatalogCategory='all';
  function safeText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function loadManagedCatalog(){
    if(!supabase)return;
    try{
      const [cr,pr]=await Promise.all([supabase.from('store_categories').select('id,name,slug,active,sort_order').eq('active',true).order('sort_order'),supabase.from('store_products').select('id,name,description,product_type,price,image_url,category_id,sort_order,store_categories(name,slug)').eq('active',true).order('sort_order').order('name')]);
      if(cr.error||pr.error)throw cr.error||pr.error;
      if(!Array.isArray(pr.data)||!pr.data.length)return;
      managedCategories=cr.data||[];managedProducts=pr.data;
      // If DB catalog is available, it becomes the single source of truth for the public store.
      ['vips','veiculos','dinheiro','especiais'].forEach(id=>{const el=$(id);if(el)el.classList.add('hidden')});
      const section=$('catalogo');if(section)section.classList.remove('hidden');
      document.querySelectorAll('a[href="#catalogo"]').forEach(el=>{if(el.textContent.trim()==='Ver Planos VIP')el.textContent='Ver catálogo'});
      renderManagedCatalog();
    }catch(e){const err=$('catalog-load-error');if(err){err.textContent='O catálogo administrado não está disponível. Os produtos atuais permanecem visíveis. Confira as tabelas e políticas RLS do Supabase.';err.classList.remove('hidden')} }
  }
  function renderManagedCatalog(){
    const filters=$('catalog-category-filters'),list=$('catalog-products');if(!filters||!list)return;
    const cats=[{id:'all',name:'Todos'},...managedCategories];filters.replaceChildren();cats.forEach(cat=>{const b=document.createElement('button');b.className='px-4 py-2 rounded-full border text-sm font-bold '+(String(activeCatalogCategory)===String(cat.id)?'bg-cyan-500 text-slate-950 border-cyan-400':'bg-slate-900/70 text-slate-300 border-slate-700');b.textContent=cat.name;b.addEventListener('click',()=>{activeCatalogCategory=String(cat.id);renderManagedCatalog()});filters.append(b)});
    list.replaceChildren();const visible=managedProducts.filter(p=>activeCatalogCategory==='all'||String(p.category_id||'')===activeCatalogCategory);
    if(!visible.length){list.innerHTML='<p class="text-slate-400 text-center col-span-full py-10">Nenhum produto ativo nesta categoria.</p>';return}
    visible.forEach(p=>{const card=document.createElement('article');card.className='rounded-3xl overflow-hidden border border-slate-800 bg-slate-900/70 hover:border-cyan-500/50 transition-all flex flex-col';const image=p.image_url?`<img src="${safeText(p.image_url)}" alt="${safeText(p.name)}" class="w-full h-48 object-cover" loading="lazy" onerror="this.style.display=\'none\'">`:`<div class="w-full h-48 flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-rose-950"><span class="text-5xl">${p.product_type==='vip'?'👑':p.product_type==='veiculo'?'🏎️':p.product_type==='dinheiro'?'💵':'🎁'}</span></div>`;card.innerHTML=`${image}<div class="p-5 flex flex-col flex-1"><div class="text-[10px] uppercase tracking-[.18em] text-cyan-300 font-black">${safeText(p.store_categories?.name||'Complexo América')}</div><h3 class="text-xl font-black mt-2">${safeText(p.name)}</h3><p class="text-sm text-slate-400 mt-2 flex-1">${safeText(p.description||'Produto oficial da loja Complexo América RP.')}</p><div class="flex items-center justify-between gap-3 mt-5"><span class="text-2xl font-black text-cyan-300">${money(p.price)}</span><button class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-sm">Adicionar</button></div></div>`;card.querySelector('button').addEventListener('click',()=>window.addToCart(p.name,Number(p.price),p.product_type));list.append(card)});
  }

  window.copyIP=async()=>{const value='connect cpx.complexoamerica.com.br';try{await navigator.clipboard.writeText(value);}catch{const el=document.createElement('textarea');el.value=value;document.body.append(el);el.select();document.execCommand('copy');el.remove();}alert('Comando copiado: '+value);};

  async function refreshServerStatus(){
    const count=$('online-players'),dot=$('server-status-dot'),label=$('server-status-text'),hero=$('hero-server-label'),detail=$('server-status-detail');
    try{const url=`${cfg.FUNCTIONS_BASE_URL}/${cfg.SERVER_STATUS_FUNCTION}`;const headers={};if(cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_ANON_KEY.startsWith('COLE_AQUI'))headers.apikey=cfg.SUPABASE_ANON_KEY;const r=await fetch(url,{headers,cache:'no-store'});const data=await r.json();if(!r.ok||!data.online)throw new Error(data.error||'Servidor indisponível ou status não configurado');
      count.textContent=`${data.players} / ${data.maxPlayers}`;dot.className='status-dot online';label.textContent='Servidor online';label.className='block text-xs text-emerald-300 font-semibold mt-1';hero.textContent='Servidor online • dados reais';detail.textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }catch(e){count.textContent='Indisponível';dot.className='status-dot offline';label.textContent='Status não confirmado';label.className='block text-xs text-rose-300 font-semibold mt-1';hero.textContent='Status do servidor indisponível';detail.textContent='Configure o endpoint FiveM e a função server-status.';}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    if(!hasSupabaseConfig){const b=$('auth-btn');if(b)b.title='Configure o Supabase para habilitar autenticação real.';}
    refreshAuth();if(supabase)supabase.auth.onAuthStateChange(()=>refreshAuth());
    refreshServerStatus();setInterval(refreshServerStatus,60000);
    renderCart();loadManagedCatalog();
  });
})();
