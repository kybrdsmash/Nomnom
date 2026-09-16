#!/usr/bin/env node
/**
 * Lists every Play Store release track for this app and its current live
 * release (name/versionCodes/status) - the real API-level track ids, which
 * for a custom-named closed/open testing track are just its display name
 * verbatim, NOT the legacy internal/alpha/beta/production buckets (see
 * play-track-promote.js's doc comment). Run this before guessing a track
 * name for that script.
 *
 * Usage: node scripts/play-track-list.js
 */
const fs = require('fs');
const crypto = require('crypto');

const KEY_PATH = 'C:/Users/Isaac/keys/nomnom-play-submit.json';
const PACKAGE_NAME = 'com.peach.nomnomapp';

async function getAccessToken() {
  const key = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claim)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

async function main() {
  const token = await getAccessToken();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Reading tracks requires an edit context same as writing does - this
  // edit is left uncommitted (Play auto-expires it), so it has no effect
  // on the live app.
  const editRes = await fetch(`${base}/edits`, { method: 'POST', headers });
  const edit = await editRes.json();
  if (!edit.id) throw new Error('Failed to create edit: ' + JSON.stringify(edit));

  const listRes = await fetch(`${base}/edits/${edit.id}/tracks`, { headers });
  const list = await listRes.json();
  if (list.error) throw new Error('Failed to list tracks: ' + JSON.stringify(list.error));

  for (const t of list.tracks || []) {
    const release = t.releases?.[0];
    console.log(
      `${t.track}${release ? `  -  ${release.name} (versionCodes ${release.versionCodes?.join(', ')}, ${release.status})` : '  -  (no release)'}`
    );
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
