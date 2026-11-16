-- Migration 202611130001_tasks_client_id_on_delete_set_null.sql
-- Permite a exclusão de clientes sem violar a integridade referencial,
-- desvinculando automaticamente tarefas existentes (client_id = null)
-- e assegurando política explícita de DELETE na tabela public.clients.

-- 1. Atualização da foreign key de tarefas para ON DELETE SET NULL
alter table public.tasks
  drop constraint if exists tasks_client_id_fkey,
  add constraint tasks_client_id_fkey
    foreign key (client_id)
    references public.clients(id)
    on delete set null;

-- 2. Política explícita de DELETE para administradores na tabela clients (idempotente)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'clients'
      and policyname = 'clients_delete'
  ) then
    create policy clients_delete on public.clients
      for delete
      to authenticated
      using (public.is_admin(auth.uid()));
  end if;
end $$;
