-- PortCall core schema (CLAUDE.md section 4), plus:
--   importers.auto_book_enabled / auto_quote_enabled  (dashboard toggles)
--   providers.service_states                          (lane eligibility: "not called: lane not served")
--   RLS: the importer owner can read their own rows; server routes and webhooks write with the service role.
--   Realtime: every table the UI animates from is in supabase_realtime.

create extension if not exists pgcrypto;

create table public.importers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  stripe_customer_id text,
  default_payment_method_id text,
  auto_book_limit_cents int not null default 150000,
  auto_book_enabled boolean not null default true,
  auto_quote_enabled boolean not null default false,
  auto_quote_days_before_eta int not null default 3,
  mcp_api_key text unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz default now()
);

create table public.providers (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references public.importers(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text not null,
  email text not null,
  ports text[] default '{Charleston}',
  service_states text[] default '{SC,GA,NC}',
  stripe_account_id text,
  stripe_onboarded boolean default false,
  created_at timestamptz default now()
);

create table public.containers (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references public.importers(id) on delete cascade,
  container_number text not null,
  size text default '40HC',
  port text default 'Charleston',
  terminal text,
  vessel text,
  eta timestamptz,
  last_free_day date,
  destination_name text,
  destination_address text,
  deliver_by date,
  status text default 'inbound' check (status in
    ('inbound','quoting','quoted','booked','accepted','picked_up','delivered')),
  created_at timestamptz default now()
);

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  container_id uuid references public.containers(id) on delete cascade,
  triggered_by text check (triggered_by in ('button','auto','agent')),
  status text default 'calling' check (status in ('calling','complete','failed')),
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid references public.quote_requests(id) on delete cascade,
  provider_id uuid references public.providers(id),
  vapi_call_id text unique,
  status text default 'queued' check (status in
    ('queued','ringing','in_progress','ended','failed','no_answer')),
  speaking text check (speaking in ('assistant','user')),
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  summary text
);

create table public.transcript_lines (
  id bigserial primary key,
  call_id uuid references public.calls(id) on delete cascade,
  role text check (role in ('assistant','user')),
  text text not null,
  created_at timestamptz default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  call_id uuid unique references public.calls(id) on delete cascade,
  provider_id uuid references public.providers(id),
  container_id uuid references public.containers(id) on delete cascade,
  linehaul_cents int,
  fuel_surcharge_cents int,
  chassis_per_day_cents int,
  est_chassis_days int,
  accessorials jsonb default '[]',      -- [{name, cents}]
  all_in_cents int,
  earliest_pickup date,
  can_meet_deadline boolean,
  projected_demurrage_cents int,        -- computed in code: days past LFD * DEMURRAGE_PER_DAY_CENTS
  risk_adjusted_cents int,
  notes text,
  field_sources jsonb default '{}',     -- {field_name: transcript_line_id}
  updated_at timestamptz default now()
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid references public.quote_requests(id) on delete cascade,
  container_id uuid references public.containers(id) on delete cascade,
  ranked_quote_ids uuid[],
  winner_quote_id uuid references public.quotes(id) on delete set null,
  reasoning text,
  created_at timestamptz default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  container_id uuid references public.containers(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  provider_id uuid references public.providers(id),
  amount_cents int not null,
  platform_fee_cents int not null,
  stripe_payment_intent_id text,
  payment_status text check (payment_status in ('authorized','captured','canceled','failed')),
  tender_token text unique default encode(gen_random_bytes(16), 'hex'),
  tender_status text default 'sent' check (tender_status in ('sent','accepted','declined')),
  booked_by text check (booked_by in ('human','agent','auto')),
  created_at timestamptz default now(),
  accepted_at timestamptz
);

create table public.events (
  id bigserial primary key,
  container_id uuid references public.containers(id) on delete cascade,
  type text not null,      -- quote_requested, call_started, field_heard, call_ended, recommended, booked, payment_authorized, tender_sent, accepted, picked_up, delivered, payment_captured
  payload jsonb default '{}',
  created_at timestamptz default now()
);

-- Lookups the app does constantly
create index on public.providers (importer_id);
create index on public.containers (importer_id);
create unique index containers_importer_number_key on public.containers (importer_id, container_number);
create index on public.quote_requests (container_id, created_at desc);
create index on public.calls (quote_request_id);
create index on public.transcript_lines (call_id, id);
create index on public.quotes (container_id);
create index on public.recommendations (container_id, created_at desc);
create index on public.bookings (container_id);
create index on public.events (container_id, id);

-- ---------------------------------------------------------------------------
-- Ownership helpers. security definer so policies don't recurse through RLS.
-- ---------------------------------------------------------------------------

create or replace function public.owns_importer(p_importer_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.importers i
    where i.id = p_importer_id and i.owner_id = (select auth.uid())
  );
$$;

create or replace function public.owns_container(p_container_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.containers c
    join public.importers i on i.id = c.importer_id
    where c.id = p_container_id and i.owner_id = (select auth.uid())
  );
$$;

create or replace function public.owns_quote_request(p_quote_request_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.quote_requests q
    join public.containers c on c.id = q.container_id
    join public.importers i on i.id = c.importer_id
    where q.id = p_quote_request_id and i.owner_id = (select auth.uid())
  );
$$;

create or replace function public.owns_call(p_call_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.calls k
    join public.quote_requests q on q.id = k.quote_request_id
    join public.containers c on c.id = q.container_id
    join public.importers i on i.id = c.importer_id
    where k.id = p_call_id and i.owner_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_importer(uuid) from public, anon;
revoke all on function public.owns_container(uuid) from public, anon;
revoke all on function public.owns_quote_request(uuid) from public, anon;
revoke all on function public.owns_call(uuid) from public, anon;
grant execute on function public.owns_importer(uuid) to authenticated;
grant execute on function public.owns_container(uuid) to authenticated;
grant execute on function public.owns_quote_request(uuid) to authenticated;
grant execute on function public.owns_call(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: owner reads own rows. All writes go through server routes (service role),
-- except the owner may update their own importer settings.
-- ---------------------------------------------------------------------------

alter table public.importers enable row level security;
alter table public.providers enable row level security;
alter table public.containers enable row level security;
alter table public.quote_requests enable row level security;
alter table public.calls enable row level security;
alter table public.transcript_lines enable row level security;
alter table public.quotes enable row level security;
alter table public.recommendations enable row level security;
alter table public.bookings enable row level security;
alter table public.events enable row level security;

create policy "owner reads importer" on public.importers
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner updates importer" on public.importers
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "owner reads providers" on public.providers
  for select to authenticated using (public.owns_importer(importer_id));

create policy "owner reads containers" on public.containers
  for select to authenticated using (public.owns_importer(importer_id));

create policy "owner reads quote_requests" on public.quote_requests
  for select to authenticated using (public.owns_container(container_id));

create policy "owner reads calls" on public.calls
  for select to authenticated using (public.owns_quote_request(quote_request_id));

create policy "owner reads transcript_lines" on public.transcript_lines
  for select to authenticated using (public.owns_call(call_id));

create policy "owner reads quotes" on public.quotes
  for select to authenticated using (public.owns_container(container_id));

create policy "owner reads recommendations" on public.recommendations
  for select to authenticated using (public.owns_container(container_id));

create policy "owner reads bookings" on public.bookings
  for select to authenticated using (public.owns_container(container_id));

create policy "owner reads events" on public.events
  for select to authenticated using (public.owns_container(container_id));


-- ---------------------------------------------------------------------------
-- Realtime: the Call Wall, ranking reveal, timeline and payment stamps stream from these.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table
  public.containers, public.quote_requests, public.calls, public.transcript_lines,
  public.quotes, public.recommendations, public.bookings, public.events;
