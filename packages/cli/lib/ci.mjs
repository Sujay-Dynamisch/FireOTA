/**
 * Detects the CI provider and the commit/branch/build being released, so `fireota publish`
 * records the same metadata on GitHub Actions, GitLab, Bitbucket, Jenkins, Azure DevOps,
 * CircleCI, Bitrise, Buildkite, Travis, TeamCity, Codemagic, AWS CodeBuild — or any other
 * tool through the FIREOTA_GIT_SHA / FIREOTA_GIT_BRANCH / FIREOTA_BUILD_NUMBER variables.
 */
import { execFileSync } from "node:child_process";

const env = process.env;

const PROVIDERS = [
  { name: "GitHub Actions", when: () => env.GITHUB_ACTIONS === "true", sha: "GITHUB_SHA", branch: "GITHUB_REF_NAME", build: "GITHUB_RUN_NUMBER" },
  { name: "GitLab CI", when: () => env.GITLAB_CI === "true", sha: "CI_COMMIT_SHA", branch: "CI_COMMIT_REF_NAME", build: "CI_PIPELINE_IID" },
  { name: "Bitbucket Pipelines", when: () => Boolean(env.BITBUCKET_BUILD_NUMBER), sha: "BITBUCKET_COMMIT", branch: "BITBUCKET_BRANCH", build: "BITBUCKET_BUILD_NUMBER" },
  { name: "Jenkins", when: () => Boolean(env.JENKINS_URL), sha: "GIT_COMMIT", branch: ["BRANCH_NAME", "GIT_BRANCH"], build: "BUILD_NUMBER" },
  { name: "Azure Pipelines", when: () => env.TF_BUILD === "True", sha: "BUILD_SOURCEVERSION", branch: "BUILD_SOURCEBRANCHNAME", build: "BUILD_BUILDNUMBER" },
  { name: "CircleCI", when: () => env.CIRCLECI === "true", sha: "CIRCLE_SHA1", branch: "CIRCLE_BRANCH", build: "CIRCLE_BUILD_NUM" },
  { name: "Bitrise", when: () => env.BITRISE_IO === "true", sha: "BITRISE_GIT_COMMIT", branch: "BITRISE_GIT_BRANCH", build: "BITRISE_BUILD_NUMBER" },
  { name: "Buildkite", when: () => env.BUILDKITE === "true", sha: "BUILDKITE_COMMIT", branch: "BUILDKITE_BRANCH", build: "BUILDKITE_BUILD_NUMBER" },
  { name: "Travis CI", when: () => env.TRAVIS === "true", sha: "TRAVIS_COMMIT", branch: "TRAVIS_BRANCH", build: "TRAVIS_BUILD_NUMBER" },
  { name: "TeamCity", when: () => Boolean(env.TEAMCITY_VERSION), sha: "BUILD_VCS_NUMBER", branch: "TEAMCITY_BUILD_BRANCH", build: "BUILD_NUMBER" },
  { name: "Codemagic", when: () => env.CM_BUILD_ID !== undefined, sha: "CM_COMMIT", branch: "CM_BRANCH", build: "BUILD_NUMBER" },
  { name: "AWS CodeBuild", when: () => Boolean(env.CODEBUILD_BUILD_ID), sha: "CODEBUILD_RESOLVED_SOURCE_VERSION", branch: "CODEBUILD_WEBHOOK_HEAD_REF", build: "CODEBUILD_BUILD_NUMBER" },
];

function pick(keys) {
  for (const key of [keys].flat()) if (env[key]) return env[key];
  return undefined;
}

function git(args) {
  try {
    return execFileSync("git", args, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

export function detectCi() {
  const provider = PROVIDERS.find((p) => p.when());
  const ci = Boolean(provider) || env.CI === "true" || env.CI === "1";
  const branch = (env.FIREOTA_GIT_BRANCH ?? (provider ? pick(provider.branch) : undefined) ?? git(["rev-parse", "--abbrev-ref", "HEAD"]))?.replace(
    /^(refs\/heads\/|origin\/)/,
    "",
  );
  return {
    ci,
    provider: provider?.name ?? (ci ? "CI" : "local"),
    gitCommitSha: env.FIREOTA_GIT_SHA ?? (provider ? pick(provider.sha) : undefined) ?? git(["rev-parse", "HEAD"]),
    gitBranch: branch && branch !== "HEAD" ? branch : undefined,
    buildNumber: env.FIREOTA_BUILD_NUMBER ?? (provider ? pick(provider.build) : undefined),
  };
}
