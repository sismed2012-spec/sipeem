import path from "node:path";

export const SOURCE_PROJECT_REF = "nppvprbfmjbhwheghipa";
export const TARGET_PROJECT_REF = "cdvukcthosppezjscwod";

const DENIED_PROJECT_REFS = new Set([
  "xvdqlozimvqluwxpbizx",
  "ljlfezcpckrmbrmucbva",
]);
const READ_PHASES = new Set([
  "preflight",
  "schema-plan",
  "data-plan",
  "verify",
  "status",
]);
const WRITE_PHASES = new Set(["schema-apply", "data-apply"]);
const CREDENTIAL_ARGUMENT =
  /(?:password\s*=|--password\b|--token\b|api[_-]?key|service[_-]?role|sb_secret_|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/iu;

export function assertProjectRole({ projectRef, role, access }) {
  if (DENIED_PROJECT_REFS.has(projectRef)) {
    throw new Error(`Project reference ${projectRef} is permanently denied`);
  }
  if (role !== "source" && role !== "target") {
    throw new Error(`Unknown project role: ${role}`);
  }
  if (access !== "read" && access !== "write") {
    throw new Error(`Unknown project access: ${access}`);
  }

  const expected = role === "source" ? SOURCE_PROJECT_REF : TARGET_PROJECT_REF;
  if (projectRef !== expected) {
    throw new Error(`Project reference must exactly match the ${role} project`);
  }
  if (role === "source" && access === "write") {
    throw new Error("The source project is read-only during promotion");
  }
}

function hasArgument(args, value) {
  return args.some((argument) => argument.toLowerCase() === value);
}

function hasOption(args, name) {
  const normalized = name.toLowerCase();
  return args.some((argument) => {
    const value = argument.toLowerCase();
    return value === normalized || value.startsWith(`${normalized}=`);
  });
}

export function assertSafeOperation({ phase, projectRef, args }) {
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== "string")) {
    throw new Error("Operation arguments must be an array of strings");
  }
  const access = WRITE_PHASES.has(phase) ? "write" : "read";
  if (!READ_PHASES.has(phase) && !WRITE_PHASES.has(phase)) {
    throw new Error(`Unknown promotion phase: ${phase}`);
  }
  const role = projectRef === SOURCE_PROJECT_REF ? "source" : "target";
  assertProjectRole({ projectRef, role, access });

  if (hasArgument(args, "reset") || hasOption(args, "--include-seed")) {
    throw new Error("Destructive or seeded Supabase operations are forbidden");
  }
  if (
    hasOption(args, "--db-url") ||
    hasOption(args, "--project-ref") ||
    hasOption(args, "--workdir")
  ) {
    throw new Error("Connection and workdir overrides are forbidden");
  }
  if (args.some((argument) => CREDENTIAL_ARGUMENT.test(argument))) {
    throw new Error("Credential-bearing arguments are forbidden");
  }
  if (
    phase === "schema-plan" &&
    (!hasArgument(args, "push") || !hasArgument(args, "--dry-run"))
  ) {
    throw new Error("schema-plan requires db push --dry-run");
  }
  if (phase === "schema-apply" && hasArgument(args, "--dry-run")) {
    throw new Error("schema-apply cannot use --dry-run");
  }
}

export function buildSupabaseInvocation({
  args,
  projectRef,
  workdir = "infra/territorial",
  platform = process.platform,
  execPath = process.execPath,
  npmExecPath = process.env.npm_execpath,
}) {
  const role = projectRef === SOURCE_PROJECT_REF ? "source" : "target";
  assertProjectRole({ projectRef, role, access: "read" });
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== "string")) {
    throw new Error("Supabase arguments must be an array of strings");
  }
  if (hasOption(args, "--project-ref") || hasOption(args, "--workdir")) {
    throw new Error("Supabase connection overrides are forbidden");
  }
  const npmArgs = [
    "exec",
    "supabase",
    "--",
    "--workdir",
    workdir,
    ...args,
    "--project-ref",
    projectRef,
  ];
  if (platform !== "win32") return { command: "npm", args: npmArgs };

  const npmCliPath = npmExecPath?.toLowerCase().endsWith(".js")
    ? npmExecPath
    : path.join(
        path.dirname(execPath),
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      );
  return { command: execPath, args: [npmCliPath, ...npmArgs] };
}
