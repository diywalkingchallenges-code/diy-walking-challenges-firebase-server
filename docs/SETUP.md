# Set up a Firebase race server

Firebase is a Google service that DIY Walking Challenges can use for live race standings. A group
organizer creates one project, publishes the safety rules in this repository, and shares the
project's Android configuration file with the racers.

The basic race server can use Firebase's **Spark** plan. It does not need a payment method. If you
also want to share complete route packs through private links, finish this guide first and then
follow [Enable private route links](HOSTED_PACKS.md).

## Before you begin

The organizer needs:

- a Google account;
- access to the [Firebase Console](https://console.firebase.google.com/);
- DIY Walking Challenges installed on an Android phone; and
- this repository's `firestore.rules` and `firestore.indexes.json` files.

The other racers do not need Firebase accounts. They will only import a file received from the
organizer.

## Organizer: create the server

### 1. Create one Firebase project

1. Open the [Firebase Console](https://console.firebase.google.com/) and select **Create a project**.
2. Give it a recognizable name, such as `Our Walking Group`.
3. Leave Google Analytics off. DIY Walking Challenges does not use Firebase Analytics.
4. Select **Create project** and wait for the project dashboard to open.

One project can support all of the group's race rooms. Firebase quotas belong to the project, not
to each room.

### 2. Create the Firestore database

1. In the left menu, open **Build → Firestore Database**. Firebase may group this under
   **Databases & Storage**.
2. Select **Create database**.
3. Choose **Standard edition** and the database ID **`(default)`**.
4. Choose **Production mode**. Access will remain blocked until the supplied rules are published.
5. Choose a region near most racers, then finish creation. This location cannot be changed later.

Do not leave the database in test mode. Test mode is intentionally permissive and does not protect
private race data.

### 3. Turn on anonymous sign-in

1. Open **Build → Authentication** and select **Get started**.
2. Open **Sign-in method**.
3. Add or select the **Anonymous** provider, turn it on, and save.
4. If Firebase offers automatic deletion of anonymous users, leave it off.

The app uses a random Firebase identity for room ownership and membership. The host should install
updates over the existing app rather than uninstalling it. Clearing app data or uninstalling loses
that identity, so an accountless room owner cannot recover ownership afterward.

### 4. Register DIY Walking Challenges

1. Open **Project settings → General**.
2. Under **Your apps**, choose **Add app**, then select the Android icon.
3. Enter this package name exactly:

   ```text
   local.diywalkingchallenges
   ```

4. The nickname is optional. Certificate fingerprints are not required for anonymous race sync.
5. Select **Register app**, then select **Download google-services.json**.

Do not copy the words `google-services.json` into Firebase. It is the name of the file Firebase
creates. Import that downloaded file into the app. The placeholder in
`examples/google-services.example.json` is only for recognizing its shape and will not connect.

The Android configuration contains project identifiers and an Android API key with limited client
use. It is not an administrator key. Even so, share it only with the group's racers to prevent
accidental connections to the wrong project.

Never import or distribute a service-account JSON file, Admin SDK private key, OAuth client secret,
Google password, recovery code, or Firebase CLI token. DIY Walking Challenges does not need them.

### 5. Publish the Firestore safety rules

The easiest phone-friendly path is:

1. In DIY Walking Challenges, open **Race → Cloud rooms → Manage → Add race server**.
2. Choose **Create a new server** and advance to the Firestore rules step.
3. Select **Copy supplied Firestore rules**.
4. In Firebase Console, open **Firestore Database → Rules**.
5. Replace the editor contents, then select **Publish**.

Do not paste rules into the **Data** tab.

Repository maintainers can deploy the same files with Node.js and the official Firebase CLI:

```bash
npm ci
npx firebase login
npx firebase deploy --only "firestore:rules,firestore:indexes" --project YOUR_PROJECT_ID
```

Replace `YOUR_PROJECT_ID` with the immutable project ID shown in **Project settings**, not the
friendly project name or numeric project number. This repository deliberately has no `.firebaserc`;
the explicit `--project` guard helps prevent deploying to the wrong server.

### 6. Import the server on the organizer's phone

In the app's **Create a new server** guide, select **Import google-services.json** directly under
the Android-download step and choose the file from step 4. Name the connection and select it in the
race-server dropdown.

Creating the first room can take a little longer while Firebase finishes provisioning the project
and the phone completes its first anonymous sign-in. The app can keep the operation pending and
notify you instead of requiring the screen to remain open.

## Racers: join a server the organizer already created

The organizer sends each racer two different things as needed:

- `google-services.json` connects the app to the group's Firebase project.
- A race invitation identifies one room on that project.

On each racer's phone:

1. Open **Race → Cloud rooms → Manage → Add race server**.
2. Choose **Join an existing server**.
3. Select **Import server file** and choose the organizer's current `google-services.json`.
4. Open or scan the race invitation.

Every phone imports the same Android configuration, but Firebase gives each installation its own
anonymous identity. Racers do not need the organizer's Google login or access to the Firebase
Console.

A `.walkpack` is different: it contains routes, maps, milestones, prerequisites, and artwork. The
app asks for a `.walkpack` only when a race needs a route that is not installed and the server is not
hosting that file. It is never used to connect to Firebase.

## Free-plan expectations

Firebase currently gives one Firestore database per project a no-cost allowance that includes
1 GiB stored data, 50,000 document reads per day, 20,000 writes per day, 20,000 deletes per day,
and 10 GiB monthly outbound transfer. Quotas and pricing can change, so check the official
[Cloud Firestore pricing and quota page](https://firebase.google.com/docs/firestore/pricing) before
using the server for a large community.

For a household or small private group, one project is generally much simpler than several. If a
quota is exhausted, Firebase may pause affected operations until it resets. DIY Walking Challenges
still supports offline QR and `.walksync` sharing.

## Troubleshooting

- **The app rejects the file:** verify the registered Android package is exactly
  `local.diywalkingchallenges` and that the file came from the Android-app registration page.
- **Permission denied:** verify Anonymous Authentication is enabled and the current
  `firestore.rules` is published.
- **Wrong server opens:** compare the immutable project ID in the app connection with the project
  settings page. Do not compare only the friendly names.
- **A room owner lost control:** clearing app data or uninstalling loses the anonymous owner
  identity. Create a replacement room; the rules intentionally cannot transfer ownership.
- **A route is missing:** send the complete `.walkpack`, or enable the optional hosted-pack setup.

See Firebase's official [Android setup guide](https://firebase.google.com/docs/android/setup),
[Anonymous Authentication guide](https://firebase.google.com/docs/auth/android/anonymous-auth), and
[Firestore rules guide](https://firebase.google.com/docs/firestore/security/get-started) for the
provider's current console wording.
