create table public.rate_limit_counters (
  key_hash text not null check (char_length(key_hash) = 64),
  window_start timestamptz not null,
  window_seconds integer not null check (window_seconds > 0),
  hits integer not null default 0,
  primary key (key_hash, window_start)
);

alter table public.rate_limit_counters enable row level security;

revoke all on public.rate_limit_counters from anon, authenticated;

create or replace function public.consume_rate_limit(p_key_hash text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, hits integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_limit < 1 or p_window_seconds < 1 or char_length(p_key_hash) <> 64 then
    raise exception 'invalid rate limit arguments';
  end if;

  insert into public.rate_limit_counters as c (key_hash, window_start, window_seconds, hits)
  values (p_key_hash, v_window_start, p_window_seconds, 1)
  on conflict (key_hash, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;

  if random() < 0.01 then
    delete from public.rate_limit_counters
    where window_start + make_interval(secs => window_seconds) < now() - interval '1 hour';
  end if;

  return query select
    v_hits <= p_limit,
    v_hits,
    greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - now())))::integer);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
