-- Create table for provider holiday closures
create table if not exists provider_holidays (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  holiday_key text not null,
  created_at timestamp with time zone default now(),

  unique (provider_id, holiday_key)
);

-- Optional index for faster lookups
create index if not exists idx_provider_holidays_provider_id
  on provider_holidays(provider_id);
