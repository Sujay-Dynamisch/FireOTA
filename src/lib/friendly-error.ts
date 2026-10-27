// Turns any thrown value into a short, plain-English sentence that is safe to show
// in the UI. Validation dumps, stack traces and transport errors never reach users.

const FIELD_LABELS: Record<string, string> = {
  firebaseProjectId: "Firebase project",
  projectId: "project",
  appId: "app",
  releaseId: "release",
  channelId: "channel",
  bucket: "storage bucket",
  storageBucket: "storage bucket",
  email: "email address",
  password: "password",
  name: "name",
  slug: "short name",
  url: "URL",
  webhookUrl: "webhook URL",
  bundleId: "bundle ID",
  packageName: "package name",
  version: "version",
  runtimeVersion: "runtime version",
  rollout: "rollout percentage",
  rolloutPercentage: "rollout percentage",
  message: "message",
  role: "role",
};

type Issue = {
  code?: string;
  path?: (string | number)[];
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
  type?: string;
  expected?: string;
  format?: string;
  validation?: string;
  input?: unknown;
};

function labelFor(path: Issue["path"]): string {
  const key = [...(path ?? [])].reverse().find((p): p is string => typeof p === "string");
  if (!key) return "This field";
  return FIELD_LABELS[key] ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function describeIssue(issue: Issue): string {
  const label = labelFor(issue.path);
  const kind = issue.origin ?? issue.type;
  switch (issue.code) {
    case "too_small":
      if (kind === "string") {
        return Number(issue.minimum) <= 3
          ? `Please enter a valid ${label}.`
          : `${capitalize(label)} must be at least ${issue.minimum} characters.`;
      }
      if (kind === "array" || kind === "set") return `Please choose at least ${issue.minimum} ${label}.`;
      return `${capitalize(label)} must be at least ${issue.minimum}.`;
    case "too_big":
      if (kind === "string") return `${capitalize(label)} must be ${issue.maximum} characters or fewer.`;
      if (kind === "array" || kind === "set") return `Please choose no more than ${issue.maximum} ${label}.`;
      return `${capitalize(label)} must be ${issue.maximum} or less.`;
    case "invalid_type":
      return issue.input === undefined || issue.input === null
        ? `${capitalize(label)} is required.`
        : `Please enter a valid ${label}.`;
    case "invalid_format":
    case "invalid_string": {
      const format = issue.format ?? issue.validation;
      if (format === "email") return "Please enter a valid email address.";
      if (format === "url") return `Please enter a valid ${label} (starting with https://).`;
      return `Please enter a valid ${label}.`;
    }
    case "invalid_value":
    case "invalid_enum_value":
      return `Please choose a valid ${label}.`;
    default:
      return `Please check the ${label} and try again.`;
  }
}

function fromValidationDump(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const issues = (Array.isArray(parsed) ? parsed : (parsed as { issues?: unknown }).issues) as Issue[] | undefined;
    if (!Array.isArray(issues) || issues.length === 0) return null;
    return [...new Set(issues.map(describeIssue))].join(" ");
  } catch {
    return null;
  }
}

const NETWORK = /failed to fetch|networkerror|network request failed|load failed|err_network|econnrefused|etimedout/i;
const TECHNICAL = /^(httperror|internal server error|unexpected token|cannot read prop|undefined is not|\w*error:)|\bat \S+ \(|stack|[{}[\]]/i;

/** Plain-English message for any error, falling back to `fallback` for anything technical. */
export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const issues = (error as { issues?: Issue[] } | null)?.issues;
  if (Array.isArray(issues) && issues.length) return [...new Set(issues.map(describeIssue))].join(" ");

  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!message) return fallback;

  const validation = fromValidationDump(message);
  if (validation) return validation;
  if (NETWORK.test(message)) return "Can't reach FireOTA right now. Check your internet connection and try again.";
  if (message.length > 220 || TECHNICAL.test(message)) return fallback;
  return message;
}
