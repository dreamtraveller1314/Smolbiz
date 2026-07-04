-- =========================================================
-- SMOLBIZ database schema
-- Run this whole file once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run
-- =========================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "uuid-ossp";

-- ---------- BUSINESSES ----------
create table if not exists businesses (
  id uuid primary key default uuid_generate_v4(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  logo_url text,
  business_type text check (business_type in ('food_fashion_handmade','digital_products','services','others')),
  sales_platform text,
  monthly_revenue numeric,
  location_lat double precision,
  location_lng double precision,
  location_address text,
  forecast_sensitivity numeric default 1.0,
  social_links jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ---------- PROFILES (extends auth.users) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  role text check (role in ('admin','worker')) not null,
  name text,
  email text,
  phone text,
  permissions jsonb default '{"sales": true, "products": true}'::jsonb,
  created_at timestamptz default now()
);

-- ---------- INVITES ----------
create table if not exists invites (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade,
  name text,
  email text not null,
  token text not null unique default uuid_generate_v4()::text,
  status text default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now()
);

-- ---------- PRODUCTS ----------
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade,
  name text not null,
  sku text,
  price numeric not null default 0,
  stock integer default 0,
  low_stock_threshold integer default 5,
  created_at timestamptz default now()
);

-- ---------- TRANSACTIONS (sales + expenses) ----------
create table if not exists transactions (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade,
  type text check (type in ('sale','expense')) not null,
  product_id uuid references products(id) on delete set null,
  quantity integer default 1,
  amount numeric not null,
  payment_method text,
  worker_id uuid references profiles(id) on delete set null,
  photo_url text,
  note text,
  created_at timestamptz default now()
);

-- ---------- ATTENDANCE ----------
create table if not exists attendance (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade,
  worker_id uuid references profiles(id) on delete cascade,
  clock_in timestamptz,
  clock_out timestamptz,
  lat double precision,
  lng double precision,
  within_range boolean,
  photo_url text,
  created_at timestamptz default now()
);

-- ---------- CHAT CHANNELS ----------
create table if not exists channels (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists channel_members (
  channel_id uuid references channels(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  primary key (channel_id, profile_id)
);

create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references channels(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

-- ---------- CALENDAR EVENTS ----------
create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  business_id uuid references businesses(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  title text not null,
  event_time timestamptz not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table businesses enable row level security;
alter table profiles enable row level security;
alter table invites enable row level security;
alter table products enable row level security;
alter table transactions enable row level security;
alter table attendance enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table events enable row level security;

-- helper: get current user's business_id
create or replace function my_business_id() returns uuid as $$
  select business_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function my_role() returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- businesses: admin can manage their own; workers can read their own
create policy "biz_select" on businesses for select using (id = my_business_id() or admin_id = auth.uid());
create policy "biz_insert" on businesses for insert with check (admin_id = auth.uid());
create policy "biz_update" on businesses for update using (admin_id = auth.uid());

-- profiles: users can see profiles in their own business; can update their own row
create policy "profiles_select" on profiles for select using (business_id = my_business_id() or id = auth.uid());
create policy "profiles_insert" on profiles for insert with check (id = auth.uid());
create policy "profiles_update" on profiles for update using (id = auth.uid() or (my_role() = 'admin' and business_id = my_business_id()));
create policy "profiles_delete" on profiles for delete using (my_role() = 'admin' and business_id = my_business_id());

-- invites: readable by anyone checking their own email (needed at signup, pre-auth link), manageable by admin
create policy "invites_select" on invites for select using (true);
create policy "invites_insert" on invites for insert with check (business_id = my_business_id());
create policy "invites_update" on invites for update using (true);

-- generic business-scoped policy for the rest
create policy "products_all" on products for all using (business_id = my_business_id()) with check (business_id = my_business_id());
create policy "transactions_all" on transactions for all using (business_id = my_business_id()) with check (business_id = my_business_id());
create policy "attendance_all" on attendance for all using (business_id = my_business_id()) with check (business_id = my_business_id());
create policy "channels_all" on channels for all using (business_id = my_business_id()) with check (business_id = my_business_id());
create policy "events_all" on events for all using (business_id = my_business_id()) with check (business_id = my_business_id());

create policy "channel_members_select" on channel_members for select using (
  channel_id in (select id from channels where business_id = my_business_id())
);
create policy "channel_members_insert" on channel_members for insert with check (
  channel_id in (select id from channels where business_id = my_business_id())
);

create policy "messages_select" on messages for select using (
  channel_id in (select id from channels where business_id = my_business_id())
);
create policy "messages_insert" on messages for insert with check (
  channel_id in (select id from channels where business_id = my_business_id())
);

-- allow reading other businesses' basic public fields for the Collab & Trend page
create policy "biz_public_directory" on businesses for select using (true);

-- =========================================================
-- STORAGE BUCKETS (photos: logos, sale proof photos, attendance photos)
-- =========================================================
insert into storage.buckets (id, name, public) values ('smolbiz-media','smolbiz-media', true)
  on conflict (id) do nothing;

create policy "media_public_read" on storage.objects for select using (bucket_id = 'smolbiz-media');
create policy "media_auth_upload" on storage.objects for insert with check (bucket_id = 'smolbiz-media' and auth.role() = 'authenticated');
