/**
 * Ready-made pipeline steps for each CI provider, and the clickable provider picker that shows
 * them. Used by Settings → CI/CD (filled with the real app) and the docs (with placeholders).
 */
import { Terminal } from "lucide-react";
import { useState } from "react";

import { CI_TOOLS, CiLogo, Icons8Credit, ciToolTitle, type CiTool } from "@/components/fireota/ci-logos";
import { CodeBlock } from "@/components/fireota/primitives";
import { cn } from "@/lib/utils";

export interface Options {
  appId: string;
  channel: string;
  platform: string;
  rollout: number;
  runtime: string;
  signed: boolean;
  url: string;
}

/** The one command every provider runs. Everything else is how each tool provides Node and secrets. */
function command(o: Options, indent = "") {
  const lines = [
    `npx --yes @fireota/cli publish`,
    `--app ${o.appId}`,
    `--platform ${o.platform}`,
    `--runtime ${o.runtime}`,
    `--channel ${o.channel}`,
    `--rollout ${o.rollout}`,
    `--message "$COMMIT_MESSAGE"`,
  ];
  return lines.join(` \\\n${indent}    `);
}

const providers: {
  id: string;
  label: string;
  file: string;
  language: string;
  snippet: (o: Options) => string;
}[] = [
  {
    id: "github",
    label: "GitHub Actions",
    file: ".github/workflows/ota.yml",
    language: "yaml",
    snippet: (o) => `name: OTA update
on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ${o.platform === "android" ? "ubuntu-latest" : "macos-latest"}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Publish OTA update
        env:
          FIREOTA_URL: ${o.url}
          FIREOTA_API_KEY: \${{ secrets.FIREOTA_API_KEY }}${o.signed ? "\n          FIREOTA_SIGNING_KEY: ${{ secrets.FIREOTA_SIGNING_KEY }}" : ""}
          COMMIT_MESSAGE: \${{ github.event.head_commit.message }}
        run: |
          ${command(o, "          ")}`,
  },
  {
    id: "gitlab",
    label: "GitLab CI",
    file: ".gitlab-ci.yml",
    language: "yaml",
    snippet: (o) => `ota_update:
  image: node:20
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  variables:
    FIREOTA_URL: ${o.url}
    COMMIT_MESSAGE: $CI_COMMIT_TITLE
    # FIREOTA_API_KEY${o.signed ? " and FIREOTA_SIGNING_KEY" : ""}: Settings → CI/CD → Variables (masked)
  script:
    - npm ci
    - ${command(o, "    ")}`,
  },
  {
    id: "bitbucket",
    label: "Bitbucket Pipelines",
    file: "bitbucket-pipelines.yml",
    language: "yaml",
    snippet: (o) => `image: node:20

pipelines:
  branches:
    main:
      - step:
          name: Publish OTA update
          caches: [node]
          script:
            # FIREOTA_API_KEY${o.signed ? " and FIREOTA_SIGNING_KEY" : ""}: Repository settings → Repository variables (secured)
            - export FIREOTA_URL=${o.url}
            - export COMMIT_MESSAGE="$(git log -1 --pretty=%s)"
            - npm ci
            - ${command(o, "              ")}`,
  },
  {
    id: "jenkins",
    label: "Jenkins",
    file: "Jenkinsfile",
    language: "groovy",
    snippet: (o) => `pipeline {
  agent any
  tools { nodejs 'node20' }            // NodeJS plugin installation name
  environment {
    FIREOTA_URL     = '${o.url}'
    FIREOTA_API_KEY = credentials('fireota-api-key')   // "Secret text" credential${o.signed ? "\n    FIREOTA_SIGNING_KEY_PATH = credentials('fireota-signing-key') // \"Secret file\" credential" : ""}
  }
  stages {
    stage('OTA update') {
      when { branch 'main' }
      steps {
        sh 'npm ci'
        sh '''
          export COMMIT_MESSAGE="$(git log -1 --pretty=%s)"
          ${command(o, "          ")}
        '''
      }
    }
  }
}`,
  },
  {
    id: "azure",
    label: "Azure DevOps",
    file: "azure-pipelines.yml",
    language: "yaml",
    snippet: (o) => `trigger:
  branches: { include: [main] }

pool:
  vmImage: ${o.platform === "android" ? "ubuntu-latest" : "macOS-latest"}

steps:
  - task: NodeTool@0
    inputs: { versionSpec: '20.x' }
  - script: npm ci
  - script: |
      ${command(o, "      ")}
    env:
      FIREOTA_URL: ${o.url}
      FIREOTA_API_KEY: $(FIREOTA_API_KEY)   # pipeline secret variable${o.signed ? "\n      FIREOTA_SIGNING_KEY: $(FIREOTA_SIGNING_KEY)" : ""}
      COMMIT_MESSAGE: $(Build.SourceVersionMessage)`,
  },
  {
    id: "circleci",
    label: "CircleCI",
    file: ".circleci/config.yml",
    language: "yaml",
    snippet: (o) => `version: 2.1
jobs:
  ota-update:
    docker:
      - image: cimg/node:20.11
    environment:
      FIREOTA_URL: ${o.url}
    steps:
      - checkout
      - run: npm ci
      - run: |
          export COMMIT_MESSAGE="$(git log -1 --pretty=%s)"
          ${command(o, "          ")}
workflows:
  ota:
    jobs:
      - ota-update:
          context: fireota            # holds FIREOTA_API_KEY${o.signed ? " + FIREOTA_SIGNING_KEY" : ""}
          filters: { branches: { only: main } }`,
  },
  {
    id: "bitrise",
    label: "Bitrise",
    file: "bitrise.yml",
    language: "yaml",
    snippet: (o) => `workflows:
  ota_update:
    envs:
      - FIREOTA_URL: ${o.url}
    # FIREOTA_API_KEY${o.signed ? " and FIREOTA_SIGNING_KEY" : ""}: Workflow Editor → Secrets
    steps:
      - git-clone@8: {}
      - npm@1:
          inputs: [{ command: ci }]
      - script@1:
          inputs:
            - content: |
                export COMMIT_MESSAGE="$BITRISE_GIT_MESSAGE"
                ${command(o, "                ")}`,
  },
  {
    id: "shell",
    label: "Any other CI",
    file: "any CI shell step (TeamCity, Buildkite, Codemagic, Travis, Drone, AWS CodeBuild…)",
    language: "bash",
    snippet: (o) => `# Requirements: Node.js 18+ and your project's node_modules (npm ci).
# Secrets: FIREOTA_API_KEY${o.signed ? " and FIREOTA_SIGNING_KEY (PEM text) or FIREOTA_SIGNING_KEY_PATH (file)" : ""}
export FIREOTA_URL=${o.url}
export COMMIT_MESSAGE="$(git log -1 --pretty=%s)"
# Optional when your CI isn't auto-detected:
# export FIREOTA_GIT_SHA=... FIREOTA_GIT_BRANCH=... FIREOTA_BUILD_NUMBER=...

npm ci
${command(o)} --json > fireota-result.json`,
  },
  {
    id: "rest",
    label: "REST API (no Node)",
    file: "raw HTTP — build the .fota package elsewhere with `npx @fireota/cli bundle`",
    language: "bash",
    snippet: (o) => `# 1. Create the update
RELEASE=$(curl -sf -X POST "${o.url}/api/public/v1/releases" \\
  -H "Authorization: Bearer $FIREOTA_API_KEY" -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $CI_COMMIT_SHA-${o.platform === "all" ? "android" : o.platform}" \\
  -d '{"appId":"${o.appId}","platform":"${o.platform === "all" ? "android" : o.platform}","runtimeVersion":"${o.runtime}","channel":"${o.channel}","releaseNotes":"'"$COMMIT_MESSAGE"'"}' \\
  | jq -r .data.id)

# 2. Upload the package (checksum verified by the server)
curl -sf -X POST "${o.url}/api/public/v1/releases/$RELEASE/bundle" \\
  -H "Authorization: Bearer $FIREOTA_API_KEY" \\
  -H "x-bundle-sha256: $(sha256sum update.fota | cut -d' ' -f1)" \\${o.signed ? '\n  -H "x-fireota-signature: $SIGNATURE" \\' : ""}
  -F "bundle=@update.fota"

# 3. Publish at ${o.rollout}%
curl -sf -X POST "${o.url}/api/public/v1/releases/$RELEASE/publish" \\
  -H "Authorization: Bearer $FIREOTA_API_KEY" -H "Content-Type: application/json" \\
  -d '{"action":"publish","rolloutPercentage":${o.rollout}}'`,
  },
];

/** Provider tiles; clicking one shows that provider's pipeline file and snippet. */
export function CiPipelinePicker({ options }: { options: Options }) {
  const [provider, setProvider] = useState("github");
  const current = providers.find((p) => p.id === provider) ?? providers[0]!;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="CI/CD provider">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setProvider(p.id)}
            aria-pressed={p.id === provider}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-xl border px-3 py-3.5 text-[12px] font-medium transition-all hover:-translate-y-0.5 hover:shadow-md",
              p.id === provider
                ? "border-brand bg-brand/10 text-foreground shadow-sm ring-2 ring-brand/20"
                : "border-border bg-background text-muted-foreground hover:border-brand/40 hover:text-foreground",
            )}
          >
            <span className="grid size-12 place-items-center rounded-xl bg-surface-2/70 transition-transform group-hover:scale-105">
              {CI_TOOLS.includes(p.id as CiTool) ? (
                <CiLogo tool={p.id as CiTool} className="size-8" />
              ) : (
                <Terminal className="size-7" aria-hidden />
              )}
            </span>
            <span className="text-center leading-tight">{p.label}</span>
          </button>
        ))}
      </div>
      <Icons8Credit className="mt-1.5 inline-block" />
      <p className="mt-2 font-mono text-[11px] text-faint">{current.file}</p>
      {current.id === "shell" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["buildkite", "teamcity", "codemagic", "travis", "drone"] as CiTool[]).map((tool) => (
            <span
              key={tool}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground"
            >
              <CiLogo tool={tool} className="size-5" />
              {ciToolTitle(tool)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-1.5">
        <CodeBlock code={current.snippet(options)} language={current.language} />
      </div>
    </div>
  );
}
