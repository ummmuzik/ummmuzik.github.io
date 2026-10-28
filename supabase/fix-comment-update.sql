-- 댓글 수정이 "내가 쓴 댓글만 고칠 수 있습니다" 로 막힐 때
--
-- 댓글 기능을 먼저 올리고 수정·삭제 메뉴를 나중에 붙였기 때문에,
-- 그 사이에 schema.sql 을 실행한 프로젝트에는 update 정책이 없습니다.
-- (정책이 없으면 RLS 가 0 건만 고치고 끝나서 위 문구가 뜹니다)
--
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- schema.sql 전체를 다시 실행해도 결과는 같습니다.

drop policy if exists "comments: own update" on public.comments;
create policy "comments: own update"
  on public.comments for update to authenticated
  using (author = auth.uid())
  with check (author = auth.uid());

-- 제대로 들어갔는지 확인 (update 한 줄이 보여야 합니다)
select cmd, policyname from pg_policies
 where schemaname = 'public' and tablename = 'comments'
 order by cmd;
