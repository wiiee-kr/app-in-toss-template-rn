import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function parseArgs(argv) {
  let reportPath = '';
  let dryRun = false;
  let envPath = '.env.local';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--env') {
      envPath = argv[index + 1] ?? envPath;
      index += 1;
      continue;
    }

    if (reportPath === '') {
      reportPath = arg;
    }
  }

  if (reportPath === '') {
    throw new Error('리포트 JSON 경로를 전달해야 합니다.');
  }

  return { reportPath, dryRun, envPath };
}

async function loadEnvFile(envPath) {
  try {
    const source = await fs.readFile(envPath, 'utf8');

    for (const rawLine of source.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (line === '' || line.startsWith('#')) {
        continue;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/gu, '');

      if (process.env[key] == null || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error != null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

function resolveGitCommonDir() {
  try {
    const output = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (output === '') {
      return null;
    }

    return path.resolve(process.cwd(), output);
  } catch {
    return null;
  }
}

function getDefaultEnvCandidates(explicitEnvPath) {
  const candidates = [path.resolve(process.cwd(), explicitEnvPath)];
  const gitCommonDir = resolveGitCommonDir();

  if (gitCommonDir != null) {
    candidates.push(path.join(path.dirname(gitCommonDir), explicitEnvPath));
  }

  return [...new Set(candidates)];
}

async function loadEnvFromCandidates(explicitEnvPath) {
  const loadedPaths = [];

  for (const candidate of getDefaultEnvCandidates(explicitEnvPath)) {
    try {
      await fs.access(candidate);
      await loadEnvFile(candidate);
      loadedPaths.push(candidate);
    } catch (error) {
      if (error != null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        continue;
      }

      throw error;
    }
  }

  return loadedPaths;
}

function assertString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} 값이 비어 있습니다.`);
  }
}

function assertArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 값은 배열이어야 합니다.`);
  }
}

function validateReport(report) {
  if (report == null || typeof report !== 'object') {
    throw new Error('리포트 JSON 객체가 필요합니다.');
  }

  assertString(report.id, 'id');
  assertString(report.date, 'date');
  assertString(report.type, 'type');
  assertString(report.publishedAt, 'publishedAt');
  assertString(report.publishedAtLabel, 'publishedAtLabel');
  assertString(report.marketTemperature, 'marketTemperature');
  assertString(report.marketTemperatureReason, 'marketTemperatureReason');
  assertString(report.oneLineConclusion, 'oneLineConclusion');
  assertString(report.confidence, 'confidence');
  assertArray(report.top3, 'top3');
  assertArray(report.koreaSummary, 'koreaSummary');
  assertArray(report.usSummary, 'usSummary');
  assertArray(report.risks, 'risks');
  assertArray(report.checkpoints, 'checkpoints');

  if (report.top3.length !== 3) {
    throw new Error('top3는 정확히 3개여야 합니다.');
  }

  if (report.oneLineConclusion.length > 120) {
    throw new Error('oneLineConclusion은 120자 이하여야 합니다.');
  }
}

async function main() {
  const { reportPath, dryRun, envPath } = parseArgs(process.argv.slice(2));
  const loadedEnvPaths = await loadEnvFromCandidates(envPath);

  const absoluteReportPath = path.resolve(reportPath);
  const report = JSON.parse(await fs.readFile(absoluteReportPath, 'utf8'));
  validateReport(report);

  const payload = {
    id: report.id,
    date: report.date,
    type: report.type,
    published_at: report.publishedAt,
    payload: report,
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'dry-run',
          reportPath: absoluteReportPath,
          uploadPayload: payload,
        },
        null,
        2
      )
    );
    return;
  }

  const url = process.env.SUPABASE_URL?.trim() ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

  if (url === '' || serviceRoleKey === '') {
    const searchedPaths = getDefaultEnvCandidates(envPath).join(', ');
    throw new Error(
      `SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다. 확인한 env 경로: ${searchedPaths}. 로드된 env 경로: ${loadedEnvPaths.join(', ') || '없음'}`
    );
  }

  const endpoint = `${url.replace(/\/$/u, '')}/rest/v1/reports?on_conflict=id`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase 업로드 실패 (${response.status}): ${responseText}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'publish',
        reportId: report.id,
        response: responseText === '' ? null : JSON.parse(responseText),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
