-- Migration: Inserir novas tags do sistema
-- Tags solicitadas: Atualizar versão do APP, Concluido, Faturado, Google, Higor, Integrado, Nova Integração, Novo Cliente, Personalizado, Urgente

insert into public.tags (name, color)
select v.name, v.color
from (values
  ('Atualizar versão do APP', '#6366f1'),
  ('Concluido', '#10b981'),
  ('Faturado', '#059669'),
  ('Google', '#ea4335'),
  ('Higor', '#3b82f6'),
  ('Integrado', '#06b6d4'),
  ('Nova Integração', '#8b5cf6'),
  ('Novo Cliente', '#f59e0b'),
  ('Personalizado', '#ec4899'),
  ('Urgente', '#ef4444')
) as v(name, color)
where not exists (
  select 1 from public.tags t where lower(t.name) = lower(v.name)
);
