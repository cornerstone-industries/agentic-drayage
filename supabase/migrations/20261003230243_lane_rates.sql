-- Lane history: one row per carrier quote on a lane (port to destination city, box size). Every finished
-- quote run writes its quotes here (source 'call'), so rate and reliability data compounds with each call.
-- Seeded rows (source 'seed') are synthetic history for the demo and are labeled as such in the UI.
create table public.lane_rates (
  id bigserial primary key,
  importer_id uuid not null references public.importers(id) on delete cascade,
  provider_id uuid references public.providers(id) on delete set null,
  provider_name text not null,
  origin text not null default 'Charleston',
  terminal text,
  dest_city text not null,
  dest_state text not null,
  size text not null default '40HC',
  quoted_on date not null,
  linehaul_cents int,
  fuel_cents int,
  chassis_cents int,
  accessorials_cents int,
  all_in_cents int not null,
  pickup_vs_lfd_days int,
  met_deadline boolean,
  won boolean not null default false,
  source text not null default 'call' check (source in ('call', 'seed')),
  quote_id uuid unique references public.quotes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index lane_rates_lane_idx on public.lane_rates (importer_id, dest_state, dest_city, size, quoted_on);
create index lane_rates_provider_idx on public.lane_rates (provider_id);

alter table public.lane_rates enable row level security;

create policy "owner reads lane_rates" on public.lane_rates
  for select to authenticated using (private.owns_importer(importer_id));
