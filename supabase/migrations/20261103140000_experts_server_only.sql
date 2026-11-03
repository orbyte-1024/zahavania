drop policy if exists "experts_select_consented_authenticated" on public.experts;

revoke all on table public.experts from anon, authenticated;

comment on table public.experts is
  'Consented expert directory. Read only by the server with the service role, after a session and rate limits are checked; never readable directly by browser sessions.';
