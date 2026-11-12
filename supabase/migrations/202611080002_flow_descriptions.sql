alter table public.stage_transitions
  add column description text check (description is null or length(description) <= 500);

update public.stage_transitions transition
set description = 'Após a assinatura do contrato, iniciar o kick-off.'
from public.stages origin, public.stages target
where transition.from_stage_id = origin.id
  and transition.to_stage_id = target.id
  and origin.name = 'Contrato'
  and target.name = 'Kick-off';
