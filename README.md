# DIY Walking Challenges — Firebase race server

Racer icons (Android 2.17.59): deploy the updated Firestore rules to allow the optional `racerIcon`
member field. It contains a small inline WebP (at most 684 base64 characters), so no Storage bucket
is required. Only the participant may update or remove it with an increasing sequence; other member
and room permissions remain in force. Existing clients may omit it. Updated apps can still share
progress on old private rules, but icons require these rules. The app's setup guide includes them.
This repository contains the Firebase security configuration used by **DIY Walking Challenges**.
It is public so a group can inspect the cloud boundary, test it, and run its own private race
server without trusting hidden server code.

This is **not** the Android app and it is not a general-purpose Firebase starter kit. The app source
is maintained separately. The companion image-generation service is in
[diy-walking-challenges-image-worker](https://github.com/diywalkingchallenges-code/diy-walking-challenges-image-worker).

## What this server does

- Keeps a private race room's standings synchronized between participants.
- Lets each participant update only their own progress.
- Lets a room owner edit a race name and its future banked-distance rule while open, close the race
  into history, remove participants while open, and manage bans. Closed race names can be corrected;
  final bank rules, route identity, ownership, and standings stay fixed.
- Optionally stores private challenge-pack files for route links and assisted race joining.

It does **not** receive raw Health Connect records, individual step observations, height, stride,
awards, or health permissions. Firestore-only rooms also do not upload route artwork.

There is no Cloud Function or traditional web server to run. The Android app talks directly to
Firebase, and the two checked-in rule files decide which operations are allowed.

## Which setup should I choose?

| Goal | Firebase plan | Files to publish | How routes are shared |
| --- | --- | --- | --- |
| Live race standings | Spark | `firestore.rules` and `firestore.indexes.json` | Send a `.walkpack` file when a racer lacks the route |
| Live standings plus private route links | Blaze | Firestore files plus `storage.rules` | The app can upload and reuse a private hosted pack |

The Spark option can run within Firebase's no-cost allowance and does not require a payment method.
Cloud Storage for Firebase requires the pay-as-you-go Blaze plan, although no-cost usage allowances
still apply. Blaze can charge for overages; budget alerts are notifications, not spending caps.
Always review [Firebase pricing](https://firebase.google.com/pricing) before enabling Storage.

## Who needs to do what?

The **group organizer** creates and configures one Firebase project. One project can serve all of
that group's rooms—do not create a project for every race.

Every **racer** imports the organizer's current `google-services.json` into DIY Walking Challenges.
They do not need the organizer's Google login, billing access, or Firebase Console access. This
Android configuration identifies the project; it is not an administrator credential. Never send a
service-account key, Admin SDK key, password, or recovery code to the app.

Follow [Set up a Firebase race server](docs/SETUP.md) for the complete organizer and racer paths.
If you want hosted route links, continue with [Enable private route links](docs/HOSTED_PACKS.md).

## Repository contents

- `firestore.rules` — room, participant, invite, and artifact metadata authorization.
- `storage.rules` — immutable `.walkpack` and preview authorization.
- `firestore.indexes.json` — the indexes expected by this rules version.
- `firebase.json` — deploy paths and local emulator ports; it contains no project selection.
- `test/rules.test.cjs` — security tests that exercise allowed and denied operations.
- `examples/` — placeholders only; no live project or credential is included.
- `docs/` — setup, privacy, data model, and maintenance guidance.

## Test before deploying

You need Node.js 20 or newer and Java 21 or newer:

```bash
npm ci
npm test
```

`npm test` starts isolated Firestore and Storage emulators under the fake project ID `demo-diywc`,
runs the rule suite, and shuts the emulators down. It never contacts or modifies a real Firebase
project.

## Deploy

Use an explicit project ID every time so the CLI cannot silently target the wrong project:

```bash
npx firebase login
npx firebase deploy --only "firestore:rules,firestore:indexes" --project YOUR_PROJECT_ID
```

For a Blaze project whose Storage bucket is already created:

```bash
npx firebase deploy --only "firestore:rules,firestore:indexes,storage" --project YOUR_PROJECT_ID
```

The first Storage deployment may ask permission for Storage rules to read Firestore authorization
records. This repository relies on that documented connection; approve it only while signed into
the intended Firebase project. See Firebase's
[cross-service rules documentation](https://firebase.google.com/docs/rules/manage-deploy#manage_cross-service_permissions).

## Security and compatibility

Invitation codes are high-entropy bearer credentials. Keep them private. Rules deny room, share,
artifact, and bucket enumeration, but anyone holding a valid open invite can use the access that
invite grants.

Run the emulator tests after every rule change and deploy Firestore and Storage rules from the same
release. See [SECURITY.md](SECURITY.md) to report a vulnerability privately and
[docs/MAINTENANCE.md](docs/MAINTENANCE.md) before modifying the protocol.

## License and name

The code in this repository is licensed under the [Apache License 2.0](LICENSE). The license does
not grant rights to the DIY Walking Challenges name, logo, or other brand assets; see
[TRADEMARKS.md](TRADEMARKS.md).
