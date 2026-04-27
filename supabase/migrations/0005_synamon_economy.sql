-- ─────────────────────────────────────────────────────────────────────────────
-- Synamon — economy (Synapse currency + pack inventory)
--
-- Adds the `unopened_pack_ids` and `synapse` columns to synamon_user_state,
-- plus the atomic `synamon_credit_synapse` RPC used by BlockOut's trickle
-- earner. Safe to re-run.
--
-- Daily cap enforcement stays client-side in v1; the RPC is intentionally
-- cap-agnostic so we can wrap server-side cap logic on top later without
-- breaking callers.
-- ─────────────────────────────────────────────────────────────────────────────

alter table synamon_user_state
  add column if not exists unopened_pack_ids text[] not null default '{}';

alter table synamon_user_state
  add column if not exists synapse integer not null default 0;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'synamon_user_state_synapse_nonneg'
  ) then
    alter table synamon_user_state
      add constraint synamon_user_state_synapse_nonneg check (synapse >= 0);
  end if;
end $$;

create or replace function synamon_credit_synapse(p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_new_total integer;
begin
  if v_uid is null then return 0; end if;
  if p_amount is null or p_amount <= 0 then
    select synapse into v_new_total from synamon_user_state where user_id = v_uid;
    return coalesce(v_new_total, 0);
  end if;

  insert into synamon_user_state (user_id, synapse) values (v_uid, p_amount)
    on conflict (user_id)
    do update set synapse = synamon_user_state.synapse + excluded.synapse,
                  updated_at = now()
    returning synapse into v_new_total;

  return v_new_total;
end $$;

grant execute on function synamon_credit_synapse(integer) to authenticated;
