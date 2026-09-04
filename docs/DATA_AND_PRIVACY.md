# Data and privacy boundary

This document describes the Firebase data boundary implemented by the checked-in rules. It is not a
substitute for the privacy policy of an app distributor or the Firebase and Google Cloud terms.

## Data used for live races

The app stores:

- the room name and high-entropy room ID;
- route, pack, revision, and selected-route fingerprint identifiers;
- room owner, open/closed/deleting state, and the room's banked-distance policy;
- each racer's nickname and opaque participant/Firebase identifiers;
- aggregate challenge progress, aggregate distance, sequence number, and timestamps; and
- for hosted packs, content hashes, file size, portable identity, Storage paths, and reader grants.

The rules do not attempt to prove that client-reported distance came from a particular sensor.
They prevent one participant from writing another participant's record and bind compatible clients
to the room's selected route.

## Data that stays on the phone

Ordinary race synchronization does not upload:

- raw Health Connect records;
- per-interval step or distance observations;
- height or estimated stride;
- health permissions;
- awards or certificates; or
- unrelated local routes and artwork.

A Firestore-only server never receives map, badge, banner, or milestone art. Hosted sharing uploads
the complete selected pack and its artwork only after its owner explicitly publishes a link or
Storage-assisted race.

## Access model

- Firebase Authentication is required. The app uses anonymous identities.
- Rooms and shares are retrieved by exact high-entropy IDs; enumeration is denied.
- A person holding an open invitation can retrieve its metadata and join under the rules.
- While a race is open, participants update only their own member document and owners can remove
  participants.
- Closing a race is a one-way transition. It stops new joins and freezes every participant's final
  standings; neither the owner nor a participant can change or remove them from the closed room.
- Existing members can continue to retrieve a closed room and its final standings as race history.
- Owners manage room state and bans. A separate deleting state remains available for an explicit
  permanent owner cleanup.
- Hosted files are immutable and readable only by the owner or an exact rules-validated reader
  grant tied to an open share or matching race.
- Unknown collections and Storage paths are denied by default.

An invitation is a bearer credential: anyone who receives it may use its intended access while it
remains open. Send invitations only through channels appropriate for the group.

## Retention and recovery

Self-hosted project owners control retention in Firebase Console. Closing a race does not delete it:
the room metadata and aggregate participant standings remain in Firestore as immutable final race
history, and the app keeps a local cached copy for people who saved the room. Removing saved race
history from one phone deletes only that phone's local copy; it does not delete the Firebase room or
another racer's copy. Leaving an open race removes that participant's cloud member record and local
copy. Permanently deleting a race from Firebase is a separate explicit owner cleanup, and it cannot
erase final standings that another phone already cached.

Closing a share stops new reader grants but does not remotely delete a recipient's downloaded file.
Deleting an artifact is an explicit owner operation subject to the rules.

Anonymous identity is installation-local. Uninstalling, clearing app data, or moving to a new phone
loses that credential. A racer can rejoin with an invite, but an owner cannot recover ownership
without a future account-linking or administrative recovery system.

A ban applies to the anonymous Firebase UID. Clearing app data creates a new UID and can bypass it.
Use this design for private friend or club groups, not adversarial public competitions with prizes.
