export const DEMO_DDL = `
create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  segment text,
  phone text,
  address text,
  opening_hours jsonb not null,
  slot_interval_min integer not null default 15,
  online_booking_enabled boolean not null default true,
  min_advance_min integer not null default 60,
  created_at timestamptz not null default now()
);
create table if not exists professionals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  name text not null,
  photo_url text,
  phone text,
  email text,
  specialties text,
  color text not null default '#7B3FF2',
  work_schedule jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  name text not null,
  category text not null default 'Geral',
  description text,
  price_cents integer not null,
  duration_min integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists professional_services (
  professional_id uuid not null,
  service_id uuid not null,
  primary key (professional_id, service_id)
);
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  name text not null,
  phone text not null,
  phone_normalized text not null,
  email text,
  birth_date date,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  client_id uuid not null,
  service_id uuid not null,
  professional_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents integer not null default 0,
  payment_method text,
  status text not null default 'pending',
  notes text,
  source text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_business_start_idx on appointments (business_id, starts_at);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  appointment_id uuid,
  amount_cents integer not null,
  method text not null,
  paid_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  description text not null,
  category text not null default 'Outros',
  amount_cents integer not null,
  date date not null,
  created_at timestamptz not null default now()
);
create table if not exists time_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  professional_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now()
);
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  type text not null,
  title text not null,
  body text,
  appointment_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
`
