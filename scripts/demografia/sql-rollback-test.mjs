import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEV_PROJECT_REF,
  buildNpmExecInvocation,
  buildSupabaseDbQueryArgs,
  runCommandOnce,
} from "./supabase-cli.mjs";

export function composeRollbackSql(parts) {
  if (parts.some((part) => /\bcommit\s*;/iu.test(part))) {
    throw new Error("COMMIT is forbidden in rollback SQL tests");
  }
  return `begin;\n${parts.join("\n")}\nrollback;\n`;
}

export function normalizeTransactionalSql(sql) {
  const match = sql.trim().match(/^begin\s*;([\s\S]*)(?:commit|rollback)\s*;$/iu);
  if (!match) {
    throw new Error("SQL must be a complete outer transaction");
  }
  const body = match[1].trim();
  if (/\b(?:begin|commit|rollback)\s*;/iu.test(body)) {
    throw new Error("Nested transaction control is forbidden");
  }
  return body;
}

export function parseRollbackTestArgs(argv) {
  let projectRef = null;
  let stripOuterTransaction = false;
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--project-ref") {
      projectRef = argv[index + 1] ?? null;
      index += 1;
    } else if (argument === "--strip-outer-transaction") {
      stripOuterTransaction = true;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown argument: ${argument}`);
    } else {
      files.push(argument);
    }
  }
  if (projectRef !== DEV_PROJECT_REF) {
    throw new Error(`Only SIPEEM-DEV is allowed (${DEV_PROJECT_REF})`);
  }
  if (files.length === 0) throw new Error("At least one SQL file is required");
  return { projectRef, files, stripOuterTransaction };
}

export async function runRollbackSqlTest({ projectRef, files, stripOuterTransaction }) {
  let parts = await Promise.all(files.map((file) => readFile(file, "utf8")));
  if (stripOuterTransaction) {
    parts = parts.map(normalizeTransactionalSql);
  }
  const sql = composeRollbackSql(parts);
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "sipeem-sql-rollback-")
  );
  const sqlPath = path.join(temporaryDirectory, "test.sql");
  try {
    await writeFile(sqlPath, sql, "utf8");
    const npmArgs = buildSupabaseDbQueryArgs(sqlPath, projectRef);
    const invocation = buildNpmExecInvocation(npmArgs);
    return await runCommandOnce(invocation.command, invocation.args);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseRollbackTestArgs(process.argv.slice(2));
  const result = await runRollbackSqlTest(options);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
