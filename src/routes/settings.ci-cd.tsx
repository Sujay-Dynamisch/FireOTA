import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Terminal } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import {
  CodeBlock,
  EmptyState,
  PageHeader,
  SectionCard,
  SkeletonRows,
} from "@/components/fireota/primitives";
import { CI_TOOLS, CiLogo, Icons8Credit, ciToolTitle, type CiTool } from "@/components/fireota/ci-logos";
import { Field } from "@/components/fireota/wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { q } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/ci-cd")({
  head: () => ({
    meta: [
      { title: "CI/CD — FireOTA" },
      {
        name: "description",
        content:
          "Publish OTA updates from GitHub Actions, GitLab CI, Bitbucket Pipelines, Jenkins, Azure DevOps, CircleCI, Bitrise or any CI with the FireOTA CLI.",
      },
      { property: "og:title", content: "CI/CD — FireOTA" },
      { property: "og:description", content: "Ship OTA updates straight from any pipeline." },
    ],
  }),
  component: CiCdPage,
});

interface Options {
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

function CiCdPage() {
  const deployments = useQuery(q.deployments());
  const apps = useQuery(q.apps());
  const [provider, setProvider] = useState("github");
  const [appId, setAppId] = useState("");
  const [channel, setChannel] = useState("production");
  const [platform, setPlatform] = useState("all");
  const [rollout, setRollout] = useState("10");

  const app = (apps.data ?? []).find((a) => a.id === appId) ?? apps.data?.[0];
  const options: Options = {
    appId: app?.id ?? "YOUR_APP_ID",
    channel,
    platform,
    rollout: Math.max(0, Math.min(100, Number(rollout) || 0)),
    runtime: app?.runtimeVersion ?? "1.0.0",
    signed: Boolean(app?.codeSigning?.keyId),
    url: typeof window !== "undefined" ? window.location.origin : "https://your-fireota-domain",
  };
  const current = providers.find((p) => p.id === provider) ?? providers[0]!;

  return (
    <AppShell
      breadcrumb={[
        { label: "Helio Labs", to: "/dashboard" },
        { label: "Settings", to: "/settings" },
        { label: "CI/CD" },
      ]}
    >
      <PageHeader
        title="CI/CD"
        description="One CLI command works in every pipeline. Commit, branch and build number are detected automatically on all major CI tools."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/api-keys">Create API key</Link>
          </Button>
        }
      />

      <SectionCard title="1 · Pipeline settings">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Application">
            <Select value={app?.id ?? ""} onValueChange={setAppId}>
              <SelectTrigger className="h-9 text-[12px]">
                <SelectValue placeholder="Choose an application" />
              </SelectTrigger>
              <SelectContent>
                {(apps.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Channel">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="h-9 font-mono text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(app?.channels ?? ["production"]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Platform">
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="h-9 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Android + iOS (one update group)</SelectItem>
                <SelectItem value="android">Android</SelectItem>
                <SelectItem value="ios">iOS (macOS runner)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Start rollout at (%)">
            <Input
              value={rollout}
              onChange={(e) => setRollout(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-9 font-mono text-[12px]"
            />
          </Field>
        </div>
        <p className="px-4 pb-4 text-[11px] text-muted-foreground">
          Runtime <span className="font-mono">{options.runtime}</span> comes from the app — bump it
          (and the app's store build) whenever native code changes.
          {options.signed
            ? " This app has code signing on, so the snippets include the signing key secret."
            : ""}
        </p>
      </SectionCard>

      <SectionCard title="2 · Add the secrets to your CI">
        <ul className="divide-y divide-border text-[12px]">
          <li className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
            <code className="w-56 font-mono">FIREOTA_API_KEY</code>
            <span className="text-muted-foreground">
              An API key with release.write + release.publish scopes (admins create it under API
              keys).
            </span>
          </li>
          {options.signed ? (
            <li className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
              <code className="w-56 font-mono">FIREOTA_SIGNING_KEY</code>
              <span className="text-muted-foreground">
                Contents of <code className="font-mono">fireota-private.pem</code> (or{" "}
                <code className="font-mono">FIREOTA_SIGNING_KEY_PATH</code> to a secret file). Never
                commit it.
              </span>
            </li>
          ) : null}
          <li className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
            <code className="w-56 font-mono">FIREOTA_URL</code>
            <span className="text-muted-foreground">
              <span className="font-mono">{options.url}</span> (not secret).
            </span>
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="3 · Add the pipeline step">
        <div className="p-4">
          <div className="flex flex-wrap gap-1.5">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                  p.id === provider
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  {CI_TOOLS.includes(p.id as CiTool) ? (
                    <CiLogo tool={p.id as CiTool} className="size-3.5" />
                  ) : (
                    <Terminal className="size-3.5" aria-hidden />
                  )}
                  {p.label}
                </span>
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
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <CiLogo tool={tool} className="size-3" />
                  {ciToolTitle(tool)}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-1.5">
            <CodeBlock code={current.snippet(options)} language={current.language} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            The CLI exits with code 1 on any error, retries safely (the same commit never creates a
            duplicate update), and <span className="font-mono">--json</span> prints a
            machine-readable result for later steps. Verify a key with{" "}
            <span className="font-mono">npx @fireota/cli whoami</span>.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Recent pipeline deployments">
        {deployments.isLoading ? (
          <SkeletonRows rows={3} cols={4} />
        ) : (deployments.data ?? []).length === 0 ? (
          <EmptyState title="No pipeline deployments recorded yet." compact />
        ) : (
          <ul className="divide-y divide-border">
            {(deployments.data ?? []).map((deployment) => (
              <li
                key={deployment.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5 text-[12px]"
              >
                <span className="font-medium">{deployment.provider}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {deployment.repo}
                </span>
                <span className="font-mono text-[11px]">{deployment.release}</span>
                <span
                  className={`font-mono text-[10px] ${
                    deployment.status === "success"
                      ? "text-success"
                      : deployment.status === "running"
                        ? "text-warning"
                        : "text-danger"
                  }`}
                >
                  {deployment.status.toUpperCase()}
                </span>
                <span className="ml-auto font-mono text-[10px] text-faint">{deployment.at}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </AppShell>
  );
}
