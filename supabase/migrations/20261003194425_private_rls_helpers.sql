-- RLS ownership helpers live in a schema PostgREST does not expose, so they are not callable as
-- /rest/v1/rpc/* (advisor 0029). Policies reference functions by OID, so moving them keeps every
-- policy working; signed-in users still need USAGE + EXECUTE for policy (and Realtime) evaluation.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.owns_importer(uuid) set schema private;
alter function public.owns_container(uuid) set schema private;
alter function public.owns_quote_request(uuid) set schema private;
alter function public.owns_call(uuid) set schema private;
