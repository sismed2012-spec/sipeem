import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEV_PROJECT_REF,
  buildNpmExecInvocation,
  buildSupabaseDbQuerySqlArgs,
  runCommandOnce,
} from "./demografia/supabase-cli.mjs";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PUBLISH_SQL_PATH = path.join(
  SCRIPT_DIRECTORY,
  "demografia",
  "eceg-publish-dev.sql"
);

function assertDev(projectRef) {
  if (projectRef !== DEV_PROJECT_REF) {
    throw new Error(`Only SIPEEM-DEV is allowed (${DEV_PROJECT_REF})`);
  }
}

export function parseEcegPublishArgs(argv) {
  let projectRef = null;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--project-ref") {
      projectRef = argv[index + 1] ?? null;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  assertDev(projectRef);
  return { projectRef, apply };
}

export function buildEcegPublishSql(publicationSql, projectRef) {
  assertDev(projectRef);
  return `begin;
select pg_catalog.set_config(
  'sipeem.project_ref',
  '${DEV_PROJECT_REF}',
  true
);
${publicationSql.trim()}
commit;
`;
}

export async function runEcegPublish(options, dependencies = {}) {
  assertDev(options.projectRef);
  if (!options.apply) {
    return { mode: "dry-run", projectRef: options.projectRef };
  }

  const readSql = dependencies.readSql ?? (() => readFile(PUBLISH_SQL_PATH, "utf8"));
  const runCommand = dependencies.runCommand ?? runCommandOnce;
  const publicationSql = buildEcegPublishSql(await readSql(), options.projectRef);
  const npmArgs = buildSupabaseDbQuerySqlArgs(publicationSql, options.projectRef);
  const invocation = buildNpmExecInvocation(npmArgs);
  const result = await runCommand(invocation.command, invocation.args);
  if (result.exitCode !== 0) {
    throw new Error("ECEG publication failed. No automatic retry was attempted.");
  }
  return { mode: "apply", projectRef: options.projectRef };
}

async function main() {
  const options = parseEcegPublishArgs(process.argv.slice(2));
  const result = await runEcegPublish(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
