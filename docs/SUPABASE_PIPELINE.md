# Supabase 리포트 저장 파이프라인

Codex 자동화가 생성한 JSON 리포트를 Supabase `reports` 테이블에 저장하는 최소 구조다.

## 1. 테이블 생성

Supabase SQL Editor에서 아래 파일 내용을 실행한다.

- `supabase/migrations/001_create_reports.sql`

핵심 테이블은 아래와 같다.

```sql
create table if not exists reports (
  id text primary key,
  date date not null,
  type text not null,
  published_at timestamptz not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_date_idx on reports (date desc);
create index if not exists reports_type_idx on reports (type);
```

## 2. 환경변수 또는 .env 파일

로컬 자동화 또는 로컬 서버에만 아래 값을 둔다. 앱 번들에는 절대 넣지 않는다.

`.env.example`을 참고해 `.env.local`을 만든다. Codex가 새 worktree에서 실행되더라도, 퍼블리시 스크립트는 현재 worktree와 git 공용 루트 둘 다에서 `.env.local`을 찾는다.

```bash
cp .env.example .env.local
```

`.env.local`:

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

`SUPABASE_SERVICE_ROLE_KEY`는 자동화 업로드용이다. 앱에는 넣지 않는다.

`SUPABASE_ANON_KEY`는 앱의 공개 읽기용 키다. 앱에서 직접 읽을 수 있도록 아래 명령이 `.env.local` 값을 `src/config/supabase.generated.ts`로 생성한다. 생성 파일은 gitignore에 들어가므로 커밋하지 않는다.

```bash
npm run generate:supabase-config
```

환경변수로 직접 넣어도 된다.

```bash
SUPABASE_URL="https://YOUR_PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
npm run publish:report -- data/report.sample.json
```

## 3. 리포트 발행

```bash
node scripts/publish-report-to-supabase.mjs data/report.sample.json
```

실제 자동화에서는 `data/report.sample.json` 대신 Codex가 생성한 JSON 파일 경로를 넘긴다.

Codex 자동화 프롬프트는 `docs/CODEX_AUTOMATION_PROMPT.md`를 기준으로 한다. 자동화는 리포트 JSON을 `data/latest-report.json`에 저장한 뒤 아래 명령어까지 실행한다.

```bash
npm run publish:report -- data/latest-report.json
```

키 없이 저장 형태만 확인하려면 dry run을 사용한다.

```bash
node scripts/publish-report-to-supabase.mjs data/report.sample.json --dry-run
```

다른 env 파일을 쓰려면:

```bash
node scripts/publish-report-to-supabase.mjs data/report.sample.json --env .env.production
```

## 4. 저장 방식

스크립트는 Supabase REST API를 호출해 아래 형태로 upsert한다.

```json
{
  "id": "2026-05-11-daily-pre-market",
  "date": "2026-05-11",
  "type": "daily_pre_market",
  "published_at": "2026-05-11T08:40:00+09:00",
  "payload": {}
}
```

`id`가 같으면 기존 행을 덮어쓴다.

## 5. 보안 원칙

- `SUPABASE_SERVICE_ROLE_KEY`는 로컬 자동화 또는 로컬 서버에서만 사용한다.
- React Native 앱에는 service role key를 넣지 않는다.
- React Native 앱에는 공개 읽기용 anon key만 넣는다.
- 앱 조회는 anon key와 RLS 정책을 별도로 설계한다.
- 저장 API를 로컬 서버로 감쌀 경우 `127.0.0.1`에만 바인딩하고 내부 토큰을 둔다.
