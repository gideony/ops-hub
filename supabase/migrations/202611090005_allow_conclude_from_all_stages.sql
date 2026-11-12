-- Permite que tarefas em qualquer etapa possam transicionar diretamente para a etapa final (Concluído)
insert into public.stage_transitions (from_stage_id, to_stage_id)
select s.id, f.id
from public.stages s, public.stages f
where f.is_final = true and s.id != f.id
on conflict (from_stage_id, to_stage_id) do nothing;
