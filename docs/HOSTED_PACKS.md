# Enable private route links

This is an optional addition to the basic race server. Without it, live standings still work and
organizers can share a complete route pack using **Send pack file** or **Save pack file**.

With Firebase Storage enabled, the app can upload an immutable `.walkpack` once and reuse it for
private route links and race-assisted installation.

## Cost choice

Cloud Storage for Firebase requires the pay-as-you-go **Blaze** plan. Blaze has no fixed monthly
subscription, and eligible no-cost allowances still apply, but a billing account is required and
usage beyond those allowances can create charges. Budget alerts notify you; they are not hard
spending limits.

Before continuing, review:

- [Firebase's Storage billing requirement](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
- [Firebase pricing](https://firebase.google.com/pricing)
- [Google Cloud budget alerts](https://cloud.google.com/billing/docs/how-to/budgets)

If any possible charge is unacceptable, stay on Spark and use `.walkpack` files. That is a fully
supported path, not a reduced race mode.

## Organizer setup

1. Complete [the basic Firebase setup](SETUP.md).
2. In Firebase Console, upgrade the project to **Blaze** and attach the intended billing account.
3. Open **Databases & Storage → Storage**, select **Get started**, and create the default bucket.
4. Choose the bucket location carefully; it cannot be changed later. Firebase currently identifies
   `us-central1`, `us-east1`, and `us-west1` as eligible for Google Cloud Storage's Always Free
   allowance. Confirm the current list in the
   [official Storage guide](https://firebase.google.com/docs/storage/web/start).
5. In DIY Walking Challenges' server guide, copy the supplied Storage rules. Open
   **Storage → Rules** in Firebase Console, replace the editor, and publish.
6. If Firebase asks to let Storage rules read Firestore authorization records, approve the
   documented cross-service permission. These rules use Firestore metadata to decide whether a
   recipient may download a file.
7. Download `google-services.json` again from **Project settings → Your apps**.
8. In the app's saved-server manager, edit this server and select **Update configuration file**.
9. Send the refreshed file to every racer so their saved server can discover the bucket.
10. Configure conservative budget alerts before distributing hosted links broadly.

The CLI equivalent for step 5 is:

```bash
npx firebase deploy --only "firestore:rules,firestore:indexes,storage" --project YOUR_PROJECT_ID
```

Use the same rules release for Firestore and Storage. Publishing only one side can block legitimate
transfers or leave an obsolete authorization path active.

## What is uploaded

Selecting **Share route link** publishes the selected route's complete containing `.walkpack`, not
the original image by itself. The pack includes its routes, prerequisites, map, badge, milestone
art, and other referenced artwork. Only share content you have permission to distribute.

The app:

- caps each normalized image at 12 MiB and 2,048 pixels on its longest edge;
- caps an expanded pack at 32 MiB and the transferred archive at 40 MiB;
- stores one immutable object for each exact SHA-256 pack revision;
- reuses that object across route links and race rooms;
- caches and verifies downloads; and
- never exposes a permanent Firebase download-token URL.

Objects are stored under owner- and hash-bound paths. Bucket listing is denied. A recipient must
know a high-entropy open share or race invitation, create a matching reader grant, and authenticate
before Storage permits the exact object download.

Closing a share prevents new grants. It cannot erase files already downloaded by recipients. If an
owner deletes a hosted artifact, existing races or shares may need the `.walkpack` fallback.

## App Check is optional

The Android app can use Play Integrity for App Check in release builds. Do not enforce App Check on
a personal server until the exact signed build, Play signing certificate, sideload/update method,
and every participant device flow have been tested. Authentication plus the checked-in Firestore
and Storage rules are sufficient for the self-hosted server to operate without enforcement.

Never publish an App Check debug token.
