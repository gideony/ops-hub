-- Migration: 202611100001_tasks_delete_policy.sql
-- Permite que administradores, gestores da equipe e o próprio criador da tarefa possam excluí-la.

drop policy if exists tasks_delete on public.tasks;

create policy tasks_delete on public.tasks for delete to authenticated using (
  public.is_team_manager(team_id, auth.uid()) or created_by = auth.uid()
);
