import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { CodeBlock, EmptyState, PageHeader, SectionCard, SkeletonRows } from "@/components/fireota/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { q } from "@/lib/queries";

export const Route = createFileRoute("/settings/ci-cd")({
  head: () => ({
    meta: [
      { title: "CI/CD — FireOTA" },
      {
        name: "description",
        content: "Publish OTA releases from GitHub Actions, GitLab CI or Bitrise with the FireOTA CLI.",
      },
      { property: "og:title", content: "CI/CD — FireOTA" },
      { property: "og:description", content: "Ship OTA releases straight from your pipeline." },
    ],
  }),
  component: CiCdPage,
});

const snippets: Record<string, string> = {
  github: `name: OTA release\non:\n  push:\n    branches: [main]\n\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n      - run: npx fireota bundle --platform android\n      - run: npx fireota release publish \\\n          --app ledger \\\n          --channel beta \\\n          --rollout 10\n        env:\n          FIREOTA_API_KEY: \${{ secrets.FIREOTA_API_KEY }}`,
  gitlab: `ota_release:\n  image: node:20\n  script:\n    - npm ci\n    - npx fireota bundle --platform ios\n    - npx fireota release publish --app ledger --channel beta --rollout 10\n  variables:\n    FIREOTA_API_KEY: $FIREOTA_API_KEY`,
  bitrise: `workflows:\n  ota_release:\n    steps:\n      - npm@1:\n          inputs:\n            - command: ci\n      - script@1:\n          inputs:\n            - content: |\n                npx fireota bundle --platform android\n                npx fireota release publish --app ledger --channel beta --rollout 10`,
};

function CiCdPage() {
  const deployments = useQuery(q.deployments());
  const [provider, setProvider] = useState("github");

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
        description="Publish OTA releases from your existing pipeline."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/api-keys">Create API key</Link>
          </Button>
        }
      />

      <SectionCard title="Pipeline configuration">
        <div className="p-4">
          <Tabs value={provider} onValueChange={setProvider}>
            <TabsList>
              <TabsTrigger value="github">GitHub Actions</TabsTrigger>
              <TabsTrigger value="gitlab">GitLab CI</TabsTrigger>
              <TabsTrigger value="bitrise">Bitrise</TabsTrigger>
            </TabsList>
            {Object.entries(snippets).map(([key, snippet]) => (
              <TabsContent key={key} value={key} className="mt-3">
                <CodeBlock code={snippet} language="yaml" />
              </TabsContent>
            ))}
          </Tabs>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Store the key as <span className="font-mono">FIREOTA_API_KEY</span> in your pipeline secrets — never in the
            repository.
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
              <li key={deployment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5 text-[12px]">
                <span className="font-medium">{deployment.provider}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{deployment.repo}</span>
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
