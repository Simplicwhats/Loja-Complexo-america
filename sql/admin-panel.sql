-- Painel administrativo da loja Complexo América RP
-- Execute no SQL Editor do Supabase DEPOIS do schema.sql original.
create extension if not exists pgcrypto;

create table if not exists public.store_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.store_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.store_categories(id) on delete set null,
  name text not null unique,
  description text not null default '',
  product_type text not null default 'especial' check (product_type in ('vip','veiculo','dinheiro','especial','item')),
  price numeric(10,2) not null check (price >= 0.01),
  image_url text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  delivery_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_products_active_sort_idx on public.store_products(active, sort_order, name);
create index if not exists store_products_category_idx on public.store_products(category_id);
create index if not exists store_orders_created_admin_idx on public.store_orders(created_at desc);

create or replace function public.is_store_admin()
returns boolean language sql stable security definer set search_path = public, auth
as $$ select exists (select 1 from public.store_admins a where a.user_id = auth.uid()); $$;
revoke all on function public.is_store_admin() from public, anon;
grant execute on function public.is_store_admin() to authenticated;

alter table public.store_admins enable row level security;
alter table public.store_categories enable row level security;
alter table public.store_products enable row level security;
alter table public.store_orders enable row level security;
alter table public.delivery_jobs enable row level security;

drop policy if exists "admins read own admin grant" on public.store_admins;
create policy "admins read own admin grant" on public.store_admins for select to authenticated using (user_id = auth.uid());

drop policy if exists "public read active categories" on public.store_categories;
create policy "public read active categories" on public.store_categories for select to anon, authenticated using (active = true or public.is_store_admin());
drop policy if exists "admins manage categories" on public.store_categories;
create policy "admins manage categories" on public.store_categories for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());

drop policy if exists "public read active products" on public.store_products;
create policy "public read active products" on public.store_products for select to anon, authenticated using (active = true or public.is_store_admin());
drop policy if exists "admins manage products" on public.store_products;
create policy "admins manage products" on public.store_products for all to authenticated using (public.is_store_admin()) with check (public.is_store_admin());

drop policy if exists "admins read all orders" on public.store_orders;
create policy "admins read all orders" on public.store_orders for select to authenticated using (public.is_store_admin());
drop policy if exists "admins read delivery queue" on public.delivery_jobs;
create policy "admins read delivery queue" on public.delivery_jobs for select to authenticated using (public.is_store_admin());

-- O navegador pode ler o catálogo; alterações de preço/categoria só para administradores.
grant select on public.store_categories, public.store_products to anon, authenticated;
grant insert, update, delete on public.store_categories, public.store_products to authenticated;
grant select on public.store_orders, public.delivery_jobs to authenticated;
revoke insert, update, delete on public.store_orders from anon, authenticated;
revoke insert, update, delete on public.delivery_jobs from anon, authenticated;

insert into public.store_categories(name,slug,description,sort_order) values
 ('VIPs','vips','Planos e benefícios VIP',1),
 ('Veículos','veiculos','Veículos para a cidade',2),
 ('Dinheiro In-Game','dinheiro','Pacotes de moeda do jogo',3),
 ('Especiais','especiais','Passaportes e itens especiais',4)
on conflict (slug) do nothing;

insert into public.store_products(name,description,product_type,price,category_id,sort_order,delivery_payload) values
 ('VIP Bronze','Plano VIP Bronze','vip',35,(select id from public.store_categories where slug='vips'),1,'{"kind":"vip","tier":"bronze"}'::jsonb),
 ('VIP Prata','Plano VIP Prata','vip',70,(select id from public.store_categories where slug='vips'),2,'{"kind":"vip","tier":"prata"}'::jsonb),
 ('VIP Ouro / Diamante','Plano VIP Ouro / Diamante','vip',130,(select id from public.store_categories where slug='vips'),3,'{"kind":"vip","tier":"ouro_diamante"}'::jsonb),
 ('Lamborghini Aventador SVJ','Veículo importado','veiculo',55,(select id from public.store_categories where slug='veiculos'),1,'{"kind":"vehicle","model":"lamborghini_aventador_svj"}'::jsonb),
 ('BMW M4 Competition','Veículo importado','veiculo',40,(select id from public.store_categories where slug='veiculos'),2,'{"kind":"vehicle","model":"bmwm4"}'::jsonb),
 ('Porsche 911 GT3 RS','Veículo importado','veiculo',50,(select id from public.store_categories where slug='veiculos'),3,'{"kind":"vehicle","model":"porsche911gt3rs"}'::jsonb),
 ('Obey 10F Widebody','Veículo importado','veiculo',45,(select id from public.store_categories where slug='veiculos'),4,'{"kind":"vehicle","model":"obey10f"}'::jsonb),
 ('Pacote 500k In-Game','Pacote de dinheiro do jogo','dinheiro',20,(select id from public.store_categories where slug='dinheiro'),1,'{"kind":"money","amount":500000}'::jsonb),
 ('Pacote 2M In-Game','Pacote de dinheiro do jogo','dinheiro',50,(select id from public.store_categories where slug='dinheiro'),2,'{"kind":"money","amount":2000000}'::jsonb),
 ('Pacote 5M In-Game','Pacote de dinheiro do jogo','dinheiro',100,(select id from public.store_categories where slug='dinheiro'),3,'{"kind":"money","amount":5000000}'::jsonb),
 ('ID Personalizado (Passaporte)','Personalização de passaporte','especial',60,(select id from public.store_categories where slug='especiais'),1,'{"kind":"custom_id"}'::jsonb),
 ('Mochila Tática + Kit Inicial','Item especial','especial',30,(select id from public.store_categories where slug='especiais'),2,'{"kind":"starter_kit"}'::jsonb)
on conflict (name) do nothing;

-- A conta precisa já ter entrado uma vez pelo Discord para existir em auth.users.
-- Se ainda não existir, entre pela loja/admin.html com o Discord e execute este INSERT novamente.
insert into public.store_admins(user_id)
select id from auth.users where lower(email) = lower('Complexo@gmail.com')
on conflict (user_id) do nothing;

-- Se o e-mail da conta que usa o Discord for diferente, substitua o e-mail acima pelo e-mail verificado dessa conta.
