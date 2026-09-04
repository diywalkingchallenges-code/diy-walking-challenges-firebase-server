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

Storage uses:

- `walkpacks/{ownerUid}/{sha256}.walkpack`
- `walkpack-thumbnails/{ownerUid}/{sha256}/{challengeFingerprint}.webp`

Room version 1 remains supported for legacy rooms. Room version 2 binds membership to a
selected-route SHA-256 fingerprint and optionally references a ready hosted artifact. An absent
`allowBankedDistance` field preserves the legacy behavior of allowing banked distance; when present,
the Boolean is immutable for that room.

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
