# Friends and leaderboard

Open **Race → Friends & leaderboard**, enable the profile on the selected server, and copy your
friend code. Paste someone else's code to request a connection. The recipient accepts or declines.
Both people must use the same community or private Firebase project. Offline mode has no directory.

You can also tap **Add friend** on any public leaderboard entry. Your own entry shows **You**;
existing connections show **Friends**, outgoing requests show **Request sent**, and incoming ones
offer **Accept request**. Blocked connections are unavailable. Public listing still exposes only
the summary; an unaccepted request does not unlock private profiles or trophies.

## Directory limits and paging (2.17.76)

- Each identity can have **200 accepted friends**, **50 incoming requests**, and **50 outgoing
  requests** on each server. Accepting consumes a friend slot for both people and releases their
  corresponding request slots. Declining, canceling, removing, or blocking releases the relevant
  capacity. Removing an old block does not consume a friend slot. Existing over-limit accounts
  retain their relationships and can remove them; increases must fit the current limits.
- These are atomic Firestore rules constraints, not just disabled buttons. A transaction reads
  the relationship and both capacity documents, then writes a private change proof, both counters,
  and the relationship. Conflicting requests retry against current capacity. Rules forbid changing
  counters alone, resetting them, deleting them, or changing the relationship without matching counters.
- Leaderboard, Friends / Received / Sent / Blocked, and pending Invitations show **25 rows at a
  time**. Previous/Next use document cursors and replace the page. No growing profile cache, offset
  query, full-leaderboard download, or all-user count is used. Each profile page resolves only its
  visible relationship states with at most five simultaneous reads. Friends load profile details
  only for the displayed page; invitation permissions do not depend on the displayed friend page.
- Public order is selected metric descending, then document ID descending for ties. Displayed
  positions reflect the page traversal, not a frozen competitive rank. Live score changes can
  move people across page boundaries; pull down or change metric to restart at the first page.
- Foreground/background friend alerts read at most 300 small active relationship records
  (200 friends plus 100 requests), excluding unlimited block history. Invitation alerts resume
  from a persistent timestamp/document-ID cursor, up to four pages of 25 per check. The next
  check resumes any backlog. Notification receipts retain current relationship states and one
  invitation page rather than every historical invitation ID.
- Collection-wide traffic still grows with active users and incurs normal Firebase usage/quotas.
  Paging bounds each client's work; it is not a promise of unlimited free hosting. Emulator tests
  cover 2,500 public entries, ties, both directions, and concurrent limit boundaries.

Tap an accepted friend's card to see their stats and paginated trophy case. **Invite to race**
selects an existing open room this phone has joined. Invitations appear under **Invitations**.
Join opens the existing race flow; it never silently imports or fabricates a route. The community
server still needs a matching `.walkpack` if the route is absent. A private room can offer its
hosted pack when configured for Storage. Accepted invitations are acknowledged after membership
is saved, including after route recovery. One invitation per sender/recipient/room prevents retries
from creating duplicate inbox entries.

Profiles are friends-only. A friend code exposes only nickname and icon before acceptance.
**My profile → Join this server's public leaderboard** separately publishes summary stats.
Opting out atomically removes that entry. Public entries never grant access to the trophy case.
Removing a friend revokes private profile access; blocking also prevents new requests and direct
invitations until the blocker unblocks. Existing race membership is managed separately in Race.

## Statistics

- Distance includes current and archived solo progress, independent race contributions, and
  unallocated distance on this phone. Moving banked distance into a race is not new manual activity.
- Recorded and manual totals are estimates based on the remaining local observation/event ledgers,
  bounded by total distance. Restored or otherwise unclassified distance is shown separately.
  No raw Health Connect records, times, source IDs, or step samples are uploaded.
- Medals count the saved trophy case, including custom route medals and the tutorial medal.
  Race finishes count retained completed race runs, including offline races.
- Wins count closed cloud races on the selected server, with at least two distinct participants
  and known goals/finish times. The first recorded finish wins; exact ties share a win. Closing early
  without a finisher is not a win. Legacy or incomplete finish records remain unranked. Each
  participating phone enables Friends and refreshes to publish its own finish record; later
  refreshes reconcile results. Counted wins remain saved locally when a room's local history is deleted.
- All totals are client-reported and include custom routes/manual entries. They are social
  comparisons, not verified competitive records. Rank pages contain 25 entries; trophy pages 24.

## Identity and notifications

Firebase's existing anonymous identity is scoped to the installation and selected server. There is
no email signup or cross-device account recovery in this release. Clearing app data/reinstalling
can lose access to the old identity; `.walkbackup` does not contain Firebase credentials or friend
relationships. A signed update over the existing APK keeps that identity and local data.

Friend requests, accepted requests, and direct invitations have separate Settings → Notifications
switches. Alerts follow foreground listeners and periodic Android background checks; they are not
instant FCM pushes. Android scheduling, network availability, permissions, and channel settings
affect delivery. Muted events are recorded without replaying a backlog. Notification taps open
Friends; a notification for a different server explains which server selection is required.

## Server setup

The community deployment uses the root `firestore.rules`. Private server owners update Firestore
using the in-app Race settings setup guide (the bundled copy matches the root rules). No Storage
bucket is needed for small profile icons and medal thumbnails. Existing races continue to use
their original documents/rules; social finish metadata uses a separate members-only subcollection.

Deploy both `firestore.rules` and `firestore.indexes.json` using
`firebase deploy --only firestore --project YOUR_PROJECT_ID`. Wait for all composite indexes to
be enabled before distributing the app. The in-app setup guide includes the index configuration.
The community server's social collections were empty when this update was deployed.

For an existing private server upgrading from 2.17.75, **deploy the new rules first**, then run
the trusted migration with your existing administrator Firebase CLI login:

```text
node tools/migrate-social-capacity.cjs --project YOUR_PROJECT_ID --firebase-tools PATH_TO_FIREBASE_TOOLS
node tools/migrate-social-capacity.cjs --project YOUR_PROJECT_ID --firebase-tools PATH_TO_FIREBASE_TOOLS --apply
```

`PATH_TO_FIREBASE_TOOLS` is the installed package directory containing `lib/auth.js` (for a global
install, run `npm root -g` and append `/firebase-tools`). The first command audits without writing.
The second temporarily locks only friendship mutations, backs up edges/counters privately under
the computer's temporary directory, derives counts from existing relationships, verifies them,
and releases the lock. Existing names, profiles, progress, trophies, races, and edges are preserved.
If interrupted, the lock remains; rerun the command to reconcile and unlock. Do not remove the
lock manually to skip a failed migration. The updated app must not be distributed until migration
is complete. Clients cannot supply or reset their own legacy totals.

Collections: `socialProfiles/{uid}` with `trophies`, exact-code-only `friendCards/{uid}`,
`friendships/{sortedUidPair}`, recipient-scoped `socialInvites/{room_sender_recipient}`,
opt-in-only `leaderboard/{uid}`, aggregate-only `socialCapacity/{uid}`, and owner-only
`socialChanges/{uid}`. `socialMaintenance/capacity` is an admin-only migration lock. Capacity can
be read by signed-in clients to check whether a request fits; it contains only the three slot
counts, never relationship IDs or profile data. Server rules enforce ownership, acceptance, field limits,
atomic public opt-in/opt-out, and membership before invitation acceptance. Rule tests include
unauthorized reads/writes and paginated queries.

Firebase references: [anonymous identities](https://firebase.google.com/docs/auth/android/anonymous-auth),
[query authorization](https://firebase.google.com/docs/firestore/security/rules-query), and
[atomic validation](https://firebase.google.com/docs/firestore/security/rules-conditions).
