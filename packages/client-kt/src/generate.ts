/**
 * Generates Kotlin client sources from openapi.json.
 *
 * Usage:
 *   bazel run //packages/client-kt:generate [-- <output-dir>]
 *
 * Default output dir: packages/client-kt/src/generated
 *
 * Requires: Java on PATH, @openapitools/openapi-generator-cli in node_modules.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const PACKAGE_NAME = 'com.spicyhome.client';
const ADDITIONAL_PROPS = [
  'library=jvm-retrofit2',
  'collectionFormat=csv',
  'dateLibrary=string',
].join(',');

function findSpec(): string {
  const candidates = [
    path.join(process.cwd(), 'packages', 'api-spec', 'openapi.json'),
    path.join(
      process.env.BUILD_WORKSPACE_DIRECTORY || '',
      'packages', 'api-spec', 'openapi.json',
    ),
    path.join(
      process.env.RUNFILES_DIR || '',
      '_main', 'packages', 'api-spec', 'openapi.json',
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Cannot find openapi.json. Set BUILD_WORKSPACE_DIRECTORY or run from workspace root.');
}

function findDefaultOutDir(): string {
  const candidates = [
    path.join(
      process.env.BUILD_WORKSPACE_DIRECTORY || process.cwd(),
      'packages', 'client-kt', 'src', 'generated',
    ),
  ];
  for (const c of candidates) {
    return c;
  }
  return path.join(process.cwd(), 'packages', 'client-kt', 'src', 'generated');
}

function findCli(): string {
  const candidates = [
    path.join(
      process.env.BUILD_WORKSPACE_DIRECTORY || process.cwd(),
      'packages', 'client-kt', 'node_modules', '.bin', 'openapi-generator-cli',
    ),
    path.join(process.cwd(), 'node_modules', '.bin', 'openapi-generator-cli'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('openapi-generator-cli not found in node_modules/.bin');
}

function main(): void {
  const specPath = findSpec();
  const outDir = process.argv[2] || findDefaultOutDir();

  // Wipe old output but keep .openapi-generator/VERSION for caching
  if (fs.existsSync(outDir)) {
    const entries = fs.readdirSync(outDir);
    for (const entry of entries) {
      if (entry === '.openapi-generator') continue;
      fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
    }
  }

  const cli = findCli();
  const cmd = [
    `"${cli}"`,
    'generate',
    '-i', `"${specPath}"`,
    '-g', 'kotlin',
    '-o', `"${outDir}"`,
    '--additional-properties',
    `packageName=${PACKAGE_NAME},${ADDITIONAL_PROPS}`,
  ].join(' ');

  console.log(`Spec:    ${specPath}`);
  console.log(`Output:  ${outDir}`);
  console.log(`Command: ${cmd}`);

  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log('Done.');
  } catch (err: any) {
    console.error('Generation failed:', err.message);
    process.exit(1);
  }
}

main();
