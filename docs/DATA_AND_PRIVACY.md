# Data and privacy boundary

This document describes the Firebase data boundary implemented by the checked-in rules. It is not a
substitute for the privacy policy of an app distributor or the Firebase and Google Cloud terms.

## Data used for live races

The app stores:

- the room name and high-entropy room ID;
- route, pack, revision, and selected-route fingerprint identifiers;
- room owner, open/closing state, and the room's banked-distance policy;
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
- Participants update only their own member document.
- Owners manage room state, membership removal, and bans.
- Hosted files are immutable and readable only by the owner or an exact rules-validated reader
  grant tied to an open share or matching race.
- Unknown collections and Storage paths are denied by default.

An invitation is a bearer credential: anyone who receives it may use its intended access while it
remains open. Send invitations only through channels appropriate for the group.

## Retention and recovery

Self-hosted project owners control retention in Firebase Console. Closing a share stops new reader
grants but does not remotely delete a recipient's downloaded file. Deleting a member, room, or
artifact is an explicit owner operation subject to the rules.

Anonymous identity is installation-local. Uninstalling, clearing app data, or moving to a new phone
loses that credential. A racer can rejoin with an invite, but an owner cannot recover ownership
without a future account-linking or administrative recovery system.

A ban applies to the anonymous Firebase UID. Clearing app data creates a new UID and can bypass it.
Use this design for private friend or club groups, not adversarial public competitions with prizes.
