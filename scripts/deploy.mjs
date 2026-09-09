#!/usr/bin/env node
/**
 * Guided deployment.
 *
 * Walks through pushing to GitHub and deploying to Vercel, checking preconditions
 * before each step rather than failing halfway.
 *
 * It deliberately does NOT accept tokens as command-line arguments, because
 * arguments end up in shell history and in the process list where other users on
 * the machine can read them. It reads them from the environment, or from an
 * interactive prompt with the input hidden.
 *
 *   node scripts/deploy.mjs             interactive
 *   node scripts/deploy.mjs --check     verify readiness and stop
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';

const ROOT = process.cwd();
const CHECK_ONLY = process.argv.includes('--check');

const green = (s) => `[32m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;
const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;

function run(command, options = {}) {
  return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...options }).trim();
}

function tryRun(command) {
  try {
    return { ok: true, output: run(command) };
  } catch (error) {
    return { ok: false, output: error.stdout?.toString() ?? error.message };
  }
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (!hidden) {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      return;
    }

    // Hide the input so a pasted token does not remain on screen.
    process.stdout.write(question);
    const onData = (char) => {
      const s = char.toString();
      if (s === '\n' || s === '\r' || s === '') {
        process.stdin.removeListener('data', onData);
        return;
      }
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      process.stdout.write(`${question}${'*'.repeat(rl.line.length)}`);
    };
    process.stdin.on('data', onData);

    rl.question('', (answer) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

async function preflight() {
  console.log(bold('\nChecking whether this project is ready to deploy\n'));

  const results = [];
  const check = (label, ok, detail) => {
    results.push({ label, ok, detail });
    console.log(`  ${ok ? green('pass') : red('FAIL')}  ${label}${detail ? dim(`  ${detail}`) : ''}`);
  };

  // Node
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  check('Node 20 or newer', nodeMajor >= 20, `found ${process.versions.node}`);

  // Git repository, with a committed state
  const isRepo = tryRun('git rev-parse --is-inside-work-tree').ok;
  check('Inside a git repository', isRepo);

  if (isRepo) {
    const status = tryRun('git status --porcelain');
    check(
      'Working tree is clean',
      status.ok && status.output === '',
      status.output ? `${status.output.split('\n').length} uncommitted file(s)` : '',
    );

    const remote = tryRun('git remote get-url origin');
    check(
      'A git remote named origin exists',
      remote.ok,
      remote.ok ? remote.output : 'add one with: git remote add origin <url>',
    );
  }

  // Secrets must not be tracked. This is the check that matters most.
  const tracked = tryRun('git ls-files');
  const leaked = tracked.ok
    ? tracked.output
        .split('\n')
        .filter((f) => /(^|\/)\.env($|\.)|\.secrets|service[-_]role/i.test(f))
        .filter((f) => !f.endsWith('.env.example'))
    : [];
  check(
    'No environment or secret files are tracked by git',
    leaked.length === 0,
    leaked.length ? `found: ${leaked.join(', ')}` : '',
  );

  // Environment file
  const hasEnv = existsSync(path.join(ROOT, '.env.local'));
  check('.env.local exists', hasEnv, hasEnv ? '' : 'copy it from .env.example');

  if (hasEnv) {
    const env = await readFile(path.join(ROOT, '.env.local'), 'utf8');
    const has = (key) => new RegExp(`^${key}=.+`, 'm').test(env) && !env.includes(`${key}=your-`);
    check('NEXT_PUBLIC_SUPABASE_URL is set', has('NEXT_PUBLIC_SUPABASE_URL'));
    check('NEXT_PUBLIC_SUPABASE_ANON_KEY is set', has('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
    check('SUPABASE_SERVICE_ROLE_KEY is set', has('SUPABASE_SERVICE_ROLE_KEY'));

    if (/^PAYMENT_PROVIDER=razorpay/m.test(env)) {
      check('RAZORPAY_KEY_ID is set', has('RAZORPAY_KEY_ID'));
      check('RAZORPAY_WEBHOOK_SECRET is set', has('RAZORPAY_WEBHOOK_SECRET'));
    } else {
      console.log(
        `  ${yellow('note')}  Payment provider is 'mock'. Bookings will confirm without taking money.`,
      );
    }

    if (!has('CRON_SECRET')) {
      console.log(
        `  ${yellow('warn')}  CRON_SECRET is not set. /api/cron will refuse to run in production, ` +
          `which means holds will never expire.`,
      );
      console.log(
        dim(
          `         Generate one:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
        ),
      );
    }
  }

  // Build health
  console.log(dim('\n  Running typecheck and tests, this takes a moment...\n'));

  const types = tryRun('npx tsc --noEmit');
  check('TypeScript compiles', types.ok, types.ok ? '' : 'run: npx tsc --noEmit');

  const tests = tryRun('npx vitest run --reporter=dot');
  check('Tests pass', tests.ok, tests.ok ? '' : 'run: npm test');

  const failures = results.filter((r) => !r.ok);
  console.log(
    failures.length === 0
      ? green(`\nAll ${results.length} checks passed.\n`)
      : red(`\n${failures.length} of ${results.length} checks failed.\n`),
  );

  return failures.length === 0;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

async function pushToGitHub() {
  console.log(bold('\nStep 1: push to GitHub\n'));

  const remote = tryRun('git remote get-url origin');

  if (!remote.ok) {
    console.log('No remote is configured. Create an empty repository on GitHub, then:\n');
    console.log(dim('  git remote add origin https://github.com/<you>/<repo>.git'));
    console.log(dim('  git push -u origin main\n'));
    console.log(
      'If you use a personal access token, let git prompt you for it or use the GitHub CLI.\n' +
        'Do not put the token in the remote URL: it gets written to .git/config in plain text.\n',
    );
    return false;
  }

  console.log(`Remote: ${remote.output}\n`);
  const proceed = await ask('Push the current branch now? [y/N] ');

  if (proceed.toLowerCase() !== 'y') {
    console.log(dim('Skipped.\n'));
    return false;
  }

  const branch = run('git rev-parse --abbrev-ref HEAD');
  const push = spawnSync('git', ['push', '-u', 'origin', branch], { stdio: 'inherit' });

  if (push.status !== 0) {
    console.log(red('\nPush failed. Fix the error above and try again.\n'));
    return false;
  }

  console.log(green('\nPushed.\n'));
  return true;
}

async function deployToVercel() {
  console.log(bold('\nStep 2: deploy to Vercel\n'));

  const hasVercel = tryRun('npx --no-install vercel --version').ok;

  console.log('Two options:\n');
  console.log(`  ${bold('A. Through the dashboard')}, which is the simpler one.`);
  console.log('     1. Open https://vercel.com/new');
  console.log('     2. Import the GitHub repository you just pushed');
  console.log('     3. Vercel detects Next.js automatically, leave the build settings alone');
  console.log('     4. Add these environment variables before the first deploy:\n');
  console.log(dim('        NEXT_PUBLIC_SUPABASE_URL'));
  console.log(dim('        NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  console.log(dim('        SUPABASE_SERVICE_ROLE_KEY'));
  console.log(dim('        NEXT_PUBLIC_SITE_URL      set to the Vercel URL once you know it'));
  console.log(dim('        CRON_SECRET'));
  console.log(dim('        NOMINATIM_USER_AGENT      with a real contact address'));
  console.log(dim('        PAYMENT_PROVIDER          mock, or razorpay with its keys\n'));

  console.log(`  ${bold('B. From this terminal')} using the Vercel CLI.\n`);

  if (!hasVercel) {
    console.log(dim('     The CLI is not installed. Install it with: npm i -g vercel\n'));
  }

  const proceed = await ask('Run the Vercel CLI now? [y/N] ');

  if (proceed.toLowerCase() !== 'y') {
    console.log(dim('\nSkipped. Use the dashboard steps above.\n'));
    return;
  }

  if (!process.env.VERCEL_TOKEN) {
    console.log(
      dim('\nTip: `vercel login` is usually easier than a token, and it does not leave a\n') +
        dim('secret in your shell history.\n'),
    );
  }

  const args = ['vercel', 'deploy', '--prod'];
  if (process.env.VERCEL_TOKEN) args.push('--token', process.env.VERCEL_TOKEN);

  const result = spawnSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });

  if (result.status !== 0) {
    console.log(red('\nDeploy failed. The output above should say why.\n'));
    return;
  }

  console.log(green('\nDeployed.\n'));
}

function afterDeployNotes() {
  console.log(bold('\nAfter the first deploy\n'));
  console.log('  1. Set NEXT_PUBLIC_SITE_URL to the real domain and redeploy, so auth');
  console.log('     redirects and the sitemap point at the right place.');
  console.log('  2. In Supabase, Authentication, URL Configuration, add the domain to the');
  console.log('     redirect allowlist. Magic links will not work until you do.');
  console.log('  3. Confirm the cron is running: Vercel project, Settings, Cron Jobs.');
  console.log('     Without it, expired holds never release their bays.');
  console.log('  4. If you are using a real gateway, point its webhook at');
  console.log('     https://your-domain/api/payments/webhook\n');
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(bold('\nParkSpace deployment\n'));

  const ready = await preflight();

  if (CHECK_ONLY) {
    process.exit(ready ? 0 : 1);
  }

  if (!ready) {
    const proceed = await ask(yellow('Some checks failed. Continue anyway? [y/N] '));
    if (proceed.toLowerCase() !== 'y') {
      console.log(dim('\nStopped.\n'));
      process.exit(1);
    }
  }

  await pushToGitHub();
  await deployToVercel();
  afterDeployNotes();
}

main().catch((error) => {
  console.error(red(`\nFailed: ${error.message}\n`));
  process.exit(1);
});
