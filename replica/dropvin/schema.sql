-- Listo (nom de travail) : schéma initial, Postgres / Supabase
-- Accès : RLS sur toutes les tables. Écritures de plan, quota, abonnement et création d'annonces : service role uniquement.

create extension if not exists pgcrypto;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- profiles
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial','pro','booster')),
  billing_period text check (billing_period in ('monthly','yearly')),
  stripe_customer_id text unique,
  timezone text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin insert into profiles (id) values (new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- subscriptions
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  plan text not null check (plan in ('pro','booster')),
  billing_period text not null check (billing_period in ('monthly','yearly')),
  status text not null check (status in
    ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused')),
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (user_id);
create trigger subscriptions_updated before update on subscriptions for each row execute function set_updated_at();

-- ---------------------------------------------------------------- stripe_events (idempotence)
create table stripe_events (
  id text primary key,                 -- evt_...
  type text not null,
  processed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- source_products
create table source_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  platform text not null check (platform in ('aliexpress','temu','shein','other')),
  url text not null,
  external_id text,
  title text,
  specs jsonb not null default '{}',
  category text,
  photo_count int not null default 0,
  purchase_price_cents int check (purchase_price_cents >= 0),
  shipping_cost_cents int check (shipping_cost_cents >= 0),
  price_source text check (price_source in ('api','extension','screenshot','manual')),
  variants jsonb not null default '[]',
  currency text not null default 'EUR',
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending','extracted','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on source_products (user_id, created_at desc);
create trigger source_products_updated before update on source_products for each row execute function set_updated_at();

-- ---------------------------------------------------------------- source_files
create table source_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source_product_id uuid not null references source_products(id) on delete cascade,
  kind text not null check (kind in ('screenshot','photo')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 8388608),
  created_at timestamptz not null default now()
);
create index on source_files (source_product_id);
create index on source_files (user_id);

-- ---------------------------------------------------------------- listings
create table listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  source_product_id uuid not null references source_products(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  error text,
  decor text not null default 'studio' check (decor in ('studio','chez_moi')),
  title text check (char_length(title) <= 100),
  description text check (char_length(description) <= 3000),
  hashtags text[] not null default '{}',
  suggested_price_cents int check (suggested_price_cents >= 0),
  currency text not null default 'EUR',
  score smallint check (score between 0 and 100),
  score_details jsonb,
  est_margin_cents int,
  user_verified boolean not null default false,
  quota_day date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on listings (user_id, created_at desc);
create index on listings (source_product_id);
create index on listings (status) where status in ('queued','processing');
create trigger listings_updated before update on listings for each row execute function set_updated_at();

-- ---------------------------------------------------------------- listing_images
create table listing_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  decor text not null check (decor in ('studio','chez_moi')),
  storage_path text not null unique,
  regenerations smallint not null default 0 check (regenerations between 0 and 2),
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);
create index on listing_images (user_id);

-- ---------------------------------------------------------------- pricing_settings
create table pricing_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  target_margin_pct numeric(5,2) not null default 40 check (target_margin_pct between 0 and 90),
  fixed_duty_cents int not null default 0 check (fixed_duty_cents >= 0),
  rounding text not null default 'x90' check (rounding in ('none','x90','x99','x9')),
  updated_at timestamptz not null default now()
);
create trigger pricing_settings_updated before update on pricing_settings for each row execute function set_updated_at();

-- ---------------------------------------------------------------- channel_accounts (plateformes connectées)
create table channel_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  channel text not null check (channel in ('vinted_pro','shopify','ebay')),
  external_account_id text not null,
  display_name text,
  access_token_enc bytea not null,          -- chiffré côté application (AES-GCM)
  refresh_token_enc bytea,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','expired','revoked','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel, external_account_id)
);
create index on channel_accounts (user_id);
create index on channel_accounts (token_expires_at) where status = 'active';
create trigger channel_accounts_updated before update on channel_accounts for each row execute function set_updated_at();

-- ---------------------------------------------------------------- publications (1 annonce x 1 plateforme)
create table publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  channel_account_id uuid references channel_accounts(id) on delete set null,
  channel text not null check (channel in ('vinted_pro','shopify','ebay','assisted')),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'EUR',
  status text not null default 'pending'
    check (status in ('pending','publishing','live','sold','removed','failed')),
  external_id text,
  external_url text,
  error text,
  published_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on publications (user_id, created_at desc);
create index on publications (listing_id);
create index on publications (channel_account_id);
create unique index on publications (channel_account_id, external_id) where external_id is not null;
create unique index publications_one_live_per_channel on publications (listing_id, channel_account_id)
  where status in ('pending','publishing','live');
create trigger publications_updated before update on publications for each row execute function set_updated_at();

-- ---------------------------------------------------------------- usage_daily
-- trial : compteur sur day = '1970-01-01' (quota « 1 au total »), fourni par le serveur
create table usage_daily (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  listings_count int not null default 0 check (listings_count >= 0),
  primary key (user_id, day)
);

-- Réserve 1 annonce de façon atomique. Retourne le jour réservé, ou null si le quota est atteint.
-- p_lifetime = true pour le plan trial (quota global, pas journalier).
create or replace function reserve_listing_quota(p_user uuid, p_limit int, p_lifetime boolean default false)
returns date language plpgsql security definer set search_path = public as $$
declare v_day date; v_tz text; v_ok int;
begin
  if p_limit < 1 then return null; end if;
  if p_lifetime then
    v_day := date '1970-01-01';
  else
    select timezone into v_tz from profiles where id = p_user;
    v_day := (now() at time zone coalesce(v_tz, 'Europe/Paris'))::date;
  end if;
  insert into usage_daily as u (user_id, day, listings_count) values (p_user, v_day, 1)
  on conflict (user_id, day) do update set listings_count = u.listings_count + 1
    where u.listings_count < p_limit
  returning 1 into v_ok;
  if v_ok is null then return null; end if;
  return v_day;
end $$;

create or replace function release_listing_quota(p_user uuid, p_day date)
returns void language sql security definer set search_path = public as $$
  update usage_daily set listings_count = greatest(listings_count - 1, 0)
  where user_id = p_user and day = p_day;
$$;

revoke execute on function reserve_listing_quota(uuid, int, boolean) from public, anon, authenticated;
revoke execute on function release_listing_quota(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------- RLS
alter table profiles        enable row level security;
alter table subscriptions   enable row level security;
alter table stripe_events   enable row level security;
alter table source_products enable row level security;
alter table source_files    enable row level security;
alter table listings        enable row level security;
alter table listing_images  enable row level security;
alter table usage_daily     enable row level security;
alter table pricing_settings enable row level security;
alter table channel_accounts enable row level security;
alter table publications     enable row level security;

create policy own_all  on pricing_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- jetons : jamais lisibles côté client ; une vue sans colonnes *_enc est exposée par l'API serveur
create policy own_read on publications for select using (user_id = auth.uid());

-- lecture seule pour le propriétaire
create policy own_read on profiles       for select using (id = auth.uid());
create policy own_read on subscriptions  for select using (user_id = auth.uid());
create policy own_read on usage_daily    for select using (user_id = auth.uid());
create policy own_read on listing_images for select using (user_id = auth.uid());
-- stripe_events : aucune policy => inaccessible côté client

-- contenu saisi par l'utilisateur
create policy own_all on source_products for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_all on source_files    for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- annonces : lecture + édition des champs texte ; création serveur uniquement (après réservation du quota)
create policy own_read   on listings for select using (user_id = auth.uid());
create policy own_update on listings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Colonnes modifiables par le client uniquement :
revoke update on listings from authenticated;
grant update (title, description, hashtags, suggested_price_cents, user_verified) on listings to authenticated;

-- Storage (à créer dans Supabase) : buckets privés 'sources' et 'visuals',
-- chemins '<user_id>/...' + policy sur storage.objects : (storage.foldername(name))[1] = auth.uid()::text
