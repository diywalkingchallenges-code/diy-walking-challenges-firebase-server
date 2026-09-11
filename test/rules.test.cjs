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
  writeBatch, query, where, orderBy, limit, startAfter, endBefore, limitToLast, runTransaction, documentId,
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

function socialData(publicLeaderboard = false) {
  return { nickname: "Social tester", icon: "", publicLeaderboard, updatedAt: serverTimestamp(),
    totalMeters: 100, recordedMeters: 70, manualMeters: 20, otherMeters: 10,
    medals: 3, racesFinished: 2, racesWon: 1 };
}
async function socialProfile(uid, isPublic = false) {
  const db = environment.authenticatedContext(uid).firestore();
  const batch = writeBatch(db);
  const data = socialData(isPublic);
  batch.set(doc(db, "socialProfiles", uid), data);
  batch.set(doc(db, "friendCards", uid), { nickname: data.nickname, icon: "" });
  if (isPublic) batch.set(doc(db, "leaderboard", uid), data);
  else batch.delete(doc(db, "leaderboard", uid));
  await assertSucceeds(batch.commit());
  return db;
}
async function requestSocialFriend(a = "alice", b = "bob") {
  const db = await socialProfile(a);
  await socialProfile(b);
  const id = [a, b].sort().join("_");
  const ref = doc(db, "friendships", id);
  await assertSucceeds(getDoc(ref)); // transaction must be able to read a missing relationship
  await assertSucceeds(changeFriend(db, a, b, "request"));
  return { db, id };
}
test("social: private profiles and trophies require accepted friendship, including lists", async () => {
  const { db, id } = await requestSocialFriend();
  const bob = environment.authenticatedContext("bob").firestore();
  const outsider = environment.authenticatedContext("eve").firestore();
  await setDoc(doc(db, "socialProfiles", "alice", "trophies", "medal"), { title: "Test medal", earnedAt: 100, image: "" });
  await assertFails(getDoc(doc(bob, "socialProfiles", "alice")));
  await assertFails(getDocs(collection(bob, "socialProfiles", "alice", "trophies")));
  await assertSucceeds(getDoc(doc(bob, "friendCards", "alice")));
  await assertFails(getDocs(collection(bob, "friendCards")));
  await assertFails(getDocs(collection(bob, "socialProfiles")));
  await assertFails(updateDoc(doc(db, "friendships", id), { status: "accepted" }));
  await assertFails(updateDoc(doc(outsider, "friendships", id), { status: "accepted" }));
  await assertSucceeds(changeFriend(bob, "bob", "alice", "accept"));
  await assertSucceeds(getDoc(doc(bob, "socialProfiles", "alice")));
  await assertSucceeds(getDocs(query(collection(bob, "socialProfiles", "alice", "trophies"), orderBy("earnedAt", "desc"), orderBy("__name__", "desc"), limit(24))));
  await assertFails(getDoc(doc(outsider, "socialProfiles", "alice")));
  await assertSucceeds(getDocs(query(collection(bob, "friendships"), where("members", "array-contains", "bob"), limit(25))));
  await assertFails(getDocs(collection(bob, "friendships")));
  await assertFails(setDoc(doc(bob, "socialProfiles", "alice", "trophies", "fake"), { title: "Forged", earnedAt: 100, image: "" }));
  await assertSucceeds(changeFriend(bob, "bob", "alice", "remove"));
  await assertFails(getDoc(doc(bob, "socialProfiles", "alice")));
});
test("social: blocking revokes access and only blocker can unblock", async () => {
  const { db, id } = await requestSocialFriend();
  const bob = environment.authenticatedContext("bob").firestore();
  await changeFriend(bob, "bob", "alice", "accept");
  await assertSucceeds(changeFriend(db, "alice", "bob", "block"));
  await assertFails(getDoc(doc(bob, "socialProfiles", "alice")));
  await assertFails(deleteDoc(doc(bob, "friendships", id)));
  await assertFails(updateDoc(doc(bob, "friendships", id), { status: "accepted", blockedBy: "" }));
  await assertSucceeds(changeFriend(db, "alice", "bob", "remove"));
});
test("social: public opt-in exposes summary only, pagination works, opt-out is atomic", async () => {
  const db = await socialProfile("alice", true);
  await socialProfile("bob", true);
  const reader = environment.authenticatedContext("reader").firestore();
  await assertSucceeds(getDoc(doc(reader, "leaderboard", "alice")));
  await assertFails(getDoc(doc(reader, "socialProfiles", "alice")));
  await assertFails(getDocs(collection(reader, "socialProfiles", "alice", "trophies")));
  const page = await assertSucceeds(getDocs(query(collection(reader, "leaderboard"), orderBy("totalMeters", "desc"), orderBy("__name__", "desc"), limit(1))));
  const second = await assertSucceeds(getDocs(query(collection(reader, "leaderboard"), orderBy("totalMeters", "desc"), orderBy("__name__", "desc"), startAfter(page.docs[0]), limit(1))));
  assert.notEqual(page.docs[0].id, second.docs[0].id);
  await assertFails(getDocs(query(collection(reader, "leaderboard"), limit(26))));
  await assertFails(updateDoc(doc(db, "socialProfiles", "alice"), { publicLeaderboard: false, updatedAt: serverTimestamp() }));
  await socialProfile("alice", false);
  assert.equal((await getDoc(doc(reader, "leaderboard", "alice"))).exists(), false);
  await assertFails(setDoc(doc(db, "leaderboard", "alice"), socialData(true)));
  await assertFails(setDoc(doc(reader, "leaderboard", "bob"), socialData(true)));
  await assertFails(setDoc(doc(db, "socialProfiles", "alice"), { ...socialData(), medals: -1 }));
  await assertFails(setDoc(doc(db, "socialProfiles", "alice"), { ...socialData(), homeAddress: "private" }));
});
test("social: race invites require friendship and room membership; acceptance requires joining", async () => {
  const { db, id } = await requestSocialFriend();
  const bob = environment.authenticatedContext("bob").firestore();
  const roomId = "S".repeat(43);
  await environment.withSecurityRulesDisabled(async ctx => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, "races", roomId), { name: "Friends race", isOpen: true, deleting: false });
    await setDoc(doc(admin, "races", roomId, "members", "alice"), { progressMeters: 100, updatedAtEpochMillis: 200 });
  });
  const inviteId = `${roomId}_alice_bob`;
  const invite = { fromUid: "alice", toUid: "bob", roomId, roomName: "Friends race", status: "pending", createdAt: serverTimestamp() };
  await assertSucceeds(getDoc(doc(db, "socialInvites", inviteId)));
  await assertFails(setDoc(doc(db, "socialInvites", inviteId), invite));
  await changeFriend(bob, "bob", "alice", "accept");
  await assertSucceeds(setDoc(doc(db, "socialInvites", inviteId), invite));
  await assertSucceeds(getDocs(query(collection(bob, "socialInvites"), where("toUid", "==", "bob"), limit(25))));
  await assertFails(getDocs(collection(bob, "socialInvites")));
  await assertFails(updateDoc(doc(db, "socialInvites", inviteId), { status: "accepted" }));
  await assertFails(updateDoc(doc(bob, "socialInvites", inviteId), { status: "accepted" }));
  await assertFails(updateDoc(doc(bob, "socialInvites", inviteId), { roomName: "Forged" }));
  await environment.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), "races", roomId, "members", "bob"), { progressMeters: 0, updatedAtEpochMillis: 200 }));
  await assertSucceeds(updateDoc(doc(bob, "socialInvites", inviteId), { status: "accepted" }));
  await assertFails(setDoc(doc(db, "races", roomId, "socialFinishes", "bob"), { goalMeters: 100, finishedAt: 100 }));
  await assertSucceeds(setDoc(doc(db, "races", roomId, "socialFinishes", "alice"), { goalMeters: 100, finishedAt: 100 }));
  await assertFails(setDoc(doc(db, "races", roomId, "socialFinishes", "alice"), { goalMeters: 100, finishedAt: 300 }));
  await assertFails(setDoc(doc(bob, "races", roomId, "socialFinishes", "bob"), { goalMeters: 100, finishedAt: 100 }));
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

test("only the owner can edit a live race name and boolean bank policy; closed rules and identities stay fixed", async () => {
  const ownerDb = environment.authenticatedContext(ownerUid).firestore();
  const readerDb = environment.authenticatedContext(readerUid).firestore();
  const roomId = "J".repeat(43);
  const room = doc(ownerDb, "races", roomId);
  await assertFails(setDoc(room, policyRoomData(2, "false")));
  await assertFails(setDoc(room, policyRoomData(2, null)));
  await assertSucceeds(setDoc(room, policyRoomData()));
  const change = { allowBankedDistance: true, updatedAtEpochMillis: 2, lastSyncedAt: serverTimestamp() };
  await assertSucceeds(updateDoc(room, { ...change, name: "Renamed race" }));
  await assertFails(updateDoc(doc(readerDb, "races", roomId), { ...change, name: "Hijacked" }));
  await assertFails(updateDoc(room, { ...change, allowBankedDistance: "false" }));
  await assertFails(updateDoc(room, { ...change, ownerAuthId: readerUid }));
  await assertFails(updateDoc(room, { ...change, challengeId: "different-route" }));
  await assertFails(updateDoc(room, { ...change, name: "" }));
  await assertSucceeds(updateDoc(room, {
    isOpen: false, updatedAtEpochMillis: 2, lastSyncedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(room, { ...change, allowBankedDistance: false }));
  await assertSucceeds(updateDoc(room, { name: "Final race title", updatedAtEpochMillis: 3, lastSyncedAt: serverTimestamp() }));
  const finalRoom = (await getDoc(room)).data();
  assert.equal(finalRoom.name, "Final race title");
  assert.equal(finalRoom.allowBankedDistance, true);
  assert.equal(finalRoom.isOpen, false);
});

test("restricted hosted races keep valid artifacts", async () => {
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

// Exercise the same four-document atomic protocol as Android, with no privileged writes.
async function changeFriend(db, actor, other, action) {
  return runTransaction(db, async tx => {
    const ref = doc(db, "friendships", [actor, other].sort().join("_"));
    const before = (await tx.get(ref)).data();
    const after = action === "request" ? { members: [actor, other].sort(), fromUid: actor, status: "pending", blockedBy: "" }
      : action === "accept" ? { ...before, status: "accepted" }
      : action === "block" ? { ...before, status: "blocked", blockedBy: actor } : undefined;
    const caps = [];
    for (const uid of [actor, other]) {
      const cap = doc(db, "socialCapacity", uid);
      const value = (await tx.get(cap)).data() || { friends: 0, incoming: 0, outgoing: 0 };
      const counts = e => e?.status === "accepted" ? { friends: 1, incoming: 0, outgoing: 0 }
        : e?.status === "pending" ? { friends: 0, incoming: e.fromUid === uid ? 0 : 1, outgoing: e.fromUid === uid ? 1 : 0 }
        : { friends: 0, incoming: 0, outgoing: 0 };
      const a=counts(before), b=counts(after);
      caps.push([cap, Object.fromEntries(Object.keys(value).map(k=>[k, value[k]-a[k]+b[k]]))]);
    }
    tx.set(doc(db, "socialChanges", actor), { otherUid: other, at: serverTimestamp() });
    caps.forEach(([ref, value])=>tx.set(ref, value));
    if (after) tx.set(ref, after); else tx.delete(ref);
  });
}
async function seedCapacity(uid, values) {
  await environment.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(), "socialCapacity", uid), { friends: 0, incoming: 0, outgoing: 0, ...values }));
}
test("social limits: cannot reset, forge, skip, or delete capacity counters", async () => {
  const {db, id}=await requestSocialFriend();
  const bob=environment.authenticatedContext("bob").firestore();
  for (const uid of ["alice", "bob"]) {
    await assertFails(setDoc(doc(db,"socialCapacity",uid), {friends:0,incoming:0,outgoing:0}));
    await assertFails(deleteDoc(doc(db,"socialCapacity",uid)));
  }
  await assertFails(getDocs(query(collection(db,"socialCapacity"),limit(25))));
  await assertFails(getDoc(doc(bob,"socialChanges","alice")));
  await assertFails(updateDoc(doc(bob,"friendships",id), {status:"accepted"}));
  await assertFails(deleteDoc(doc(db,"friendships",id)));
  const batch=writeBatch(db);
  batch.set(doc(db,"socialChanges","alice"),{otherUid:"bob",at:serverTimestamp()});
  batch.set(doc(db,"socialCapacity","alice"),{friends:0,incoming:0,outgoing:0});
  await assertFails(batch.commit());
  await assertSucceeds(changeFriend(bob,"bob","alice","accept"));
  assert.deepEqual((await getDoc(doc(db,"socialCapacity","alice"))).data(), {friends:1,incoming:0,outgoing:0});
  await assertSucceeds(changeFriend(db,"alice","bob","block"));
  assert.deepEqual((await getDoc(doc(db,"socialCapacity","alice"))).data(), {friends:0,incoming:0,outgoing:0});
  await assertFails(changeFriend(bob,"bob","alice","request"));
  await assertSucceeds(changeFriend(db,"alice","bob","remove"));
});
test("social limits: pending boundary and concurrent senders cannot exceed 50", async () => {
  const alice=await socialProfile("alice"), bob=await socialProfile("bob"), carol=await socialProfile("carol");
  await seedCapacity("bob",{incoming:49});
  const results=await Promise.allSettled([changeFriend(alice,"alice","bob","request"),changeFriend(carol,"carol","bob","request")]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await getDoc(doc(bob,"socialCapacity","bob"))).data().incoming,50);
  await seedCapacity("alice",{outgoing:50});
  await assertFails(changeFriend(alice,"alice","carol","request"));
});
test("social limits: 200 friends, simultaneous accepts, and removal release capacity", async () => {
  const alice=await socialProfile("alice"), bob=await socialProfile("bob"), carol=await socialProfile("carol");
  await changeFriend(bob,"bob","alice","request");
  await changeFriend(carol,"carol","alice","request");
  await seedCapacity("alice",{friends:199,incoming:2});
  const results=await Promise.allSettled([changeFriend(alice,"alice","bob","accept"),changeFriend(alice,"alice","carol","accept")]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal((await getDoc(doc(alice,"socialCapacity","alice"))).data().friends,200);
  const accepted=results[0].status==="fulfilled"?"bob":"carol", pending=accepted==="bob"?"carol":"bob";
  await changeFriend(alice,"alice",accepted,"remove");
  await assertSucceeds(changeFriend(alice,"alice",pending,"accept"));
  assert.equal((await getDoc(doc(alice,"socialCapacity","alice"))).data().friends,200);
});
test("social scaling: thousands of tied leaderboard entries page both ways with bounded reads", async () => {
  await environment.withSecurityRulesDisabled(async ctx => {
    const db=ctx.firestore();
    for(let start=0;start<2500;start+=250) {
      const batch=writeBatch(db);
      for(let i=start;i<start+250;i++) batch.set(doc(db,"leaderboard",`racer${String(i).padStart(4,"0")}`),{...socialData(true), totalMeters:Math.floor(i/3)});
      await batch.commit();
    }
  });
  const db=environment.authenticatedContext("viewer").firestore();
  const base=query(collection(db,"leaderboard"),orderBy("totalMeters","desc"),orderBy(documentId(),"desc"));
  let cursor, previous, count=0;
  const ids=new Set();
  for(let i=0;i<100;i++) {
    const page=await getDocs(cursor?query(base,startAfter(cursor),limit(25)):query(base,limit(25)));
    assert.equal(page.size,25);
    for(const row of page.docs) {assert(!ids.has(row.id));ids.add(row.id);}
    if(previous) {
      const back=await getDocs(query(base,endBefore(page.docs[0]),limitToLast(25)));
      assert.deepEqual(back.docs.map(d=>d.id),previous);
    }
    previous=page.docs.map(d=>d.id);cursor=page.docs.at(-1);count+=page.size;
  }
  assert.equal(count,2500);
  assert.equal((await getDocs(query(base,startAfter(cursor),limit(25)))).size,0);
  await assertFails(getDocs(query(base,limit(26))));
});
test("social scaling: each friends category is paged and unbounded queries are rejected", async () => {
  await environment.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    const batch=writeBatch(db);
    for(let i=0;i<175;i++) {
      const other=`user${String(i).padStart(3,"0")}`;
      batch.set(doc(db,"friendships",`alice_${other}`),{members:["alice",other],fromUid:i<100?"alice":other,status:i<75?"accepted":i<125?"pending":"blocked",blockedBy:i>=125?"alice":""});
    }
    await batch.commit();
  });
  const db=environment.authenticatedContext("alice").firestore();
  const base=query(collection(db,"friendships"),where("members","array-contains","alice"));
  for(const parts of [ [where("status","==","accepted")], [where("status","==","pending"),where("fromUid","==","alice")],
    [where("status","==","pending"),where("fromUid","!=","alice"),orderBy("fromUid")], [where("status","==","blocked"),where("blockedBy","==","alice")] ]) {
    const q=query(base,...parts,orderBy(documentId()));
    const first=await assertSucceeds(getDocs(query(q,limit(25))));assert.equal(first.size,25);
    const second=await assertSucceeds(getDocs(query(q,startAfter(first.docs.at(-1)),limit(25))));assert(second.size<=25);
  }
  await assertFails(getDocs(base));
  await assertFails(getDocs(query(base,limit(301))));
  await assertFails(getDocs(query(base,where("status","==","blocked"),limit(26))));
  assert.equal((await assertSucceeds(getDocs(query(base,where("status","in",["accepted","pending"]),limit(300))))).size,125);
});

test("social migration: preserves legacy edges, rebuilds capacity, is repeatable, and locks writes", async () => {
  const alice = await socialProfile("alice"), bob = await socialProfile("bob");
  await socialProfile("carol");
  await environment.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db,"friendships","alice_bob"), {members:["alice","bob"],fromUid:"alice",status:"accepted",blockedBy:""});
    await setDoc(doc(db,"friendships","alice_carol"), {members:["alice","carol"],fromUid:"carol",status:"pending",blockedBy:""});
  });
  const {spawnSync} = require('node:child_process');
  for(let i=0;i<2;i++) {
    const run=spawnSync(process.execPath,['tools/migrate-social-capacity.cjs','--project','demo-diywc','--apply'],{
      env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'},encoding:'utf8',timeout:20000
    });
    assert.equal(run.status,0,run.stderr);
  }
  assert.deepEqual((await getDoc(doc(alice,"socialCapacity","alice"))).data(),{friends:1,incoming:1,outgoing:0});
  assert.equal((await getDoc(doc(alice,"friendships","alice_bob"))).data().status,"accepted");
  await environment.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),"socialMaintenance","capacity"),{purpose:"social-capacity-v1"}));
  await assertFails(changeFriend(alice,"alice","bob","remove"));
  await assertFails(changeFriend(alice,"alice","carol","accept"));
  await assertFails(deleteDoc(doc(alice,"socialMaintenance","capacity")));
  await environment.withSecurityRulesDisabled(ctx=>deleteDoc(doc(ctx.firestore(),"socialMaintenance","capacity")));
  await assertSucceeds(changeFriend(alice,"alice","bob","remove"));
});

test("social notifications: invitation cursor crosses equal timestamps without replay or skipped pages", async () => {
  await environment.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore(), batch=writeBatch(db);
    for(let i=0;i<60;i++) batch.set(doc(db,"socialInvites",`invite${String(i).padStart(3,'0')}`),{fromUid:"alice",toUid:"bob",roomId:"room",roomName:"Race",status:i%2?"pending":"dismissed",createdAt:serverTimestamp()});
    await batch.commit();
  });
  const db=environment.authenticatedContext("bob").firestore();
  const q=query(collection(db,"socialInvites"),where("toUid","==","bob"),orderBy("createdAt"),orderBy(documentId()));
  let last, total=0; const ids=new Set();
  for(let i=0;i<3;i++) {
    const docs=(await getDocs(last?query(q,startAfter(last.get('createdAt'),last.id),limit(25)):query(q,limit(25)))).docs;
    assert(docs.length<=25);total+=docs.length;docs.forEach(d=>{assert(!ids.has(d.id));ids.add(d.id)});last=docs.at(-1);
  }
  assert.equal(total,60);
  assert.equal((await getDocs(query(q,startAfter(last.get('createdAt'),last.id),limit(25)))).size,0);
});

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


test("bounded racer icons can be shared, replaced and removed only by their participant", async () => {
  const roomId = "I".repeat(43);
  const ownerDb = environment.authenticatedContext(ownerUid).firestore();
  const readerDb = environment.authenticatedContext(readerUid).firestore();
  await assertSucceeds(setDoc(doc(ownerDb, "races", roomId), policyRoomData()));
  const member = doc(readerDb, "races", roomId, "members", readerUid);
  const icon = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";
  await assertSucceeds(setDoc(member, { ...memberData({ uid: readerUid }), racerIcon: icon }));
  await assertFails(setDoc(member, { ...memberData({ uid: readerUid, sequence: 1 }), racerIcon: "UklGR" + "A".repeat(680) }));
  await assertFails(setDoc(member, { ...memberData({ uid: readerUid, sequence: 1 }), racerIcon: "https://example.com/image" }));
  await assertFails(setDoc(doc(ownerDb, "races", roomId, "members", readerUid),
    { ...memberData({ uid: readerUid, sequence: 1 }), racerIcon: icon }));
  await assertSucceeds(setDoc(member, { ...memberData({ uid: readerUid, sequence: 1 }), racerIcon: icon }));
  await assertSucceeds(setDoc(member, memberData({ uid: readerUid, sequence: 2 })));
  assert.equal((await getDoc(member)).data().racerIcon, undefined);
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
