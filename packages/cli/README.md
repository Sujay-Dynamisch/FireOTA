<p align="center">
  <img src="https://raw.githubusercontent.com/Sujay-Dynamisch/FireOTA/main/public/logo-mark.png" alt="FireOTA" width="96" />
</p>

<h1 align="center">FireOTA CLI</h1>

<p align="center">
  Build FireOTA update packages and publish React Native over-the-air releases from a terminal or CI.<br />
  Works with <a href="https://www.npmjs.com/package/@fireota/react-native"><code>@fireota/react-native</code></a>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@fireota/cli"><img alt="@fireota/cli" src="https://img.shields.io/npm/v/@fireota/cli?label=%40fireota%2Fcli" /></a>
  <a href="https://www.npmjs.com/package/@fireota/react-native"><img alt="@fireota/react-native" src="https://img.shields.io/npm/v/@fireota/react-native?label=%40fireota%2Freact-native" /></a>
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue" />
</p>

---

> **Beta (0.x).** Requires Node.js 18.17+.

## Setup

```sh
npm install --save-dev @fireota/cli
```

Set two environment variables (an admin creates the API key in FireOTA → API keys):

```sh
FIREOTA_URL=https://ota.example.com
FIREOTA_API_KEY=fota_sk_live_...
```

Scopes: `release.write` (create, upload), `release.publish` (publish, pause, roll back), `rollout.write` (change rollout). Check a key with `npx fireota whoami`.

Optional defaults: `FIREOTA_APP_ID`, `FIREOTA_CHANNEL`, `FIREOTA_RUNTIME`.

## Publish in one command

Run from your React Native project root:

```sh
npx fireota publish --app YOUR_APP_ID --platform all --runtime 1.3.0 \
  --channel production --rollout 10 --message "Fix checkout crash"
```

This runs the React Native bundler, compiles Hermes bytecode when Hermes is enabled, packs the images next to the bundle, creates the update, uploads it to your Firebase Storage (checksum verified) and publishes it. `--platform all` builds Android and iOS and publishes them as one update group.

- **Updates are identified by their ID**, like Expo. `--version` is only an optional label (e.g. `1.3.1-hotfix`).
- `--runtime` must equal the runtime version of the store build that should receive the update. Bump it whenever native code changes.
- Retries are safe: the same inputs never create a duplicate update, and finished steps are skipped.
- `--json` prints a machine-readable result; the exit code is 1 on any error.

## Code signing (optional)

```sh
npx fireota signing generate --out ./fireota-keys   # fireota-private.pem stays with you
```

Paste `fireota-public.pem` into the dashboard (app → Code signing), pass the same public key to `FireOTA.configure({ codeSigningCertificate })`, and publish with `--private-key ./fireota-keys/fireota-private.pem` (in CI: the `FIREOTA_SIGNING_KEY` secret holding the PEM text, or `FIREOTA_SIGNING_KEY_PATH`). The signature covers the package's SHA-256 plus runtime and platform; the server and the app both reject updates that don't match.

## Commands

```text
fireota init     [--app <appId>] [--server-url <url>] [--channel production] [--dry-run]
fireota publish  --app <appId> --platform <android|ios|all> [--runtime <x.y.z>] --message "…"
                 [--channel production] [--rollout 10] [--version <label>] [--mandatory] [--native ">=1.4.0"]
                 [--file update.fota] [--private-key key.pem] [--json]
fireota bundle   --platform <android|ios> [--entry index.js] [--out update.fota] [--hermes auto|on|off]
fireota whoami
fireota signing generate [--out ./fireota-keys]
fireota release create   --app <appId> --platform <p> --runtime <r> [--message m] [--version v] [--channel c]
fireota release upload   <releaseId> --file update.fota [--private-key key.pem]
fireota release publish  <releaseId> [--rollout 100]
fireota release rollout  <releaseId> --percentage <0-100>
fireota release pause    <releaseId>
fireota release rollback <releaseId> --reason "…" [--target <releaseId>]
fireota releases [--app <appId>] [--json]
```

## CI/CD

The same command works on every CI. Commit, branch and build number are detected automatically on GitHub Actions, GitLab CI, Bitbucket Pipelines, Jenkins, Azure DevOps, CircleCI, Bitrise, Buildkite, Travis, TeamCity, Codemagic and AWS CodeBuild; anywhere else set `FIREOTA_GIT_SHA`, `FIREOTA_GIT_BRANCH` and `FIREOTA_BUILD_NUMBER`. Ready-made pipeline files for each tool are in the dashboard under **CI/CD**.

GitHub Actions:

```yaml
- run: npx fireota publish --app ${{ vars.FIREOTA_APP_ID }} --platform android --runtime 1.3.0 --channel beta --message "${{ github.event.head_commit.message }}"
  env:
    FIREOTA_URL: ${{ vars.FIREOTA_URL }}
    FIREOTA_API_KEY: ${{ secrets.FIREOTA_API_KEY }}
```

Jenkins (declarative):

```groovy
environment {
  FIREOTA_URL     = 'https://ota.example.com'
  FIREOTA_API_KEY = credentials('fireota-api-key')
}
steps {
  sh 'npm ci && npx fireota publish --app "$APP_ID" --platform android --runtime 1.3.0 --message "$(git log -1 --pretty=%s)"'
}
```

Bitbucket Pipelines:

```yaml
script:
  - npm ci
  - npx fireota publish --app "$FIREOTA_APP_ID" --platform android --runtime 1.3.0 --message "$(git log -1 --pretty=%s)"
```

## License

MIT
