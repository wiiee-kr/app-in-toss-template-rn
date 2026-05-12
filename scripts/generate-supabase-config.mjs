import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

async function loadEnvFile(envPath) {
  try {
    const source = await fs.readFile(envPath, 'utf8');
    const env = {};

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
      env[key] = value;
    }

    return env;
  } catch (error) {
    if (error != null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {};
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

function getEnvCandidates(root) {
  const candidates = [path.join(root, '.env.local')];
  const gitCommonDir = resolveGitCommonDir();

  if (gitCommonDir != null) {
    candidates.push(path.join(path.dirname(gitCommonDir), '.env.local'));
  }

  return [...new Set(candidates)];
}

async function loadMergedEnv(root) {
  const mergedEnv = {};

  for (const candidate of getEnvCandidates(root)) {
    Object.assign(mergedEnv, await loadEnvFile(candidate));
  }

  return mergedEnv;
}

async function main() {
  const root = process.cwd();
  const env = {
    ...(await loadMergedEnv(root)),
    ...process.env,
  };

  const url = (env.SUPABASE_URL ?? '').trim();
  const anonKey = (env.SUPABASE_ANON_KEY ?? '').trim();

  const outputPath = path.join(root, 'src/config/supabase.generated.ts');
  const source = `export const generatedSupabaseConfig = ${JSON.stringify(
    {
      url,
      anonKey,
    },
    null,
    2
  )} as const;\n`;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, source, 'utf8');

  console.log(`Generated ${path.relative(root, outputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
