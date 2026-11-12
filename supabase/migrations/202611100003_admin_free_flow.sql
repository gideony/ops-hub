-- Permite que administradores movam tarefas livremente para qualquer etapa (Fluxo Livre),
-- enquanto colaboradores e gestores continuam restritos às transições permitidas (Fluxo Guiado).

create or replace function public.on_task_write() returns trigger language plpgsql security definer set search_path = '' as $$
declare target_final boolean; allowed boolean;
begin
  select is_final into target_final from public.stages where id = new.stage_id;
  if target_final is null then raise exception 'Etapa inválida'; end if;
  if tg_op = 'INSERT' then
    new.completed_at := case when target_final then now() else null end;
    new.updated_at := now();
  else
    if new.created_by is distinct from old.created_by then raise exception 'Criador não pode ser alterado'; end if;
    if new.stage_id is distinct from old.stage_id then
      -- Se não for administrador, exige que a transição esteja explicitamente cadastrada
      if not public.is_admin(auth.uid()) then
        select exists(
          select 1 from public.stage_transitions
          where from_stage_id = old.stage_id and to_stage_id = new.stage_id
        ) into allowed;
        if not allowed then
          raise exception 'Transição não permitida: siga o fluxo guiado da equipe';
        end if;
      end if;
      new.completed_at := case when target_final then now() else null end;
    else
      new.completed_at := old.completed_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
