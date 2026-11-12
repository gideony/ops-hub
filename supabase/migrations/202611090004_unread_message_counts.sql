-- Uma única chamada para os badges do chat, respeitando as políticas RLS do usuário autenticado.
create function public.unread_message_counts()
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
   and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by c.id
$$;

revoke all on function public.unread_message_counts() from public;
grant execute on function public.unread_message_counts() to authenticated;
