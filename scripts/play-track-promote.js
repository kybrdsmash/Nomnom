#!/usr/bin/env node
/**
 * Assigns an already-uploaded Play Store build (by version code) to an
 * additional release track, without re-uploading the binary - this is what
 * Play Console's own "Promote release" button does, made scriptable.
 *
 * Needed because `eas submit` can only upload-and-assign-to-ONE-track per
 * call, and Play's API rejects uploading the identical binary a second time
 * ("You've already submitted this version of the app") - every track after
 * the first has needed a manual click through Play Console until now.
 *
 * Usage: node scripts/play-track-promote.js <track> <versionCode>
 * e.g.:  node scripts/play-track-promote.js internal 7
 *        node scripts/play-track-promote.js "Friends Beta" 7
 *
 * Track name gotcha (cost real debugging time to find): the legacy fixed
 * names internal/alpha/beta/production only apply to the ORIGINAL single
 * track of each type. A custom-named closed/open testing track (created via
 * "Create track" in Console, like this project's "Friends Beta") gets its
 * OWN API-level track id - which is just its display name, verbatim - NOT
 * "alpha". Run `node scripts/play-track-list.js` (if present) or GET
 * edits/{id}/tracks to see the real list before guessing.
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
  const [track, versionCodeStr] = process.argv.slice(2);
  const versionCode = parseInt(versionCodeStr, 10);
  if (!track || !versionCode) {
    console.error('Usage: node scripts/play-track-promote.js <track> <versionCode>');
    process.exit(1);
  }

  const token = await getAccessToken();
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const editRes = await fetch(`${base}/edits`, { method: 'POST', headers });
  const edit = await editRes.json();
  if (!edit.id) throw new Error('Failed to create edit: ' + JSON.stringify(edit));

  // A track's release-level countryTargeting isn't implied by default - a
  // PUT that omits it resets the track to targeting no countries at all
  // (silently, until commit rejects it with "targeting no countries").
  // Carry forward whatever the track's current live release already has.
  const currentRes = await fetch(`${base}/edits/${edit.id}/tracks/${track}`, { headers });
  const current = await currentRes.json();
  const countryTargeting = current.releases?.[0]?.countryTargeting;

  const trackRes = await fetch(`${base}/edits/${edit.id}/tracks/${track}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      track,
      releases: [{
        versionCodes: [String(versionCode)],
        status: 'completed',
        ...(countryTargeting ? { countryTargeting } : {}),
      }],
    }),
  });
  const trackData = await trackRes.json();
  if (trackData.error) throw new Error('Failed to update track: ' + JSON.stringify(trackData.error));

  const commitRes = await fetch(`${base}/edits/${edit.id}:commit`, { method: 'POST', headers });
  const commitData = await commitRes.json();
  if (commitData.error) throw new Error('Failed to commit edit: ' + JSON.stringify(commitData.error));

  console.log(`Published versionCode ${versionCode} to track "${track}".`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
