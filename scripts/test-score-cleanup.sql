-- Reversible integration test. All fixture users, attempts and mutations are
-- inside this transaction and rolled back. No existing score IDs are deleted.
begin;
do $$
declare
  qa_a uuid := gen_random_uuid(); qa_b uuid := gen_random_uuid();
  qa_first uuid := gen_random_uuid(); qa_keep uuid := gen_random_uuid();
  qa_other uuid := gen_random_uuid(); qa_client uuid := gen_random_uuid();
  qa_keep_client uuid := gen_random_uuid(); qa_other_client uuid := gen_random_uuid();
  qa_tag text := 'quiz-cleanup-qa-' || gen_random_uuid()::text;
  admin_id uuid; admin_email text; affected integer; found integer;
begin
  select users.id, users.email into admin_id, admin_email
  from auth.users as users join public.admin_allowlist as admins on admins.email = lower(users.email)
  limit 1;
  if admin_id is null then raise exception 'An existing administrator is required for the role test'; end if;
  insert into auth.users (id, email) values (qa_a, qa_tag || '-a@example.invalid'), (qa_b, qa_tag || '-b@example.invalid');
  insert into public.quiz_attempts (id, user_id, client_attempt_id, quiz_id, score, total, duration_seconds, completed_at)
  values (qa_first, qa_a, qa_client, 'vocabulary-daily-v1', 5, 10, 0, '2000-01-01T00:00:00Z'),
    (qa_keep, qa_a, qa_keep_client, 'vocabulary-daily-v1', 7, 10, null, '2001-01-01T00:00:00Z'),
    (qa_other, qa_b, qa_other_client, 'physics-daily-practice-v1', 8, 10, 45, '2002-01-01T00:00:00Z');
  insert into public.activity_state (user_id, activity_id, state) values
  (qa_a, 'vocabulary-daily-v1', jsonb_build_object('progress', jsonb_build_object('word', 3), 'logs', jsonb_build_array(jsonb_build_object('clientAttemptId', qa_client::text), jsonb_build_object('clientAttemptId', qa_keep_client::text))));

  perform set_config('request.jwt.claims', jsonb_build_object('sub', qa_a, 'email', qa_tag || '-a@example.invalid', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into found from public.quiz_attempts where id = qa_other;
  if found <> 0 then raise exception 'Student can read another student score'; end if;
  delete from public.quiz_attempts where id = qa_other;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Student can delete another student score'; end if;
  begin
    perform public.admin_delete_quiz_attempts(array[qa_other]);
    raise exception 'Student admin-delete call was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list_quiz_attempts_v2();
    raise exception 'Student admin-list call was accepted';
  exception when insufficient_privilege then null;
  end;
  delete from public.quiz_attempts where id = qa_first;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own selected score was not deleted'; end if;
  select count(*) into found from public.quiz_attempt_deletions where user_id = qa_a and client_attempt_id = qa_client;
  if found <> 1 then raise exception 'Missing replay protection marker'; end if;
  if (select state -> 'progress' ->> 'word' from public.activity_state where user_id = qa_a) <> '3' then raise exception 'Mastery state was changed'; end if;
  if (select jsonb_array_length(state -> 'logs') from public.activity_state where user_id = qa_a) <> 1 then raise exception 'Deleted vocabulary score remains in cloud log'; end if;
  insert into public.quiz_attempts (user_id, client_attempt_id, quiz_id, score, total)
  values (qa_a, qa_client, 'vocabulary-daily-v1', 5, 10);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Offline sync recreated a deleted score'; end if;
  update public.activity_state set state = jsonb_build_object('progress', jsonb_build_object('word', 9), 'logs', jsonb_build_array(jsonb_build_object('clientAttemptId', qa_client::text), jsonb_build_object('clientAttemptId', qa_keep_client::text))) where user_id = qa_a;
  if (select jsonb_array_length(state -> 'logs') from public.activity_state where user_id = qa_a) <> 1 then raise exception 'Stale activity sync recreated deleted log'; end if;
  if (select state -> 'progress' ->> 'word' from public.activity_state where user_id = qa_a) <> '9' then raise exception 'Log filtering changed mastery update'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', qa_b, 'email', qa_tag || '-b@example.invalid', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into found from public.quiz_attempt_deletions where user_id = qa_a;
  if found <> 0 then raise exception 'Another student can read deletion markers'; end if;
  begin
    insert into public.quiz_attempt_deletions values (qa_a, gen_random_uuid());
    raise exception 'Another student can create deletion markers';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{}'::text, true);
  execute 'set local role anon';
  begin
    perform public.admin_delete_quiz_attempts(array[qa_other]);
    raise exception 'Anonymous admin-delete call was accepted';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'email', admin_email, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into found from public.admin_list_quiz_attempts_v2(101, 0, null, qa_tag, null);
  if found <> 2 then raise exception 'Admin cross-student reporting failed'; end if;
  select count(*) into found from public.admin_list_quiz_attempts_v2(101, 0, '2002-01-01T00:00:00Z', qa_tag, 'vocabulary-daily-v1');
  if found <> 1 then raise exception 'Date/student/quiz filters failed'; end if;
  begin
    perform public.admin_delete_quiz_attempts(array[]::uuid[]);
    raise exception 'Empty admin selection was accepted';
  exception when invalid_parameter_value then null;
  end;
  affected := public.admin_delete_quiz_attempts(array[qa_keep, qa_other]);
  if affected <> 2 then raise exception 'Selected cross-student deletion failed'; end if;
  if public.admin_delete_quiz_attempts(array[qa_keep]) <> 0 then raise exception 'Idempotent deletion failed'; end if;
  execute 'reset role';

  insert into public.quiz_attempts (user_id, quiz_id, score, total) values (qa_a, 'cascade-test', 1, 1);
  delete from auth.users where id in (qa_a, qa_b);
  if exists(select 1 from public.quiz_attempt_deletions where user_id in (qa_a, qa_b)) then raise exception 'Account cascade left replay markers'; end if;
end;
$$;
rollback;
select 'PASS: student isolation, selected deletion, admin-only bulk deletion and filters, zero-duration fixture, offline replay protection, preserved mastery, and account cascades. All test data rolled back.' as verification;
