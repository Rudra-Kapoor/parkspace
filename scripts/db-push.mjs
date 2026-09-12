#!/usr/bin/env node
/**
 * Apply the migrations to a Supabase project.
 *
 * Deliberately has no dependencies beyond Node itself. It talks to the Supabase
 * Management API using a personal access token, which means it works without the
 * Supabase CLI, without Docker and without a local Postgres.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_...  node scripts/db-push.mjs
 *
 * The project ref is read from NEXT_PUBLIC_SUPABASE_URL in .env.local, or can be
 * passed with --project-ref.
 *
 * Migrations are applied in filename order and tracked in a _migrations table,
 * so running this twice is safe: already-applied files are skipped.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

async function loadDotEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;

    const contents = await readFile(file, 'utf8');
    for (const line of contents.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equals = trimmed.indexOf('=');
      if (equals === -1) continue;

      const key = trimmed.slice(0, equals).trim();
      let value = trimmed.slice(equals + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

function projectRefFromUrl(url) {
  const match = /https:\/\/([a-z0-9-]+)\.supabase\.co/i.exec(url ?? '');
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Management API
// ---------------------------------------------------------------------------

async function runSql(projectRef, token, sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  const text = await response.text();

  if (!response.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message ?? parsed.error ?? text;
    } catch {
      // Keep the raw text.
    }
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await loadDotEnv();

  const token = argValue('--token') ?? process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef =
    argValue('--project-ref') ??
    process.env.SUPABASE_PROJECT_REF ??
    projectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!token) {
    console.error(`
Missing SUPABASE_ACCESS_TOKEN.

Create a personal access token at:
  https://supabase.com/dashboard/account/tokens

Then run:
  SUPABASE_ACCESS_TOKEN=sbp_your_token npm run db:push

On Windows PowerShell:
  $env:SUPABASE_ACCESS_TOKEN="sbp_your_token"; npm run db:push
`);
    process.exit(1);
  }

  if (!projectRef) {
    console.error(`
Could not work out which Supabase project to use.

Set NEXT_PUBLIC_SUPABASE_URL in .env.local, or pass it directly:
  node scripts/db-push.mjs --project-ref your-project-ref
`);
    process.exit(1);
  }

  console.log(`Applying migrations to project ${projectRef}\n`);

  // Track what has been applied so re-running is safe.
  await runSql(
    projectRef,
    token,
    `create table if not exists _parkspace_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     );`,
  );

  const applied = new Set();
  try {
    const rows = await runSql(projectRef, token, 'select name from _parkspace_migrations;');
    for (const row of rows ?? []) applied.add(row.name);
  } catch {
    // First run, table was only just created.
  }

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  if (files.length === 0) {
    console.error(`No .sql files found in ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  let appliedCount = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip   ${file}  (already applied)`);
      continue;
    }

    process.stdout.write(`  apply  ${file} ... `);
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');

    try {
      await runSql(projectRef, token, sql);
      await runSql(
        projectRef,
        token,
        `insert into _parkspace_migrations (name) values ('${file}')
         on conflict (name) do nothing;`,
      );
      console.log('done');
      appliedCount += 1;
    } catch (error) {
      console.log('FAILED');
      console.error(`\n${file} failed:\n${error.message}\n`);
      console.error(
        'Nothing after this file has been applied. Fix the error and run the command again;\n' +
          'files that already succeeded will be skipped.\n',
      );
      process.exit(1);
    }
  }

  // Seed data is optional and separate.
  const seedFile = path.join(ROOT, 'supabase', 'seed', 'seed.sql');
  if (existsSync(seedFile) && !process.argv.includes('--no-seed')) {
    process.stdout.write('  seed   seed.sql ... ');
    try {
      await runSql(projectRef, token, await readFile(seedFile, 'utf8'));
      console.log('done');
    } catch (error) {
      console.log('skipped');
      console.error(`  (${error.message})`);
    }
  }

  console.log(
    `\n${appliedCount} migration${appliedCount === 1 ? '' : 's'} applied, ` +
      `${files.length - appliedCount} already present.`,
  );
  console.log(`\nNext: npm run db:seed  to add demo hosts and listings.\n`);
}

main().catch((error) => {
  console.error(`\nUnexpected failure: ${error.message}\n`);
  process.exit(1);
});
