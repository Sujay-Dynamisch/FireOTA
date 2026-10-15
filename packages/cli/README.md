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

Set two environment variables (create the API key in FireOTA → Settings → API keys):

```sh
FIREOTA_URL=https://ota.example.com
FIREOTA_API_KEY=fota_sk_live_...
```

Scopes: `release.write` (create, upload), `release.publish` (publish, pause, roll back), `rollout.write` (change rollout).

## Publish in one command

Run from your React Native project root:

```sh
npx fireota publish --app YOUR_APP_ID --platform android \
  --version 1.3.1 --runtime 1.3.0 --channel production --rollout 10 --notes "Fix checkout crash"
```

This runs the React Native bundler, compiles Hermes bytecode when Hermes is enabled, packs the images next to the bundle, creates the release, uploads it to your Firebase Storage (checksum verified) and publishes it. Retries are safe: the same inputs never create a duplicate release.

- `--version` must be new for each release on a channel.
- `--runtime` must equal the runtime version of the store build that should receive it.

## Commands

```text
fireota bundle   --platform <android|ios> [--entry index.js] [--out update.fota] [--hermes auto|on|off]
fireota publish  --app <appId> --platform <p> --version <x.y.z> --runtime <x.y.z>
                 [--channel production] [--rollout 10] [--notes "…"] [--mandatory] [--native ">=1.4.0"] [--file update.fota]
fireota release create   --app <appId> --platform <p> --version <v> --runtime <r> [--channel c]
fireota release upload   <releaseId> --file update.fota
fireota release publish  <releaseId> [--rollout 100]
fireota release rollout  <releaseId> --percentage <0-100>
fireota release pause    <releaseId>
fireota release rollback <releaseId> --reason "…" [--target <releaseId>]
fireota releases [--app <appId>]
```

## GitHub Actions

```yaml
- run: npx fireota publish --app ${{ vars.FIREOTA_APP_ID }} --platform android --version 1.3.${{ github.run_number }} --runtime 1.3.0 --channel beta
  env:
    FIREOTA_URL: ${{ vars.FIREOTA_URL }}
    FIREOTA_API_KEY: ${{ secrets.FIREOTA_API_KEY }}
```

## License

MIT
