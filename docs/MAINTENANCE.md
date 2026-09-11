# Rules maintenance and compatibility

Firebase clients enforce user experience; these rules enforce the cloud authorization boundary.
Treat a rule edit as a security-sensitive protocol change.

## Current document families

| Path | Purpose | Listing |
| --- | --- | --- |
| `races/{roomId}` | Versioned room metadata | Denied |
| `races/{roomId}/members/{authUid}` | One participant's aggregate progress | Members/owner only |
| `races/{roomId}/bans/{authUid}` | Owner-managed ban record | Owner only |
| `packArtifacts/{ownerUid}/items/{sha256}` | Immutable hosted-pack metadata/state | Denied |
| `.../readers/{readerUid}` | Exact share/race download grant | Denied |
| `packShares/{shareId}` | Unlisted hosted-route metadata | Denied |
| `socialProfiles/{uid}` and `trophies` | Opt-in profile and trophy case | Profile list denied; trophy reads restricted to self/friends |
| `friendCards/{uid}` | Exact-code nickname/icon | Denied |
| `friendships/{sortedUidPair}` | Requests, accepted friends, blocks | Members only, 25 per directory page |
| `socialInvites/{room_sender_recipient}` | Direct race invitations | Sender/recipient only, 25 per page |
| `leaderboard/{uid}` | Separately opted-in public summary | Signed-in clients, 25 per page |
| `socialCapacity/{uid}` | Three slot counts | Exact reads only |
| `socialChanges/{uid}` | Proof for atomic slot/relationship updates | Exact reads by owner only |
| `socialMaintenance/capacity` | Temporary migration lock | Admin only |

Storage uses:

- `walkpacks/{ownerUid}/{sha256}.walkpack`
- `walkpack-thumbnails/{ownerUid}/{sha256}/{challengeFingerprint}.webp`

Room version 1 remains supported for legacy rooms. Room version 2 binds membership to a
selected-route SHA-256 fingerprint and optionally references a ready hosted artifact. An absent
`allowBankedDistance` field preserves the legacy behavior of allowing banked distance; when present,
the owner can change the Boolean while the room is open; closing freezes that policy.

## Upgrading social clients to 2.17.76

Deploy the supplied rules and indexes, wait for indexes to become enabled, and follow
[the capacity migration instructions](SOCIAL.md#server-setup) before distributing the updated
clients. The migration locks friendship mutations, backs up and counts existing relationships,
reconciles counters, verifies them, and unlocks. Existing over-limit accounts retain their edges
and can remove them. Do not replace derived counts with client-supplied totals or manually delete
the lock to bypass an interrupted migration. Rerun the tool to resume reconciliation.

The old 2.17.75 social client cannot mutate friendships under the new atomic protocol. Ordinary
race clients retain compatibility. Fresh servers with no social relationships need no migration.

## Invariants to preserve

- Require Firebase Authentication before any access.
- Keep exact field allowlists and value/length limits.
- Keep owner and participant identities immutable.
- Keep high-entropy room/share IDs and deny collection listing.
- Require monotonically increasing client sequence values while allowing legitimate progress
  corrections to move aggregate progress backward.
- Bind hosted metadata, object paths, sizes, hashes, MIME types, and owner IDs together.
- Publish an object only after its artifact enters the expected state; never allow overwrite.
- Validate reader grants from their exact open share or matching race.
- Keep an explicit recursive default deny at the end of each rules file.

## Safe change process

1. Add a test showing the required operation currently fails or is missing.
2. Add bypass tests for outsider, participant, owner, stale, malformed, oversized, and list access
   as relevant.
3. Change the narrowest rule needed.
4. Run `npm test` against the emulators.
5. Test the matching Android build against emulators or a disposable project.
6. Deploy Firestore and Storage rules from the same reviewed commit.
7. Record the minimum compatible Android version in the release notes.

Never weaken rules temporarily on a live project to debug a client. Use the emulators or a separate
disposable Firebase project instead.
