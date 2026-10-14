-- Complexo América RP: tabelas mínimas da loja. Execute no SQL Editor do Supabase.
create extension if not exists pgcrypto;

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  fivem_id text not null check (fivem_id ~ '^[0-9]{1,12}$'),
  payer_email text not null,
  items jsonb not null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded','delivery_pending','delivered')),
  provider text not null default 'mercadopago',
  provider_payment_id text unique,
  provider_status text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.store_orders(id) on delete restrict,
  fivem_id text not null,
  items jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','delivered','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

alter table public.store_orders enable row level security;
alter table public.delivery_jobs enable row level security;
-- Usuário só lê seus próprios pedidos. Escrita de pedidos e jobs fica nas Edge Functions com service role.
drop policy if exists "users read own orders" on public.store_orders;
create policy "users read own orders" on public.store_orders for select to authenticated using (auth.uid() = user_id);
-- Nenhuma política de leitura/escrita para clientes em delivery_jobs: acesso apenas backend.
revoke all on public.store_orders from anon, authenticated;
grant select on public.store_orders to authenticated;
revoke all on public.delivery_jobs from anon, authenticated;

create index if not exists store_orders_user_created_idx on public.store_orders(user_id, created_at desc);
create index if not exists store_orders_status_idx on public.store_orders(status, created_at);
create index if not exists delivery_jobs_status_idx on public.delivery_jobs(status, created_at);
