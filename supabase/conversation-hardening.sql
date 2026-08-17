-- Live conversation privacy hardening for Held.
-- Applied to Supabase project lgxnmbzgnvbrycorkibu on 2026-08-17.
-- Keep this file aligned with the deployed database objects.

create or replace function public.enforce_conversation_moment_integrity()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if current_user in ('service_role','postgres') then return coalesce(new,old); end if;
  if tg_op='INSERT' then
    if new.kind='conversation_invite' then raise exception 'Conversation invitations can only be created by Held'; end if;
    if new.kind='conversation_answer' and new.is_shared then raise exception 'Conversation answers must begin private'; end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    if old.kind='conversation_invite' or new.kind='conversation_invite' then raise exception 'Conversation invitations can only be changed by Held'; end if;
    if old.kind='conversation_answer' then
      if old.is_shared then raise exception 'Revealed conversation answers cannot be edited'; end if;
      if new.is_shared or new.kind<>old.kind or new.user_id<>old.user_id or new.couple_id<>old.couple_id
         or coalesce(new.details->>'round_id','')<>coalesce(old.details->>'round_id','')
      then raise exception 'Conversation answers can only be revealed by Held'; end if;
    elsif new.kind='conversation_answer' then raise exception 'Create a new private conversation answer instead';
    end if;
    return new;
  end if;
  if tg_op='DELETE' and (old.kind='conversation_invite' or (old.kind='conversation_answer' and old.is_shared))
  then raise exception 'Revealed conversation records cannot be deleted'; end if;
  return old;
end;
$$;

drop trigger if exists enforce_conversation_moment_integrity_trigger on public.couple_moments;
create trigger enforce_conversation_moment_integrity_trigger before insert or update or delete on public.couple_moments
for each row execute function public.enforce_conversation_moment_integrity();

create or replace function public.process_conversation_response(p_user_id uuid,p_round_id text)
returns table(recipient_id uuid,revealed boolean,item_id text)
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_couple_id uuid; v_recipient_id uuid; v_member_count integer; v_answer_count integer; v_revealed boolean:=false;
begin
  if current_user <> 'service_role' then raise exception 'This operation is only available to Held'; end if;
  perform pg_advisory_xact_lock(hashtextextended('held-conversation:'||p_user_id::text||':'||p_round_id,0));
  select answer.couple_id into v_couple_id from public.couple_moments answer
  join public.couple_members member on member.couple_id=answer.couple_id and member.user_id=answer.user_id
  where answer.user_id=p_user_id and answer.kind='conversation_answer' and answer.details->>'round_id'=p_round_id
  order by answer.created_at limit 1;
  if v_couple_id is null then raise exception 'Your private answer was not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('held-conversation:'||v_couple_id::text||':'||p_round_id,0));
  select count(*)::integer into v_member_count from public.couple_members where couple_id=v_couple_id;
  if v_member_count<>2 then raise exception 'Conversation mode requires exactly two linked spouses'; end if;
  select user_id into v_recipient_id from public.couple_members where couple_id=v_couple_id and user_id<>p_user_id limit 1;
  select count(distinct answer.user_id)::integer into v_answer_count from public.couple_moments answer
  join public.couple_members member on member.couple_id=answer.couple_id and member.user_id=answer.user_id
  where answer.couple_id=v_couple_id and answer.kind='conversation_answer' and answer.details->>'round_id'=p_round_id;
  if v_answer_count=2 then
    update public.couple_moments answer set is_shared=true,updated_at=now()
    where answer.couple_id=v_couple_id and answer.kind='conversation_answer' and answer.details->>'round_id'=p_round_id
    and exists(select 1 from public.couple_members member where member.couple_id=v_couple_id and member.user_id=answer.user_id);
    delete from public.couple_moments where couple_id=v_couple_id and kind='conversation_invite' and details->>'round_id'=p_round_id;
    v_revealed:=true;
  else
    insert into public.couple_moments(couple_id,user_id,kind,body,details,is_shared)
    values(v_couple_id,p_user_id,'conversation_invite','Your spouse answered privately. Respond to reveal both answers.',
    jsonb_build_object('round_id',p_round_id,'prompt','Where did you feel most loved by me this week?','unlocked',false),true)
    on conflict do nothing;
  end if;
  return query select v_recipient_id,v_revealed,'conversation-'||p_round_id;
end;
$$;

revoke all on function public.process_conversation_response(uuid,text) from public,anon,authenticated;
grant execute on function public.process_conversation_response(uuid,text) to service_role;
revoke all on function public.enforce_conversation_moment_integrity() from public,anon,authenticated;
