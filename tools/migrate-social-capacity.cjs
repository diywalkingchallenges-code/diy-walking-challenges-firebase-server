/* Run after deploying this version's rules, before distributing the updated app.
   Uses the owner's existing Firebase CLI login. Never prints or stores credentials.
   Audit: node tools/migrate-social-capacity.cjs --project PROJECT --firebase-tools PATH
   Apply: add --apply. Interrupted migrations keep the lock; rerun the same command.
*/
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const argv = process.argv.slice(2);
const option = name => argv[argv.indexOf(name) + 1];
const project = argv.includes('--project') ? option('--project') : '';
const cli = argv.includes('--firebase-tools') ? option('--firebase-tools') : '';
const apply = argv.includes('--apply');
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project) || (!cli && !emulator) || (emulator && !project.startsWith('demo-'))) {
  console.error('Specify --project PROJECT and --firebase-tools the installed firebase-tools directory. Add --apply to migrate.');
  process.exit(1);
}
const auth = emulator ? null : require(path.resolve(cli, 'lib/auth.js'));
const zero = () => ({ friends: 0, incoming: 0, outgoing: 0 });
function derive(edges) {
  const values = new Map();
  for (const doc of edges) {
    const fields = doc.fields;
    const members = fields.members.arrayValue.values.map(v => v.stringValue);
    const from = fields.fromUid.stringValue, status = fields.status.stringValue;
    if (members.length !== 2 || !members.includes(from) || !['pending','accepted','blocked'].includes(status)) throw Error('Invalid legacy relationship. Migration stopped.');
    for (const uid of members) {
      const cap = values.get(uid) || zero();
      if (status === 'accepted') cap.friends++;
      if (status === 'pending') cap[from === uid ? 'outgoing' : 'incoming']++;
      values.set(uid, cap);
    }
  }
  return values;
}
(async () => {
  const account = auth?.getProjectDefaultAccount(process.cwd());
  if (!account && !emulator) throw Error('Sign in with firebase login first.');
  const token = emulator ? {access_token: 'owner'} : await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  const base = `${emulator ? 'http://' + emulator : 'https://firestore.googleapis.com'}/v1/projects/${project}/databases/(default)/documents`;
  const docBase = `projects/${project}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' };
  async function request(suffix, body) {
    const r = await fetch(base + suffix, { headers, method: body ? 'POST' : 'GET', ...(body ? {body: JSON.stringify(body)} : {}) });
    if (!r.ok) throw Error(`Firestore HTTP ${r.status}. ${apply ? 'If a maintenance lock was created, it remains until a successful rerun.' : ''}`);
    return r.json();
  }
  async function list(collection) {
    let cursor = '', docs = [];
    do {
      const page = await request(`/${collection}?pageSize=300${cursor ? '&pageToken=' + encodeURIComponent(cursor) : ''}`);
      docs.push(...(page.documents || [])); cursor = page.nextPageToken;
    } while (cursor);
    return docs;
  }
  const lockName = `${docBase}/socialMaintenance/capacity`;
  const existingLock = (await list('socialMaintenance')).find(doc => doc.name === lockName);
  if (existingLock && existingLock.fields?.purpose?.stringValue !== 'social-capacity-v1') throw Error('Another maintenance lock exists. It was left unchanged.');
  if (apply) await request(':commit', { writes: [{ update: { name: lockName, fields: { purpose: {stringValue: 'social-capacity-v1'} } } }] });
  const edges = await list('friendships'), existing = await list('socialCapacity');
  const wanted = derive(edges);
  existing.forEach(doc => { const uid = doc.name.split('/').at(-1); if (!wanted.has(uid)) wanted.set(uid, zero()); });
  console.log(`${project}: ${edges.length} relationships, ${wanted.size} capacity records. Mode: ${apply ? 'apply' : 'audit'}.`);
  if (!apply) return;
  const backup = fs.mkdtempSync(path.join(os.tmpdir(), `diy-social-${project}-`));
  fs.writeFileSync(path.join(backup, 'before.json'), JSON.stringify({edges, capacity: existing}, null, 2));
  const records = [...wanted].map(([uid, value]) => ({ update: {name: `${docBase}/socialCapacity/${uid}`,
    fields: Object.fromEntries(Object.entries(value).map(([key, n]) => [key, {integerValue: String(n)}])) } }));
  for (let i = 0; i < records.length; i += 200) await request(':commit', {writes: records.slice(i, i + 200)});
  const actual = await list('socialCapacity');
  for (const doc of actual) {
    const expected = wanted.get(doc.name.split('/').at(-1));
    if (!expected || Object.entries(expected).some(([key, n]) => Number(doc.fields[key]?.integerValue) !== n)) throw Error('Reconciliation failed; maintenance lock retained.');
  }
  if (actual.length !== wanted.size) throw Error('Incomplete reconciliation; maintenance lock retained.');
  await request(':commit', { writes: [{ delete: lockName }] });
  console.log(`Migration verified; friendship writes resumed. Private backup: ${backup}`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
