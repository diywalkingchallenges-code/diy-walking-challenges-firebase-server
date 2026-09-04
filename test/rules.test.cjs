const { after, before, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");
const {
  deleteObject,
  getBytes,
  listAll,
  ref,
  uploadBytes,
} = require("firebase/storage");

const projectId = "demo-diywc";
const ownerUid = "owner-user";
const readerUid = "reader-user";
let sha256 = "a".repeat(64);
const challengeFingerprint = "b".repeat(64);
const shareId = "A".repeat(43);
let objectPath = `walkpacks/${ownerUid}/${sha256}.walkpack`;
const bytes = Uint8Array.from([80, 75, 3, 4]);
let environment;
let testSequence = 0;

function artifactData(status) {
  return {
    v: 1,
    ownerUid,
    sha256,
    byteCount: bytes.byteLength,
    portablePackId: "diywc.pack.test",
    portableRevision: 1,
    objectPath,
    status,
    createdAtEpochMillis: 1,
    updatedAtEpochMillis: status === "uploading" ? 1 : 2,
    lastSyncedAt: serverTimestamp(),
  };
}

function shareData() {
  return {
    v: 1,
    ownerUid,
    sha256,
    byteCount: bytes.byteLength,
    portablePackId: "diywc.pack.test",
    portableRevision: 1,
    objectPath,
    thumbnailPath: "",
    featuredChallengeId: "challenge",
    challengeFingerprint,
    packTitle: "Test pack",
    challengeTitle: "Test challenge",
    challengeDescription: "",
    goalMeters: 5000,
    includedRouteCount: 1,
    isOpen: true,
    createdAtEpochMillis: 2,
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  };
}

function readerGrant(sourceType, sourceId, uid = readerUid) {
  return {
    v: 1,
    ownerUid,
    sha256,
    readerUid: uid,
    sourceType,
    sourceId,
    createdAtEpochMillis: 3,
    lastSyncedAt: serverTimestamp(),
  };
}

async function publishOwnerArtifact() {
  const owner = environment.authenticatedContext(ownerUid);
  const db = owner.firestore();
  const storage = owner.storage();
  const artifact = doc(db, "packArtifacts", ownerUid, "items", sha256);
  await assertSucceeds(setDoc(artifact, artifactData("uploading")));
  await assertSucceeds(uploadBytes(ref(storage, objectPath), bytes, {
    contentType: "application/vnd.diywalkingchallenges.walkpack+zip",
    customMetadata: { sha256, ownerUid },
  }));
  await assertSucceeds(updateDoc(artifact, {
    status: "ready",
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  }));
  return { owner, db, storage, artifact };
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { host: "127.0.0.1", port: 8080 },
    storage: { host: "127.0.0.1", port: 9199 },
  });
});

beforeEach(async () => {
  testSequence += 1;
  sha256 = testSequence.toString(16).padStart(64, "0");
  objectPath = `walkpacks/${ownerUid}/${sha256}.walkpack`;
  await environment.clearFirestore();
  await environment.clearStorage();
});

after(async () => {
  await environment.cleanup();
});

test("immutable artifact is readable only after a rules-validated share grant", async () => {
  const { db: ownerDb } = await publishOwnerArtifact();
  await assertSucceeds(setDoc(doc(ownerDb, "packShares", shareId), shareData()));

  const reader = environment.authenticatedContext(readerUid);
  const readerDb = reader.firestore();
  const readerStorage = reader.storage();
  await assertFails(getBytes(ref(readerStorage, objectPath)));
  await assertSucceeds(getDoc(doc(readerDb, "packShares", shareId)));
  await assertSucceeds(setDoc(
    doc(readerDb, "packArtifacts", ownerUid, "items", sha256, "readers", readerUid),
    readerGrant("share", shareId),
  ));
  const downloaded = await assertSucceeds(getBytes(ref(readerStorage, objectPath)));
  assert.deepEqual(Array.from(new Uint8Array(downloaded)), Array.from(bytes));
  await assertFails(listAll(ref(readerStorage, `walkpacks/${ownerUid}`)));
  await assertFails(getDocs(collection(readerDb, "packShares")));
  await assertFails(getDocs(collection(readerDb, "packArtifacts", ownerUid, "items")));
});

test("wrong MIME is denied", async () => {
  const owner = environment.authenticatedContext(ownerUid);
  const artifact = doc(owner.firestore(), "packArtifacts", ownerUid, "items", sha256);
  const object = ref(owner.storage(), objectPath);
  await assertSucceeds(setDoc(artifact, artifactData("uploading")));

  await assertFails(uploadBytes(object, bytes, {
    contentType: "application/zip",
    customMetadata: { sha256, ownerUid },
  }));
});

test("immutable object mutation is denied", async () => {
  const { storage } = await publishOwnerArtifact();
  const object = ref(storage, objectPath);
  await assertFails(uploadBytes(object, bytes, {
    contentType: "application/vnd.diywalkingchallenges.walkpack+zip",
    customMetadata: { sha256, ownerUid },
  }));
});

test("object deletion requires the artifact deleting transition", async () => {
  const { storage, artifact } = await publishOwnerArtifact();
  const object = ref(storage, objectPath);
  const outsider = environment.authenticatedContext("outsider-delete");
  await assertFails(deleteObject(ref(outsider.storage(), objectPath)));
  await assertFails(deleteObject(object));
  await assertSucceeds(updateDoc(
    artifact,
    { status: "deleting", updatedAtEpochMillis: 3, lastSyncedAt: serverTimestamp() },
  ));
  await assertSucceeds(deleteObject(object));
});

test("non-owner, bad paths, byte counts, and hashes cannot publish", async () => {
  const outsider = environment.authenticatedContext("outsider");
  await assertFails(setDoc(
    doc(outsider.firestore(), "packArtifacts", ownerUid, "items", sha256),
    artifactData("uploading"),
  ));

  const owner = environment.authenticatedContext(ownerUid);
  const ownerDb = owner.firestore();
  const ownerStorage = owner.storage();
  const badPath = artifactData("uploading");
  badPath.objectPath = `walkpacks/other/${sha256}.walkpack`;
  await assertFails(setDoc(doc(ownerDb, "packArtifacts", ownerUid, "items", sha256), badPath));
  await assertSucceeds(setDoc(
    doc(ownerDb, "packArtifacts", ownerUid, "items", sha256),
    artifactData("uploading"),
  ));
  await assertFails(uploadBytes(ref(ownerStorage, objectPath), Uint8Array.from([1, 2, 3]), {
    contentType: "application/vnd.diywalkingchallenges.walkpack+zip",
    customMetadata: { sha256, ownerUid },
  }));
  await assertFails(uploadBytes(ref(ownerStorage, objectPath), bytes, {
    contentType: "application/vnd.diywalkingchallenges.walkpack+zip",
    customMetadata: { sha256: "c".repeat(64), ownerUid },
  }));
});

test("closing a share blocks new reader grants", async () => {
  const { db } = await publishOwnerArtifact();
  const share = doc(db, "packShares", shareId);
  await assertSucceeds(setDoc(share, shareData()));
  await assertSucceeds(updateDoc(share, {
    isOpen: false,
    updatedAtEpochMillis: 3,
    lastSyncedAt: serverTimestamp(),
  }));
  const reader = environment.authenticatedContext(readerUid);
  await assertFails(setDoc(
    doc(reader.firestore(), "packArtifacts", ownerUid, "items", sha256, "readers", readerUid),
    readerGrant("share", shareId),
  ));
});

test("closed v2 races remain readable to members and freeze final standings", async () => {
  const { db } = await publishOwnerArtifact();
  const roomId = "R".repeat(43);
  const room = doc(db, "races", roomId);
  await assertSucceeds(setDoc(room, {
    v: 2,
    name: "Hosted race",
    packId: "diywc.pack.test",
    packRevision: 1,
    challengeId: "challenge",
    ownerParticipantId: "owner-participant",
    ownerAuthId: ownerUid,
    isOpen: true,
    deleting: false,
    createdAtEpochMillis: 1,
    updatedAtEpochMillis: 1,
    lastSyncedAt: serverTimestamp(),
    challengeFingerprint,
    artifactOwnerUid: ownerUid,
    artifactSha256: sha256,
    artifactByteCount: bytes.byteLength,
    artifactPortablePackId: "diywc.pack.test",
    artifactPortableRevision: 1,
    artifactObjectPath: objectPath,
    artifactThumbnailPath: "",
  }));
  const reader = environment.authenticatedContext(readerUid);
  const readerDb = reader.firestore();
  const readerGrantRef = doc(
    readerDb, "packArtifacts", ownerUid, "items", sha256, "readers", readerUid,
  );
  await assertSucceeds(setDoc(readerGrantRef, readerGrant("race", roomId)));
  const readerMember = doc(readerDb, "races", roomId, "members", readerUid);
  await assertSucceeds(setDoc(readerMember, {
    v: 2,
    participantId: "reader-participant",
    nickname: "Reader",
    packId: "another-pack",
    packRevision: 9,
    challengeId: "challenge",
    challengeFingerprint,
    progressMeters: 0,
    totalDistanceMeters: 0,
    sequence: 0,
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(room, {
    isOpen: false,
    updatedAtEpochMillis: 3,
    lastSyncedAt: serverTimestamp(),
  }));
  const finalRoom = await assertSucceeds(getDoc(doc(readerDb, "races", roomId)));
  assert.equal(finalRoom.data().isOpen, false);
  await assertSucceeds(getDocs(collection(readerDb, "races", roomId, "members")));
  await assertFails(updateDoc(readerMember, {
    progressMeters: 100,
    totalDistanceMeters: 100,
    sequence: 1,
    updatedAtEpochMillis: 4,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(room, {
    isOpen: true,
    updatedAtEpochMillis: 4,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(deleteDoc(readerMember));
  await assertFails(deleteDoc(doc(db, "races", roomId, "members", readerUid)));
  await assertSucceeds(setDoc(readerGrantRef, readerGrant("race", roomId)));
  const outsiderUid = "outsider";
  const outsider = environment.authenticatedContext(outsiderUid);
  const outsiderDb = outsider.firestore();
  await assertFails(setDoc(doc(outsiderDb, "races", roomId, "members", outsiderUid), {
    v: 2,
    participantId: "outsider-participant",
    nickname: "Outsider",
    packId: "outsider-pack",
    packRevision: 1,
    challengeId: "challenge",
    challengeFingerprint,
    progressMeters: 0,
    totalDistanceMeters: 0,
    sequence: 0,
    updatedAtEpochMillis: 4,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(
    doc(outsiderDb, "packArtifacts", ownerUid, "items", sha256, "readers", outsiderUid),
    readerGrant("race", roomId, outsiderUid),
  ));
  await assertSucceeds(updateDoc(room, {
    deleting: true,
    updatedAtEpochMillis: 5,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertSucceeds(deleteDoc(doc(db, "races", roomId, "members", readerUid)));
});

test("legacy v1 rooms remain creatable while room enumeration is denied", async () => {
  const owner = environment.authenticatedContext(ownerUid);
  const ownerDb = owner.firestore();
  const roomId = "C".repeat(43);
  await assertSucceeds(setDoc(doc(ownerDb, "races", roomId), {
    v: 1,
    name: "Legacy race",
    packId: "pack",
    packRevision: 1,
    challengeId: "challenge",
    ownerParticipantId: "participant",
    ownerAuthId: ownerUid,
    isOpen: true,
    deleting: false,
    createdAtEpochMillis: 1,
    updatedAtEpochMillis: 1,
    lastSyncedAt: serverTimestamp(),
  }));
  const reader = environment.authenticatedContext(readerUid);
  const readerDb = reader.firestore();
  await assertSucceeds(setDoc(doc(readerDb, "races", roomId, "members", readerUid), {
    v: 1,
    participantId: "reader-participant",
    nickname: "Reader",
    packId: "pack",
    packRevision: 1,
    challengeId: "challenge",
    progressMeters: 0,
    totalDistanceMeters: 0,
    sequence: 0,
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(getDocs(collection(readerDb, "races")));
});

test("v2 file-only races bind members by selected-route fingerprint without an artifact", async () => {
  const owner = environment.authenticatedContext(ownerUid);
  const ownerDb = owner.firestore();
  const roomId = "F".repeat(43);
  const room = doc(ownerDb, "races", roomId);
  await assertSucceeds(setDoc(room, {
    v: 2,
    name: "File shared race",
    packId: "diywc.pack.file",
    packRevision: 4,
    challengeId: "challenge",
    ownerParticipantId: "owner-participant",
    ownerAuthId: ownerUid,
    isOpen: true,
    deleting: false,
    createdAtEpochMillis: 1,
    updatedAtEpochMillis: 1,
    lastSyncedAt: serverTimestamp(),
    challengeFingerprint,
  }));
  await assertSucceeds(setDoc(doc(ownerDb, "races", roomId, "members", ownerUid), {
    v: 2,
    participantId: "owner-participant",
    nickname: "Owner",
    packId: "diywc.pack.file",
    packRevision: 5,
    challengeId: "challenge",
    challengeFingerprint,
    progressMeters: 0,
    totalDistanceMeters: 0,
    sequence: 1,
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  }));
});

function policyRoomData(version = 2, allowBankedDistance = false) {
  return {
    v: version, name: "No banked distance", packId: "diywc.pack.policy", packRevision: 1,
    challengeId: "challenge", ownerParticipantId: "owner-participant", ownerAuthId: ownerUid,
    isOpen: true, deleting: false, createdAtEpochMillis: 1, updatedAtEpochMillis: 1,
    lastSyncedAt: serverTimestamp(), allowBankedDistance,
    ...(version === 2 ? { challengeFingerprint } : {}),
  };
}

test("owner can create bank restrictions in v1 and file-only v2 rooms; recipient sees the policy", async () => {
  const ownerDb = environment.authenticatedContext(ownerUid).firestore();
  const readerDb = environment.authenticatedContext(readerUid).firestore();
  for (const [version, roomId] of [[1, "G".repeat(43)], [2, "H".repeat(43)]]) {
    await assertSucceeds(setDoc(doc(ownerDb, "races", roomId), policyRoomData(version)));
    const room = await assertSucceeds(getDoc(doc(readerDb, "races", roomId)));
    assert.equal(room.data().allowBankedDistance, false);
  }
  await assertFails(setDoc(doc(readerDb, "races", "I".repeat(43)), policyRoomData()));
});

test("bank policy must be boolean and cannot be rewritten by owner or participant", async () => {
  const ownerDb = environment.authenticatedContext(ownerUid).firestore();
  const readerDb = environment.authenticatedContext(readerUid).firestore();
  const roomId = "J".repeat(43);
  const room = doc(ownerDb, "races", roomId);
  await assertFails(setDoc(room, policyRoomData(2, "false")));
  await assertFails(setDoc(room, policyRoomData(2, null)));
  await assertSucceeds(setDoc(room, policyRoomData()));
  const change = { allowBankedDistance: true, updatedAtEpochMillis: 2, lastSyncedAt: serverTimestamp() };
  await assertFails(updateDoc(room, change));
  await assertFails(updateDoc(doc(readerDb, "races", roomId), change));
  await assertSucceeds(updateDoc(room, {
    isOpen: false, updatedAtEpochMillis: 2, lastSyncedAt: serverTimestamp(),
  }));
  assert.equal((await getDoc(room)).data().allowBankedDistance, false);
});

test("restricted hosted races keep valid artifacts and immutable policy", async () => {
  const { db } = await publishOwnerArtifact();
  const roomId = "K".repeat(43);
  await assertSucceeds(setDoc(doc(db, "races", roomId), {
    ...policyRoomData(),
    artifactOwnerUid: ownerUid, artifactSha256: sha256, artifactByteCount: bytes.byteLength,
    artifactPortablePackId: "diywc.pack.test", artifactPortableRevision: 1,
    artifactObjectPath: objectPath, artifactThumbnailPath: "",
  }));
});

test("file-only race fingerprint cannot disguise partial hosted metadata", async () => {
  const db = environment.authenticatedContext(ownerUid).firestore();
  const roomId = "L".repeat(43);
  await assertFails(setDoc(doc(db, "races", roomId), { ...policyRoomData(), artifactSha256: sha256 }));
  await assertFails(setDoc(doc(db, "races", roomId), { ...policyRoomData(), artifactThumbnailPath: "" }));
});

function memberData({
  uid,
  participantId,
  sequence = 0,
  progressMeters = 0,
  totalDistanceMeters = 0,
} = {}) {
  return {
    v: 2,
    participantId: participantId ?? `${uid}-participant`,
    nickname: uid === ownerUid ? "Owner" : "Racer",
    packId: "diywc.pack.policy",
    packRevision: 1,
    challengeId: "challenge",
    challengeFingerprint,
    progressMeters,
    totalDistanceMeters,
    sequence,
    updatedAtEpochMillis: sequence + 2,
    lastSyncedAt: serverTimestamp(),
  };
}

test("signed-out clients cannot read invite-addressed room or share metadata", async () => {
  const ownerDb = environment.authenticatedContext(ownerUid).firestore();
  const roomId = "M".repeat(43);
  await assertSucceeds(setDoc(doc(ownerDb, "races", roomId), policyRoomData()));

  const { db: artifactOwnerDb } = await publishOwnerArtifact();
  await assertSucceeds(setDoc(doc(artifactOwnerDb, "packShares", shareId), shareData()));

  const signedOutDb = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(signedOutDb, "races", roomId)));
  await assertFails(getDoc(doc(signedOutDb, "packShares", shareId)));
});

test("participants can update only their own immutable identity and increasing sequence", async () => {
  const roomId = "N".repeat(43);
  const ownerDb = environment.authenticatedContext(ownerUid).firestore();
  const readerDb = environment.authenticatedContext(readerUid).firestore();
  const outsiderDb = environment.authenticatedContext("member-outsider").firestore();
  await assertSucceeds(setDoc(doc(ownerDb, "races", roomId), policyRoomData()));
  await assertSucceeds(setDoc(
    doc(ownerDb, "races", roomId, "members", ownerUid),
    memberData({ uid: ownerUid, participantId: "owner-participant" }),
  ));
  const readerMember = doc(readerDb, "races", roomId, "members", readerUid);
  await assertSucceeds(setDoc(readerMember, memberData({ uid: readerUid })));

  await assertSucceeds(getDocs(collection(readerDb, "races", roomId, "members")));
  await assertFails(getDocs(collection(outsiderDb, "races", roomId, "members")));
  await assertFails(setDoc(
    doc(readerDb, "races", roomId, "members", "another-auth-id"),
    memberData({ uid: "another-auth-id" }),
  ));

  await assertSucceeds(updateDoc(readerMember, {
    progressMeters: 900,
    totalDistanceMeters: 950,
    sequence: 1,
    updatedAtEpochMillis: 3,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(readerMember, {
    progressMeters: 700,
    totalDistanceMeters: 950,
    sequence: 2,
    updatedAtEpochMillis: 4,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(readerMember, {
    progressMeters: 1000,
    sequence: 2,
    updatedAtEpochMillis: 5,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(readerMember, {
    participantId: "changed-participant",
    sequence: 3,
    updatedAtEpochMillis: 5,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(
    doc(ownerDb, "races", roomId, "members", readerUid),
    { progressMeters: 1, sequence: 3, updatedAtEpochMillis: 5, lastSyncedAt: serverTimestamp() },
  ));
});

test("only the owner can change allowed room state and immutable route fields stay fixed", async () => {
  const roomId = "O".repeat(43);
  const ownerDb = environment.authenticatedContext(ownerUid).firestore();
  const readerDb = environment.authenticatedContext(readerUid).firestore();
  const room = doc(ownerDb, "races", roomId);
  await assertSucceeds(setDoc(room, policyRoomData()));

  await assertFails(updateDoc(doc(readerDb, "races", roomId), {
    isOpen: false,
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(room, {
    challengeId: "another-challenge",
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(room, {
    name: "Renamed race",
    isOpen: false,
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  }));
});

test("owner bans block joining and cannot be removed by the banned client", async () => {
  const roomId = "P".repeat(43);
  const ownerDb = environment.authenticatedContext(ownerUid).firestore();
  const readerDb = environment.authenticatedContext(readerUid).firestore();
  await assertSucceeds(setDoc(doc(ownerDb, "races", roomId), policyRoomData()));
  const ban = doc(ownerDb, "races", roomId, "bans", readerUid);
  await assertSucceeds(setDoc(ban, {
    v: 1,
    updatedAtEpochMillis: 2,
    lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(setDoc(
    doc(readerDb, "races", roomId, "members", readerUid),
    memberData({ uid: readerUid }),
  ));
  await assertFails(deleteDoc(doc(readerDb, "races", roomId, "bans", readerUid)));
  await assertFails(updateDoc(doc(readerDb, "races", roomId, "bans", readerUid), {
    updatedAtEpochMillis: 3,
    lastSyncedAt: serverTimestamp(),
  }));
});

test("thumbnail paths are immutable, non-listable, and use the artifact reader grant", async () => {
  const { db, storage } = await publishOwnerArtifact();
  const thumbnailPath = `walkpack-thumbnails/${ownerUid}/${sha256}/${challengeFingerprint}.webp`;
  const thumbnail = ref(storage, thumbnailPath);
  const thumbnailBytes = Uint8Array.from([82, 73, 70, 70]);
  const metadata = {
    contentType: "image/webp",
    customMetadata: { sha256, ownerUid, challengeFingerprint },
  };
  await assertSucceeds(uploadBytes(thumbnail, thumbnailBytes, metadata));
  await assertFails(uploadBytes(thumbnail, thumbnailBytes, metadata));

  const reader = environment.authenticatedContext(readerUid);
  await assertFails(getBytes(ref(reader.storage(), thumbnailPath)));
  await assertSucceeds(setDoc(doc(db, "packShares", shareId), shareData()));
  await assertSucceeds(setDoc(
    doc(reader.firestore(), "packArtifacts", ownerUid, "items", sha256, "readers", readerUid),
    readerGrant("share", shareId),
  ));
  const downloaded = await assertSucceeds(getBytes(ref(reader.storage(), thumbnailPath)));
  assert.deepEqual(Array.from(new Uint8Array(downloaded)), Array.from(thumbnailBytes));
  await assertFails(listAll(ref(reader.storage(), `walkpack-thumbnails/${ownerUid}/${sha256}`)));
});
