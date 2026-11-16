-- Migration: 202611150002_fix_can_access_task_and_comments_rls.sql
-- Objetivo: Corrigir a função can_access_task e políticas RLS de task_comments, task_checklist e task_movements:
-- 1. Permitir acesso a administradores, membros da equipe, usuários com acesso ao quadro da tarefa,
--    criador, responsável e operadores vinculados à linhagem de encaminhamento da tarefa.
-- 2. Corrigir a política comments_insert para aceitar author_id automático via auth.uid() e administradores.
-- 3. Adicionar trigger de preenchimento automático de author_id caso seja omitido.

-- 1. Atualizar public.can_access_task com suporte a quadros, administradores e tarefas encaminhadas
create or replace function public.can_access_task(task_uuid uuid, uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when uid is null or task_uuid is null then false
    when public.is_admin(uid) then true
    else exists (
      select 1
        from public.tasks t
       where t.id = task_uuid
         and (
           -- 1. Membro da equipe da tarefa
           (t.team_id is not null and public.is_team_member(t.team_id, uid))
           -- 2. Acesso ao quadro da tarefa (custom, compartilhado ou canônico)
           or (t.board_id is not null and public.can_access_board(t.board_id, uid))
           -- 3. Criador ou responsável direto pela tarefa
           or (t.created_by = uid or t.assignee_id = uid)
           -- 4. Operador com acesso à ramificação gerada a partir desta tarefa
           or exists (
             select 1
               from public.tasks branch
              where branch.origin_task_id = t.id
                and (
                  (branch.team_id is not null and public.is_team_member(branch.team_id, uid))
                  or (branch.board_id is not null and public.can_access_board(branch.board_id, uid))
                )
           )
           -- 5. Operador com acesso à tarefa original de onde veio esta ramificação
           or (t.origin_task_id is not null and exists (
             select 1
               from public.tasks orig
              where orig.id = t.origin_task_id
                and (
                  (orig.team_id is not null and public.is_team_member(orig.team_id, uid))
                  or (orig.board_id is not null and public.can_access_board(orig.board_id, uid))
                )
           ))
           -- 6. Operador com acesso à mesma raiz de jornada (root_task_id)
           or (t.root_task_id is not null and exists (
             select 1
               from public.tasks chain
              where chain.root_task_id = t.root_task_id
                and chain.id <> t.id
                and (
                  (chain.team_id is not null and public.is_team_member(chain.team_id, uid))
                  or (chain.board_id is not null and public.can_access_board(chain.board_id, uid))
                )
           ))
         )
    )
  end;
$$;

revoke all on function public.can_access_task(uuid, uuid) from public;
grant execute on function public.can_access_task(uuid, uuid) to authenticated;

-- 2. Trigger para garantir preenchimento de author_id caso seja enviado nulo
create or replace function public.set_task_comment_author()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if NEW.author_id is null and auth.uid() is not null then
    NEW.author_id := auth.uid();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_set_task_comment_author on public.task_comments;
create trigger trg_set_task_comment_author
  before insert on public.task_comments
  for each row execute function public.set_task_comment_author();

-- 3. Atualizar políticas RLS de public.task_comments
drop policy if exists comments_read on public.task_comments;
create policy comments_read on public.task_comments
  for select to authenticated
  using (public.can_access_task(task_id, auth.uid()));

drop policy if exists comments_insert on public.task_comments;
create policy comments_insert on public.task_comments
  for insert to authenticated
  with check (
    public.can_access_task(task_id, auth.uid())
    and (author_id = auth.uid() or author_id is null or public.is_admin(auth.uid()))
  );

drop policy if exists comments_update on public.task_comments;
create policy comments_update on public.task_comments
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()))
  with check (author_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists comments_delete on public.task_comments;
create policy comments_delete on public.task_comments
  for delete to authenticated
  using (author_id = auth.uid() or public.is_admin(auth.uid()));
