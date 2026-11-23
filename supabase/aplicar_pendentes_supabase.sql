--
-- ==============================================================================
-- SCRIPT CONSOLIDADO DE ATUALIZAÇÃO DO SUPABASE (OPSHUB)
-- ==============================================================================
-- Este script reúne todas as 5 migrations pendentes (de 14/11 a 16/11/2026).
-- Ele é totalmente IDEMPOTENTE (utiliza IF NOT EXISTS e CREATE OR REPLACE).
-- Pode ser colado e executado diretamente no SQL Editor do painel do Supabase.
-- ==============================================================================
--

-- >>> 1. PERMISSÕES DE QUADROS E FORWARDING (202611140001) <<<
-- Migration: 202611140001_board_permissions_forwarding_rls.sql
-- Objetivo: Garantir conformidade estrita de permissões e RLS:
-- 1. O usuário só pode encaminhar para quadros que enxerga e onde pode criar tarefas.
-- 2. Quadro privado de outra equipe nunca pode ser destino nem acessado.
-- 3. Funções com validação rigorosa de auth.uid(), search_path seguro e blindagem contra escalonamento.

-- 1. Função auxiliar: Verifica se o usuário tem permissão para criar ou encaminhar tarefas para um quadro
create or replace function public.can_create_task_in_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_user_id is null then false
    when p_board_id is null then true -- Quadro Geral / canônico
    else exists (
      select 1 from public.boards b
      where b.id = p_board_id
        and (
          public.is_admin(p_user_id)
          or b.is_shared
          or (b.team_id is not null and public.is_team_member(b.team_id, p_user_id))
          or (b.team_id is null and b.created_by = p_user_id)
        )
    )
  end;
$$;

revoke all on function public.can_create_task_in_board(uuid, uuid) from public;
grant execute on function public.can_create_task_in_board(uuid, uuid) to authenticated;

-- 2. Atualizar políticas de INSERT e UPDATE em public.tasks para blindar board_id
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated with check (
  (public.is_admin(auth.uid()) or public.is_team_member(team_id, auth.uid()))
  and created_by = auth.uid()
  and (board_id is null or public.can_create_task_in_board(board_id, auth.uid()))
  and (assignee_id is null or exists(select 1 from public.team_members m where m.team_id = tasks.team_id and m.user_id = tasks.assignee_id and m.active))
);

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated using (
  public.is_admin(auth.uid())
  or (board_id is null and public.is_team_member(team_id, auth.uid()))
  or (board_id is not null and public.can_access_board(board_id, auth.uid()))
) with check (
  (public.is_admin(auth.uid()) or public.is_team_member(team_id, auth.uid()))
  and (board_id is null or public.can_create_task_in_board(board_id, auth.uid()))
  and (assignee_id is null or exists(select 1 from public.team_members m where m.team_id = tasks.team_id and m.user_id = tasks.assignee_id and m.active))
);

-- 3. Atualizar create_task_with_templates com validação estrita de board_id
create or replace function public.create_task_with_templates(
  p_title text,
  p_description text,
  p_team_id uuid,
  p_assignee_id uuid,
  p_client_id uuid,
  p_stage_id uuid,
  p_priority public.task_priority,
  p_due_at date,
  p_tags text[],
  p_template_ids uuid[] default '{}',
  p_board_id uuid default null,
  p_sprint_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  created_id uuid;
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception 'Não autenticado'; end if;
  if not (public.is_admin(v_actor_id) or public.is_team_member(p_team_id, v_actor_id)) then
    raise exception 'Sem acesso à equipe da tarefa';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Informe o título'; end if;

  -- Validação estrita de quadro de destino: não permite criar em quadro privado de outra equipe
  if p_board_id is not null then
    if not public.can_create_task_in_board(p_board_id, v_actor_id) then
      raise exception 'Sem permissão: você não pode criar tarefas em um quadro privado de outra equipe';
    end if;
  end if;

  if p_assignee_id is not null and not exists (
    select 1 from public.team_members m join public.profiles p on p.id = m.user_id
    where m.team_id = p_team_id and m.user_id = p_assignee_id and m.active and p.active
  ) then raise exception 'Responsável fora da equipe'; end if;

  insert into public.tasks(title, description, team_id, assignee_id, client_id, stage_id, priority, due_at, tags, created_by, board_id, sprint_id)
    values (trim(p_title), coalesce(p_description,''), p_team_id, p_assignee_id, p_client_id, p_stage_id,
      coalesce(p_priority,'media'), p_due_at, coalesce(p_tags,'{}'), v_actor_id, p_board_id, p_sprint_id)
    returning id into created_id;

  if p_template_ids is not null and array_length(p_template_ids, 1) > 0 then
    insert into public.task_checklist(task_id, title, position, group_name)
      select created_id, item.title, 1000 + row_number() over (order by template.position, item.position, item.id), template.name
      from public.checklist_template_items item
      join public.checklist_template_groups template on template.id = item.group_id
      where item.group_id = any(coalesce(p_template_ids,'{}'))
        and not exists (select 1 from public.task_checklist existing where existing.task_id = created_id and existing.title = item.title);
  end if;

  return created_id;
end $$;

revoke all on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) from public;
grant execute on function public.create_task_with_templates(text,text,uuid,uuid,uuid,uuid,public.task_priority,date,text[],uuid[],uuid,uuid) to authenticated;

-- 4. Nova RPC atômica: Encaminhar tarefa para outro quadro com validação de permissões
create or replace function public.forward_task_to_board(
  p_task_id uuid,
  p_target_board_id uuid, -- se null, encaminha para o Quadro Geral
  p_target_stage_id uuid,
  p_target_team_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_task record;
  v_target_board record;
  v_from_stage_id uuid;
  v_resolved_team_id uuid;
  v_is_target_final boolean := false;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  -- 1. Obter tarefa e validar existência
  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Tarefa não encontrada';
  end if;

  -- 2. Validar permissão de alteração na tarefa de origem
  if not (
    public.is_admin(v_actor_id)
    or (v_task.board_id is null and public.is_team_member(v_task.team_id, v_actor_id))
    or (v_task.board_id is not null and public.can_access_board(v_task.board_id, v_actor_id))
  ) then
    raise exception 'Sem permissão para alterar esta tarefa';
  end if;

  -- 3. Validar se o usuário pode encaminhar para o quadro de destino
  if p_target_board_id is not null then
    select * into v_target_board from public.boards where id = p_target_board_id;
    if not found then
      raise exception 'Quadro de destino não encontrado';
    end if;

    -- Quadro privado de outra equipe nunca pode ser destino
    if not public.can_create_task_in_board(p_target_board_id, v_actor_id) then
      raise exception 'Sem permissão: você não pode encaminhar tarefas para um quadro privado de outra equipe';
    end if;

    -- Resolver equipe de destino
    if v_target_board.team_id is not null then
      v_resolved_team_id := v_target_board.team_id;
    else
      v_resolved_team_id := coalesce(p_target_team_id, v_task.team_id);
    end if;

    -- Validar etapa de destino
    if v_target_board.type = 'custom' then
      select is_final into v_is_target_final
        from public.board_stages
       where id = p_target_stage_id and board_id = p_target_board_id;
      if not found then
        raise exception 'A etapa selecionada não pertence ao quadro de destino';
      end if;
    else
      select is_final into v_is_target_final
        from public.stages
       where id = p_target_stage_id;
      if not found then
        raise exception 'Etapa inválida para o quadro de destino';
      end if;
    end if;
  else
    -- Destino: Quadro Geral / canônico
    v_resolved_team_id := coalesce(p_target_team_id, v_task.team_id);
    if not (public.is_admin(v_actor_id) or public.is_team_member(v_resolved_team_id, v_actor_id)) then
      raise exception 'Sem acesso à equipe de destino no Quadro Geral';
    end if;

    select is_final into v_is_target_final
      from public.stages
     where id = p_target_stage_id;
    if not found then
      raise exception 'Etapa inválida para o Quadro Geral';
    end if;
  end if;

  -- 4. Gravação de auditoria em task_movements
  v_from_stage_id := v_task.stage_id;
  insert into public.task_movements(task_id, from_stage_id, to_stage_id, moved_by, moved_at)
  values (p_task_id, v_from_stage_id, p_target_stage_id, v_actor_id, now());

  -- 5. Atualização atômica da tarefa
  update public.tasks
     set board_id = p_target_board_id,
         stage_id = p_target_stage_id,
         team_id = v_resolved_team_id,
         sprint_id = null, -- Reseta sprint se mudar de quadro
         completed_at = case when v_is_target_final then coalesce(completed_at, now()) else null end,
         updated_at = now()
   where id = p_task_id;

  return jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'board_id', p_target_board_id,
    'stage_id', p_target_stage_id,
    'team_id', v_resolved_team_id
  );
end $$;

revoke all on function public.forward_task_to_board(uuid, uuid, uuid, uuid) from public;
grant execute on function public.forward_task_to_board(uuid, uuid, uuid, uuid) to authenticated;


-- >>> 2. SNAPSHOTS TEXTUAIS EM TASK_MOVEMENTS (202611150001) <<<
-- Migration 202611150001_task_movements_snapshot_names.sql
-- Adiciona colunas de snapshot textual para etapas em task_movements, garantindo
-- que o histórico sobreviva a exclusões e resolva nomes de etapas em quadros personalizados.

alter table public.task_movements
  add column if not exists from_stage_name text,
  add column if not exists to_stage_name text;

-- Preenche retrospectivamente os nomes das etapas com base nas tabelas atuais
update public.task_movements m
set to_stage_name = coalesce(
  (select name from public.stages s where s.id = m.to_stage_id),
  (select name from public.board_stages bs where bs.id = m.to_stage_id),
  'Etapa inicial'
)
where m.to_stage_name is null;

update public.task_movements m
set from_stage_name = coalesce(
  (select name from public.stages s where s.id = m.from_stage_id),
  (select name from public.board_stages bs where bs.id = m.from_stage_id)
)
where m.from_stage_id is not null and m.from_stage_name is null;

-- Atualiza a trigger para gravar os nomes das etapas tanto de stages quanto de board_stages
create or replace function public.log_task_movement() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_from_name text;
  v_to_name text;
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    -- Resolve nome da etapa de origem
    if tg_op = 'UPDATE' and old.stage_id is not null then
      select name into v_from_name from public.stages where id = old.stage_id;
      if v_from_name is null then
        select name into v_from_name from public.board_stages where id = old.stage_id;
      end if;
    end if;

    -- Resolve nome da etapa de destino
    select name into v_to_name from public.stages where id = new.stage_id;
    if v_to_name is null then
      select name into v_to_name from public.board_stages where id = new.stage_id;
    end if;

    insert into public.task_movements(
      task_id,
      from_stage_id,
      to_stage_id,
      moved_by,
      from_stage_name,
      to_stage_name
    )
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.stage_id end,
      new.stage_id,
      coalesce(auth.uid(), new.created_by),
      v_from_name,
      v_to_name
    );

    -- Insere subtarefas automáticas se houver template de etapa correspondente
    insert into public.task_checklist(task_id, title, position, group_name)
      select new.id, template.title, template.position, stage.name
      from public.subtask_templates template
      join public.stages stage on stage.id = template.stage_id
      where template.stage_id = new.stage_id and not exists (
        select 1 from public.task_checklist item where item.task_id = new.id and item.title = template.title
      );
  end if;
  return new;
end;
$$;


-- >>> 3. CORREÇÃO DE ACESSO A TAREFAS E COMENTÁRIOS RLS (202611150002) <<<
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


-- >>> 4. RAMIFICAÇÃO, TRAVAMENTO E LINHA DO TEMPO (202611160001) <<<
-- Migration: 202611160001_consolidated_forwarding_and_lineage.sql
-- Objetivo: Garantir integridade de ponta a ponta para encaminhamento de tarefas com ramificação,
--           RLS permissiva para membros do quadro de destino, linha do tempo da jornada e blindagem
--           contra desaparecimento de tarefas ao editar em quadros de destino.

-- 1. Campos de ramificação na tabela public.tasks
alter table public.tasks
  add column if not exists origin_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists root_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists forwarded_at timestamptz default null,
  add column if not exists forwarded_by uuid references public.profiles(id) on delete set null;

-- Inicializar root_task_id para tarefas existentes que ainda não tenham
update public.tasks
   set root_task_id = id
 where root_task_id is null;

-- Índices para performance e integridade de linhagem
create unique index if not exists tasks_single_branch_idx
  on public.tasks (origin_task_id)
  where origin_task_id is not null;

create index if not exists tasks_root_task_idx
  on public.tasks (root_task_id);

create index if not exists tasks_origin_task_idx
  on public.tasks (origin_task_id);

-- 2. Configurações por quadro na tabela public.boards ("Ao concluir")
alter table public.boards
  add column if not exists on_completion_action text not null default 'ask'
    check (on_completion_action in ('ask', 'suggest_default', 'none')),
  add column if not exists default_forward_board_id uuid references public.boards(id) on delete set null,
  add column if not exists default_forward_stage_id uuid default null;

-- 3. Tabela de linha do tempo e eventos imutáveis da jornada
create table if not exists public.task_lineage_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  root_task_id uuid not null,
  board_id uuid references public.boards(id) on delete set null,
  board_name text not null,
  board_color text,
  stage_id uuid,
  stage_name text not null,
  event_type text not null check (event_type in ('created', 'moved', 'completed', 'forwarded')),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.task_lineage_events enable row level security;

create index if not exists task_lineage_events_root_idx
  on public.task_lineage_events (root_task_id, created_at asc);

create index if not exists task_lineage_events_task_idx
  on public.task_lineage_events (task_id, created_at asc);

drop policy if exists task_lineage_events_select on public.task_lineage_events;
create policy task_lineage_events_select on public.task_lineage_events
  for select to authenticated using (true);

drop policy if exists task_lineage_events_insert on public.task_lineage_events;
create policy task_lineage_events_insert on public.task_lineage_events
  for insert to authenticated with check (true);

-- 4. Trigger de integridade: Travamento no servidor da tarefa concluída que já foi encaminhada
create or replace function public.check_forwarded_task_immutable()
returns trigger language plpgsql as $$
begin
  if OLD.forwarded_at is not null then
    if NEW.stage_id <> OLD.stage_id then
      raise exception 'Esta tarefa já foi concluída e encaminhada para outro quadro e não pode ser reaberta ou movida.';
    end if;
    if NEW.completed_at is distinct from OLD.completed_at and NEW.completed_at is null then
      raise exception 'Esta tarefa já foi concluída e encaminhada e não pode ter seu status de conclusão removido.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_check_forwarded_task_immutable on public.tasks;
create trigger trg_check_forwarded_task_immutable
  before update on public.tasks
  for each row execute function public.check_forwarded_task_immutable();

-- 5. Atualizar políticas de INSERT e UPDATE em public.tasks
-- Garante que membros do quadro de destino possam atualizar a tarefa ramificada
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated using (
  public.is_admin(auth.uid())
  or (board_id is null and public.is_team_member(team_id, auth.uid()))
  or (board_id is not null and public.can_access_board(board_id, auth.uid()))
  or (origin_task_id is not null and (
    public.can_access_task(origin_task_id, auth.uid()) or
    (board_id is not null and public.can_access_board(board_id, auth.uid()))
  ))
) with check (
  (
    public.is_admin(auth.uid())
    or public.is_team_member(team_id, auth.uid())
    or (board_id is not null and public.can_access_board(board_id, auth.uid()))
  )
  and (board_id is null or public.can_create_task_in_board(board_id, auth.uid()))
);

-- 6. RPC Atômica para encaminhar tarefa concluída gerando ramificação vinculada
create or replace function public.forward_completed_task(
  p_task_id uuid,
  p_target_board_id uuid,
  p_target_stage_id uuid,
  p_target_team_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_orig public.tasks%rowtype;
  v_orig_board_name text := 'Quadro Geral';
  v_orig_board_color text := '#2563eb';
  v_orig_stage_name text := 'Concluído';
  v_orig_is_final boolean := false;
  v_target_board record;
  v_target_board_name text := 'Quadro Geral';
  v_target_board_color text := '#2563eb';
  v_target_stage_name text;
  v_target_is_final boolean := false;
  v_resolved_team_id uuid;
  v_resolved_assignee_id uuid := null;
  v_resolved_root_id uuid;
  v_new_task_id uuid;
  v_existing_branch public.tasks%rowtype;
  v_target_board_id_norm uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'Não autenticado';
  end if;

  select coalesce(full_name, 'Usuário') into v_actor_name
    from public.profiles where id = v_actor_id;

  select * into v_orig
    from public.tasks
   where id = p_task_id
     for update;

  if not found then
    raise exception 'Tarefa original não encontrada';
  end if;

  if v_orig.forwarded_at is not null then
    select * into v_existing_branch
      from public.tasks
     where origin_task_id = p_task_id
     limit 1;

    if found then
      return jsonb_build_object(
        'success', true,
        'already_forwarded', true,
        'branch_task_id', v_existing_branch.id,
        'origin_task_id', p_task_id,
        'target_board_id', v_existing_branch.board_id,
        'target_stage_id', v_existing_branch.stage_id,
        'message', 'Esta tarefa já foi encaminhada anteriormente.'
      );
    end if;
  end if;

  if v_orig.board_id is not null then
    select bs.name, bs.is_final into v_orig_stage_name, v_orig_is_final
      from public.board_stages bs
     where bs.id = v_orig.stage_id and bs.board_id = v_orig.board_id;
    if not found then
      select s.name, s.is_final into v_orig_stage_name, v_orig_is_final
        from public.stages s where s.id = v_orig.stage_id;
    end if;

    select b.name, b.color into v_orig_board_name, v_orig_board_color
      from public.boards b where b.id = v_orig.board_id;
  else
    select s.name, s.is_final into v_orig_stage_name, v_orig_is_final
      from public.stages s where s.id = v_orig.stage_id;
  end if;

  if not coalesce(v_orig_is_final, false) and v_orig.completed_at is null then
    raise exception 'Apenas tarefas na etapa final podem ser encaminhadas para outro quadro.';
  end if;

  if not (
    public.is_admin(v_actor_id)
    or (v_orig.board_id is null and public.is_team_member(v_orig.team_id, v_actor_id))
    or (v_orig.board_id is not null and public.can_access_board(v_orig.board_id, v_actor_id))
  ) then
    raise exception 'Sem permissão para encaminhar esta tarefa';
  end if;

  v_target_board_id_norm := p_target_board_id;
  if v_target_board_id_norm is not null then
    select * into v_target_board from public.boards where id = v_target_board_id_norm;
    if not found then
      raise exception 'Quadro de destino não encontrado';
    end if;

    v_target_board_name := v_target_board.name;
    v_target_board_color := coalesce(v_target_board.color, '#2563eb');

    if not public.can_create_task_in_board(v_target_board_id_norm, v_actor_id) then
      raise exception 'Sem permissão: você não pode encaminhar tarefas para um quadro privado de outra equipe';
    end if;

    if v_orig.board_id is not distinct from v_target_board_id_norm then
      raise exception 'A ramificação não pode ser criada no mesmo quadro de origem.';
    end if;

    v_resolved_root_id := coalesce(v_orig.root_task_id, v_orig.id);
    if exists (
      select 1 from public.task_lineage_events
       where root_task_id = v_resolved_root_id
         and board_id = v_target_board_id_norm
    ) or exists (
      select 1 from public.tasks
       where root_task_id = v_resolved_root_id
         and board_id = v_target_board_id_norm
    ) then
      raise exception 'Não é permitido encaminhar para um quadro que já faz parte da jornada desta tarefa (ciclo detectado).';
    end if;

    if v_target_board.team_id is not null then
      v_resolved_team_id := v_target_board.team_id;
    else
      v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    end if;

    if v_target_board.type = 'custom' then
      select bs.name, bs.is_final into v_target_stage_name, v_target_is_final
        from public.board_stages bs
       where bs.id = p_target_stage_id and bs.board_id = v_target_board_id_norm;
      if not found then
        raise exception 'A etapa selecionada não pertence ao quadro de destino';
      end if;
    else
      select s.name, s.is_final into v_target_stage_name, v_target_is_final
        from public.stages s where s.id = p_target_stage_id;
      if not found then
        raise exception 'Etapa inválida para o quadro de destino';
      end if;
    end if;
  else
    v_resolved_team_id := coalesce(p_target_team_id, v_orig.team_id);
    if not (public.is_admin(v_actor_id) or public.is_team_member(v_resolved_team_id, v_actor_id)) then
      raise exception 'Sem acesso à equipe de destino no Quadro Geral';
    end if;

    v_resolved_root_id := coalesce(v_orig.root_task_id, v_orig.id);
    if v_orig.board_id is null then
      raise exception 'A tarefa já pertence ao Quadro Geral e não pode ser ramificada para o mesmo quadro.';
    end if;

    select s.name, s.is_final into v_target_stage_name, v_target_is_final
      from public.stages s where s.id = p_target_stage_id;
    if not found then
      raise exception 'Etapa inválida para o Quadro Geral';
    end if;
  end if;

  if v_orig.assignee_id is not null then
    if exists (
      select 1 from public.team_members m
       where m.team_id = v_resolved_team_id
         and m.user_id = v_orig.assignee_id
         and m.active
    ) then
      v_resolved_assignee_id := v_orig.assignee_id;
    else
      v_resolved_assignee_id := null;
    end if;
  end if;

  insert into public.tasks (
    title,
    description,
    team_id,
    assignee_id,
    client_id,
    stage_id,
    priority,
    due_at,
    tags,
    created_by,
    board_id,
    sprint_id,
    origin_task_id,
    root_task_id,
    completed_at,
    created_at,
    updated_at
  ) values (
    v_orig.title,
    v_orig.description,
    v_resolved_team_id,
    v_resolved_assignee_id,
    v_orig.client_id,
    p_target_stage_id,
    v_orig.priority,
    null,
    coalesce(v_orig.tags, '{}'),
    v_actor_id,
    v_target_board_id_norm,
    null,
    p_task_id,
    v_resolved_root_id,
    null,
    now(),
    now()
  ) returning id into v_new_task_id;

  update public.tasks
     set forwarded_at = now(),
         forwarded_by = v_actor_id,
         completed_at = coalesce(completed_at, now()),
         root_task_id = v_resolved_root_id,
         updated_at = now()
   where id = p_task_id;

  insert into public.task_lineage_events (
    task_id,
    root_task_id,
    board_id,
    board_name,
    board_color,
    stage_id,
    stage_name,
    event_type,
    actor_id,
    actor_name,
    metadata,
    created_at
  ) values (
    p_task_id,
    v_resolved_root_id,
    v_orig.board_id,
    v_orig_board_name,
    v_orig_board_color,
    v_orig.stage_id,
    v_orig_stage_name,
    'forwarded',
    v_actor_id,
    v_actor_name,
    jsonb_build_object(
      'target_board_id', v_target_board_id_norm,
      'target_board_name', v_target_board_name,
      'target_task_id', v_new_task_id
    ),
    now()
  );

  insert into public.task_lineage_events (
    task_id,
    root_task_id,
    board_id,
    board_name,
    board_color,
    stage_id,
    stage_name,
    event_type,
    actor_id,
    actor_name,
    metadata,
    created_at
  ) values (
    v_new_task_id,
    v_resolved_root_id,
    v_target_board_id_norm,
    v_target_board_name,
    v_target_board_color,
    p_target_stage_id,
    v_target_stage_name,
    'created',
    v_actor_id,
    v_actor_name,
    jsonb_build_object(
      'origin_task_id', p_task_id,
      'from_board_name', v_orig_board_name
    ),
    now() + interval '1 millisecond'
  );

  return jsonb_build_object(
    'success', true,
    'branch_task_id', v_new_task_id,
    'origin_task_id', p_task_id,
    'target_board_id', v_target_board_id_norm,
    'target_stage_id', p_target_stage_id,
    'message', 'Tarefa encaminhada com sucesso gerando ramificação vinculada.'
  );
end;
$$;

revoke all on function public.forward_completed_task(uuid, uuid, uuid, uuid) from public;
grant execute on function public.forward_completed_task(uuid, uuid, uuid, uuid) to authenticated;

-- 7. RPC get_task_lineage para retornar eventos da linhagem
create or replace function public.get_task_lineage(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_root_id uuid;
  v_events jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  if not public.can_access_task(p_task_id, v_uid) then
    raise exception 'Sem permissão para visualizar a linha do tempo desta tarefa';
  end if;

  select coalesce(root_task_id, id) into v_root_id
    from public.tasks
   where id = p_task_id;

  if v_root_id is null then
    v_root_id := p_task_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'task_id', e.task_id,
    'root_task_id', e.root_task_id,
    'board_id', e.board_id,
    'board_name', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.board_name
      else 'Quadro restrito'
    end,
    'board_color', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.board_color
      else '#94a3b8'
    end,
    'stage_id', e.stage_id,
    'stage_name', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.stage_name
      else 'Etapa anterior confidencial'
    end,
    'event_type', e.event_type,
    'actor_id', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.actor_id
      else null
    end,
    'actor_name', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.actor_name
      else 'Operador anterior'
    end,
    'metadata', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then e.metadata
      else '{}'::jsonb
    end,
    'created_at', e.created_at,
    'is_masked', case
      when e.board_id is null or public.can_access_board(e.board_id, v_uid) or public.is_admin(v_uid)
      then false
      else true
    end
  ) order by e.created_at asc), '[]'::jsonb) into v_events
  from public.task_lineage_events e
  where e.root_task_id = v_root_id;

  return v_events;
end;
$$;

revoke all on function public.get_task_lineage(uuid) from public;
grant execute on function public.get_task_lineage(uuid) to authenticated;


-- ==============================================================================
-- MIGRATION: 202611190002_team_chat_management_and_mentions.sql
-- ==============================================================================
-- Migration: 202611190002_team_chat_management_and_mentions.sql
-- Objetivo:
-- 1. Canais: colunas description, archived_at, is_restricted.
-- 2. Proteção estrutural do canal "Geral" (não pode ser renomeado, arquivado nem excluído).
-- 3. Políticas de RLS de canais: criar/editar por gestor/admin, excluir apenas por admin.
-- 4. Tabela de auditoria para exclusão definitiva de canais (channel_deletion_audit).
-- 5. Mensagens: colunas edited_at, deleted_at, mentions e mentions_all.
-- 6. Trigger de integridade de mensagens: validação/sanitização de menções, LGPD no soft-delete, imutabilidade de campos protegidos.
-- 7. Políticas de RLS para atualização e moderação de mensagens (messages_update).
-- 8. RPC canônica unread_channel_metrics com contagem de não lidas e menções diretas não lidas (@n).

-- 1. Adicionar colunas na tabela public.channels
alter table public.channels
  add column if not exists description text check (description is null or length(description) <= 500),
  add column if not exists archived_at timestamptz default null,
  add column if not exists is_restricted boolean not null default false;

-- 2. Trigger para proteger o canal "Geral" contra alteração de nome, arquivamento ou exclusão
create or replace function public.guard_channel_geral()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if lower(old.name) = 'geral' and lower(new.name) <> 'geral' then
      raise exception 'O canal Geral é protegido e não pode ser renomeado.';
    end if;
    if lower(old.name) = 'geral' and new.archived_at is not null then
      raise exception 'O canal Geral é protegido e não pode ser arquivado.';
    end if;
  elsif tg_op = 'DELETE' then
    if lower(old.name) = 'geral' then
      raise exception 'O canal Geral é protegido e não pode ser excluído.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_channel_geral on public.channels;
create trigger trg_guard_channel_geral
  before update or delete on public.channels
  for each row execute function public.guard_channel_geral();

-- 3. Tabela de auditoria para exclusão de canais
create table if not exists public.channel_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null,
  channel_name text not null,
  team_id uuid not null,
  team_name text not null,
  deleted_by uuid not null references public.profiles(id),
  deleted_by_name text not null,
  messages_count integer not null default 0,
  attachments_count integer not null default 0,
  deleted_at timestamptz not null default now()
);

alter table public.channel_deletion_audit enable row level security;

drop policy if exists audit_admin_read on public.channel_deletion_audit;
create policy audit_admin_read on public.channel_deletion_audit
  for select to authenticated
  using (public.is_admin(auth.uid()));

-- 4. Atualizar políticas RLS em public.channels
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert to authenticated
  with check (
    (public.is_team_manager(team_id, auth.uid()) or public.is_admin(auth.uid()))
    and created_by = auth.uid()
    and lower(name) <> 'geral'
  );

drop policy if exists channels_update on public.channels;
create policy channels_update on public.channels for update to authenticated
  using (
    public.is_team_manager(team_id, auth.uid()) or public.is_admin(auth.uid())
  )
  with check (
    public.is_team_manager(team_id, auth.uid()) or public.is_admin(auth.uid())
  );

drop policy if exists channels_delete on public.channels;
create policy channels_delete on public.channels for delete to authenticated
  using (
    public.is_admin(auth.uid()) and lower(name) <> 'geral'
  );

-- 5. Adicionar colunas de ciclo de vida e marcações na tabela public.messages
alter table public.messages
  add column if not exists edited_at timestamptz default null,
  add column if not exists deleted_at timestamptz default null,
  add column if not exists mentions uuid[] not null default '{}',
  add column if not exists mentions_all boolean not null default false;

-- 6. Trigger para integridade, ciclo de vida e sanitização de menções em public.messages
create or replace function public.guard_message_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_team_id uuid;
  v_caller uuid := auth.uid();
  v_is_mgr boolean := false;
  v_is_adm boolean := false;
  v_sanitized_mentions uuid[] := '{}';
  v_mid uuid;
begin
  -- Identificar a equipe do canal
  select c.team_id into v_team_id
    from public.channels c
   where c.id = coalesce(new.channel_id, old.channel_id);

  if v_team_id is null then
    raise exception 'Canal associado inexistente.';
  end if;

  if tg_op = 'INSERT' then
    -- Sanitizar lista de menções para incluir unicamente membros ativos da equipe
    if new.mentions is not null and array_length(new.mentions, 1) > 0 then
      foreach v_mid in array new.mentions loop
        if exists (
          select 1 from public.team_members tm
           where tm.team_id = v_team_id
             and tm.user_id = v_mid
             and tm.active = true
        ) then
          if not (v_mid = any(v_sanitized_mentions)) then
            v_sanitized_mentions := array_append(v_sanitized_mentions, v_mid);
          end if;
        end if;
      end loop;
    end if;
    new.mentions := v_sanitized_mentions;
    return new;

  elsif tg_op = 'UPDATE' then
    -- Imutabilidade estrita dos campos estruturais
    new.author_id   := old.author_id;
    new.channel_id  := old.channel_id;
    new.created_at  := old.created_at;
    new.reply_to_id := old.reply_to_id;
    new.task_id     := old.task_id;

    v_is_adm := public.is_admin(v_caller);
    v_is_mgr := public.is_team_manager(v_team_id, v_caller);

    -- CASO 1: Exclusão lógica (Soft Delete / Moderação)
    if new.deleted_at is not null and old.deleted_at is null then
      if v_caller <> old.author_id and not v_is_mgr and not v_is_adm then
        raise exception 'Permissão negada para remover esta mensagem.';
      end if;
      -- LGPD: apagar conteúdo e marcações permanentemente
      new.body := '';
      new.mentions := '{}';
      new.mentions_all := false;
      new.edited_at := null;
      return new;
    end if;

    -- CASO 2: Tentativa de editar mensagem previamente removida
    if old.deleted_at is not null then
      raise exception 'Mensagens removidas não podem ser editadas.';
    end if;

    -- CASO 3: Edição de conteúdo da mensagem
    if v_caller <> old.author_id then
      raise exception 'Apenas o autor pode editar o texto da mensagem.';
    end if;

    -- Verificar se o canal está arquivado
    if exists (select 1 from public.channels c where c.id = old.channel_id and c.archived_at is not null) then
      raise exception 'Não é permitido editar mensagens em canais arquivados.';
    end if;

    -- Recalcular e sanitizar novas menções
    if new.mentions is not null and array_length(new.mentions, 1) > 0 then
      foreach v_mid in array new.mentions loop
        if exists (
          select 1 from public.team_members tm
           where tm.team_id = v_team_id
             and tm.user_id = v_mid
             and tm.active = true
        ) then
          if not (v_mid = any(v_sanitized_mentions)) then
            v_sanitized_mentions := array_append(v_sanitized_mentions, v_mid);
          end if;
        end if;
      end loop;
    end if;
    new.mentions := v_sanitized_mentions;
    new.edited_at := now();

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_message_lifecycle on public.messages;
create trigger trg_guard_message_lifecycle
  before insert or update on public.messages
  for each row execute function public.guard_message_lifecycle();

-- 7. Políticas de RLS para atualização de mensagens (messages_update)
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (
    public.can_access_channel(channel_id, auth.uid())
    and (
      author_id = auth.uid()
      or public.is_admin(auth.uid())
      or exists (
        select 1 from public.channels c
         where c.id = messages.channel_id
           and public.is_team_manager(c.team_id, auth.uid())
      )
    )
  )
  with check (
    public.can_access_channel(channel_id, auth.uid())
  );

-- 8. RPC canônica unread_channel_metrics (com unread_count e mention_count @n)
create or replace function public.unread_channel_metrics()
returns table(
  channel_id uuid,
  unread_count bigint,
  mention_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id as channel_id,
         count(m.id)::bigint as unread_count,
         count(m.id) filter (
           where m.author_id <> auth.uid()
             and (auth.uid() = any(m.mentions) or m.mentions_all is true)
         )::bigint as mention_count
  from public.channels c
  left join public.message_reads r
    on r.channel_id = c.id and r.user_id = auth.uid()
  left join public.messages m
    on m.channel_id = c.id
   and m.author_id <> auth.uid()
   and m.deleted_at is null
   and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by c.id;
$$;

revoke all on function public.unread_channel_metrics() from public;
grant execute on function public.unread_channel_metrics() to authenticated;

-- Atualizar unread_message_counts para ignorar mensagens com deleted_at is not null
create or replace function public.unread_message_counts()
returns table(channel_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id,
         count(m.id)::bigint
  from public.channels c
  left join public.message_reads r
    on r.channel_id = c.id and r.user_id = auth.uid()
  left join public.messages m
    on m.channel_id = c.id
   and m.author_id <> auth.uid()
   and m.deleted_at is null
   and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by c.id;
$$;

revoke all on function public.unread_message_counts() from public;
grant execute on function public.unread_message_counts() to authenticated;

-- ==============================================================================
-- 202611200001_delete_user_and_team_rpcs.sql
-- ==============================================================================
create or replace function public.delete_team(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_task_count integer;
  v_team_name text;
begin
  if auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception 'Sem permissão. Apenas administradores podem excluir equipes.';
  end if;

  select name into v_team_name from public.teams where id = p_team_id;
  if v_team_name is null then
    raise exception 'Equipe não encontrada.';
  end if;

  select count(*) into v_task_count from public.tasks where team_id = p_team_id;
  if v_task_count > 0 then
    raise exception 'Não é possível excluir a equipe "%" pois existem % tarefa(s) vinculada(s) a ela. Reatribua as tarefas antes de excluir.', v_team_name, v_task_count;
  end if;

  update public.client_registration_links set team_id = null where team_id = p_team_id;
  delete from public.channels where team_id = p_team_id;
  delete from public.boards where team_id = p_team_id and type = 'custom';
  delete from public.team_members where team_id = p_team_id;
  delete from public.teams where id = p_team_id;

  return jsonb_build_object('success', true, 'team_id', p_team_id);
end $$;

grant execute on function public.delete_team(uuid) to authenticated, service_role;

create or replace function public.delete_managed_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_is_master boolean;
  v_caller_role public.user_role;
  v_target_role public.user_role;
begin
  if auth.role() <> 'service_role' and not public.is_admin(auth.uid()) then
    raise exception 'Sem permissão. Apenas administradores podem excluir usuários.';
  end if;

  if auth.uid() = p_user_id then
    raise exception 'Você não pode excluir seu próprio usuário logado.';
  end if;

  select is_master, role into v_is_master, v_target_role from public.profiles where id = p_user_id;
  if v_is_master then
    raise exception 'Não é permitido excluir o administrador master da organização.';
  end if;

  if v_target_role = 'administrador' and auth.role() <> 'service_role' then
    if not public.is_master_admin(auth.uid()) then
      raise exception 'Apenas o Administrador Master pode excluir outro administrador.';
    end if;
  end if;

  delete from public.team_members where user_id = p_user_id;
  delete from public.message_reads where user_id = p_user_id;
  update public.tasks set assignee_id = null where assignee_id = p_user_id;

  begin
    delete from public.profiles where id = p_user_id;
    return jsonb_build_object('success', true, 'mode', 'hard_delete');
  exception when foreign_key_violation then
    update public.profiles
    set active = false,
        full_name = full_name || ' (Excluído)',
        email = null,
        whatsapp = null
    where id = p_user_id;
    return jsonb_build_object('success', true, 'mode', 'soft_delete_anonymized');
  end;
end $$;

grant execute on function public.delete_managed_user(uuid) to authenticated, service_role;


-- >>> 10. RPC PARA EXCLUSÃO DEFINITIVA DE CANAIS DE CHAT (202611200002) <<<
-- Migration: 202611200002_delete_channel_atomic_rpc.sql
-- Objetivo: Permitir exclusão de canais do chat diretamente via banco sem dependência de Edge Functions.
create or replace function public.delete_channel_atomic(
  p_channel_id uuid,
  p_confirmation_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_caller_profile record;
  v_channel record;
  v_msg_count integer := 0;
  v_att_count integer := 0;
  v_team_name text := 'Equipe';
begin
  -- 1. Validar autenticação
  if v_caller is null and auth.role() <> 'service_role' then
    raise exception 'Não autenticado.';
  end if;

  -- 2. Validar que o chamador é administrador ativo
  if auth.role() <> 'service_role' then
    select id, full_name, role, active into v_caller_profile
      from public.profiles
     where id = v_caller;

    if v_caller_profile.id is null or not coalesce(v_caller_profile.active, false) then
      raise exception 'Acesso negado: perfil inativo ou inexistente.';
    end if;

    if v_caller_profile.role <> 'administrador' and not public.is_admin(v_caller) then
      raise exception 'Apenas administradores podem excluir canais definitivamente.';
    end if;
  end if;

  -- 3. Buscar canal e equipe
  select c.id, c.name, c.team_id, t.name as team_name
    into v_channel
    from public.channels c
    left join public.teams t on t.id = c.team_id
   where c.id = p_channel_id;

  if v_channel.id is null then
    raise exception 'Canal não encontrado.';
  end if;

  -- 4. Validar proteção do canal "Geral"
  if lower(trim(v_channel.name)) = 'geral' then
    raise exception 'O canal Geral é protegido e não pode ser excluído.';
  end if;

  -- 5. Validar nome de confirmação
  if lower(trim(v_channel.name)) <> lower(trim(coalesce(p_confirmation_name, ''))) then
    raise exception 'O nome de confirmação digitado não confere com o nome do canal.';
  end if;

  if v_channel.team_name is not null then
    v_team_name := v_channel.team_name;
  end if;

  -- 6. Contabilizar mensagens e anexos para auditoria
  select count(*) into v_msg_count
    from public.messages
   where channel_id = p_channel_id;

  select count(*) into v_att_count
    from public.attachments a
    join public.messages m on m.id = a.message_id
   where m.channel_id = p_channel_id;

  -- 7. Registrar auditoria se a tabela existir
  begin
    insert into public.channel_deletion_audit (
      channel_id,
      channel_name,
      team_id,
      team_name,
      deleted_by,
      deleted_by_name,
      messages_count,
      attachments_count,
      deleted_at
    ) values (
      v_channel.id,
      v_channel.name,
      v_channel.team_id,
      v_team_name,
      coalesce(v_caller, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(v_caller_profile.full_name, 'Administrador'),
      v_msg_count,
      v_att_count,
      now()
    );
  exception when others then
    -- Não aborta a exclusão caso a tabela de auditoria não esteja pronta
    null;
  end;

  -- 8. Excluir o canal (cascateia para messages, attachments, message_reads)
  delete from public.channels
   where id = p_channel_id;

  return jsonb_build_object(
    'success', true,
    'channel_id', p_channel_id,
    'channel_name', v_channel.name,
    'messages_purged', v_msg_count,
    'attachments_purged', v_att_count
  );
end;
$$;

grant execute on function public.delete_channel_atomic(uuid, text) to authenticated, service_role;

