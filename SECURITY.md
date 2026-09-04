# Security policy

## Report a vulnerability privately

Please do not open a public issue for a suspected authorization bypass, exposed credential,
privacy leak, or other security problem.

Use this repository's **Security → Report a vulnerability** flow on GitHub. Include:

- the affected rule and document/object path;
- the authenticated role involved (owner, participant, invite holder, or outsider);
- a minimal emulator reproduction when possible;
- the impact you believe is possible; and
- whether you tested only an emulator or a Firebase project you own.

Do not test against another person's Firebase project, retrieve another person's files, publish an
invite, or include real participant data in a report.

## Supported version

Security fixes are made on the latest `main` branch. Self-hosted operators are responsible for
deploying updated rules to their own Firebase projects; updating the Android app does not update a
personal server automatically.

## Credentials

This repository should never contain `google-services.json`, `.firebaserc`, service-account files,
Firebase CLI tokens, private keys, or live project identifiers. If a privileged credential is
committed, revoke or rotate it at the provider immediately. Removing it from a later Git commit is
not sufficient.
