-- VéloPronos : les points des maillots (score_ledger.stage_id + jersey, sans race_id) suivent eux
-- aussi le drapeau « hors classement » de leur course. À coller dans l'éditeur SQL de Supabase.
create or replace function score_ledger_set_counts_in_standings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.counts_in_standings := coalesce(
    (
      select s.counts_in_standings
        from races r join stages s on s.id = r.stage_id
       where r.id = coalesce(new.race_id, (select q.race_id from bonus_questions q where q.id = new.bonus_question_id))
    ),
    (select s.counts_in_standings from stages s where s.id = new.stage_id),
    true
  );
  return new;
end;
$$;

create or replace function stages_sync_counts_in_standings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.counts_in_standings is distinct from old.counts_in_standings then
    update score_ledger l
       set counts_in_standings = new.counts_in_standings
     where l.race_id in (select id from races where stage_id = new.id)
        or l.bonus_question_id in (
             select q.id from bonus_questions q join races r on r.id = q.race_id where r.stage_id = new.id
           )
        or (l.stage_id = new.id and l.jersey is not null);
  end if;
  return new;
end;
$$;
