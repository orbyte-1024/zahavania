create table public.experts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  title text,
  organization text,
  org_type text check (
    org_type in (
      'public_institution',
      'ngo',
      'academic',
      'private',
      'association',
      'independent',
      'media'
    )
  ),
  domains text[] not null check (cardinality(domains) > 0),
  languages text[] not null check (
    cardinality(languages) > 0
    and languages <@ array['mg', 'fr', 'en']::text[]
  ),
  regions text[] not null default '{}',
  bio text check (bio is null or char_length(bio) <= 300),
  contact_email text,
  contact_phone text,
  consent_status text not null check (
    consent_status in ('granted', 'public_info', 'pending', 'revoked')
  ),
  consent_date date,
  info_source text,
  last_verified_at date not null,
  is_fictional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index experts_domains_gin_idx on public.experts using gin (domains);
create index experts_languages_gin_idx on public.experts using gin (languages);
create index experts_regions_gin_idx on public.experts using gin (regions);

create or replace function public.set_experts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists experts_set_updated_at on public.experts;

create trigger experts_set_updated_at
before update on public.experts
for each row
execute function public.set_experts_updated_at();

alter table public.experts enable row level security;

create policy "experts_select_consented_authenticated"
on public.experts
for select
to authenticated
using (consent_status in ('granted', 'public_info'));

revoke all on table public.experts from anon, authenticated;
grant select on table public.experts to authenticated;

comment on table public.experts is
  'Consented expert directory. Row-level security only exposes granted and public_info profiles to authenticated users.';
