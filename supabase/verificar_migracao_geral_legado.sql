-- ==============================================================================
-- Script de Verificação: Migração de Tarefas para "Geral (legado)"
-- ==============================================================================
-- Execute no SQL Editor do Supabase antes e depois de rodar a migration
-- para conferir as contagens e garantir que nada foi perdido.
-- ==============================================================================

-- 1. Tarefas sem quadro real (deve ser ZERO após a migração)
select
  count(*) as tarefas_orfas_ou_no_geral_canonico,
  case
    when count(*) = 0 then 'OK: Nenhuma tarefa sem quadro'
    else 'ALERTA: Existem tarefas pendentes de migração'
  end as status_verificacao
from public.tasks t
where t.board_id is null
   or t.board_id in (select id from public.boards where type = 'general');

-- 2. Informações do quadro corporativo "Geral (legado)"
select
  b.id as board_id,
  b.name,
  b.type,
  b.is_shared,
  b.is_active,
  (select count(*) from public.board_stages bs where bs.board_id = b.id) as total_etapas_criadas,
  (select count(*) from public.tasks t where t.board_id = b.id) as total_tarefas_abrigadas
from public.boards b
where b.name = 'Geral (legado)';

-- 3. Distribuição de tarefas no quadro "Geral (legado)" por etapa e situação
select
  bs.position as ordem,
  bs.name as etapa,
  bs.is_final as etapa_conclusao,
  count(t.id) as total_tarefas,
  count(case when t.completed_at is not null then 1 end) as tarefas_concluidas,
  count(case when t.completed_at is null then 1 end) as tarefas_em_andamento
from public.board_stages bs
join public.boards b on b.id = bs.board_id and b.name = 'Geral (legado)'
left join public.tasks t on t.stage_id = bs.id and t.board_id = b.id
group by bs.position, bs.name, bs.is_final
order by bs.position asc;

-- 4. Status das visões de setor e do antigo quadro Geral (devem estar com is_active = false)
select
  id,
  name,
  type,
  is_active,
  created_at
from public.boards
where type in ('general', 'sector_view')
order by created_at asc;
