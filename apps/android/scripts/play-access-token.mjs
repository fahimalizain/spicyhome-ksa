/**
 * Mint a short-lived Google OAuth2 access token for the Google Play Android
 * Publisher API from a service-account key.
 *
 * Usage:
 *   PLAY_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
 *     node scripts/play-access-token.mjs
 *
 * Contract:
 *   - stdout: the access token only, with no trailing newline. Capture it with
 *     command substitution (e.g. TOKEN=$(node scripts/play-access-token.mjs)).
 *   - stderr: every diagnostic. Failures exit with status 1 and never write to
 *     stdout, so an empty capture always means the script failed.
 *
 * The token is short-lived (~1 hour, matching the JWT `exp` requested below);
 * mint it immediately before use. The only scope requested is
 * https://www.googleapis.com/auth/androidpublisher.
 *
 * SECURITY: stdout contains a live credential. In CI, mask it before it can
 * reach the logs:
 *   TOKEN=$(node apps/android/scripts/play-access-token.mjs)
 *   echo "::add-mask::$TOKEN"
 */

import { createSign } from 'node:crypto';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TOKEN_LIFETIME_SECONDS = 3600;

/** Writes a diagnostic to stderr and exits non-zero without touching stdout. */
function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Formats a caught value for a diagnostic. */
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

const serviceAccountJson = process.env.PLAY_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  fail('PLAY_SERVICE_ACCOUNT_JSON is not set');
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch {
  // V8 can embed a snippet of the input in its JSON.parse error, so keep this
  // message static to avoid echoing any part of the secret.
  fail(
    'PLAY_SERVICE_ACCOUNT_JSON is not valid JSON. Check that the secret holds the complete service-account key file.',
  );
}

if (
  !serviceAccount ||
  typeof serviceAccount !== 'object' ||
  !serviceAccount.client_email ||
  !serviceAccount.private_key
) {
  fail('PLAY_SERVICE_ACCOUNT_JSON is missing client_email or private_key');
}

const base64url = (input) => Buffer.from(input, 'utf8').toString('base64url');
const now = Math.floor(Date.now() / 1000);
const signingInput = [
  base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
  base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: ANDROID_PUBLISHER_SCOPE,
      aud: TOKEN_ENDPOINT,
      iat: now,
      exp: now + TOKEN_LIFETIME_SECONDS,
    }),
  ),
].join('.');

let assertion;
try {
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(serviceAccount.private_key, 'base64url');
  assertion = `${signingInput}.${signature}`;
} catch (error) {
  fail(
    `Cannot sign the JWT with private_key from PLAY_SERVICE_ACCOUNT_JSON: ${describeError(error)}`,
  );
}

let response;
try {
  response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
} catch (error) {
  fail(`Token exchange request failed: ${describeError(error)}`);
}

let body;
try {
  body = await response.json();
} catch {
  fail(`Token exchange returned a non-JSON response (status ${response.status})`);
}

if (!body || typeof body !== 'object') {
  fail(`Token exchange returned an unexpected response body (status ${response.status})`);
}

if (!response.ok || !body.access_token) {
  fail(`Token exchange failed: ${response.status} ${JSON.stringify(body)}`);
}

process.stdout.write(body.access_token);
