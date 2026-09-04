# Contributing

Thank you for helping make self-hosted race servers safer and easier to understand.

Before opening a pull request:

1. Explain the user-visible behavior and the compatibility impact.
2. Add emulator coverage for both the intended success case and likely bypass attempts.
3. Run `npm ci` and `npm test` with Node.js 20+ and Java 21+.
4. Keep field allowlists, size limits, immutable identifiers, and default-deny fallbacks intact.
5. Do not include production project identifiers, screenshots with personal data, or credentials.

Protocol changes must remain compatible with rooms and artifacts already created by supported app
versions, or introduce an explicit versioned format. A rules change that requires an app update
should document the minimum compatible Android app version.

Use GitHub's private vulnerability-reporting flow for security findings instead of a public issue.
