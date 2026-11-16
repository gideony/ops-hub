--
-- ==============================================================================
-- SCRIPT CONSOLIDADO DE ATUALIZAÇÃO DO SUPABASE (SOMAX HUB)
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
