import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const TRUNCATION_MARKER = "\n[output truncated]\n";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function redactSensitiveText(value, sensitiveValues = []) {
  let text = String(value ?? "");
  const explicitValues = [...new Set(sensitiveValues)]
    .filter((item) => typeof item === "string" && item.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const secret of explicitValues) {
    text = text.replace(new RegExp(escapeRegExp(secret), "gu"), "[REDACTED]");
  }
  text = text.replace(
    /((?:postgres|postgresql):\/\/[^:\s/@]+:)([^@\s]+)(@)/giu,
    "$1[REDACTED]$3",
  );
  text = text.replace(
    /\b(password|token|api[_-]?key|service[_-]?role)(\s*[=:]\s*)([^\s,;]+)/giu,
    "$1$2[REDACTED]",
  );
  text = text.replace(
    /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/gu,
    "[REDACTED]",
  );
  text = text.replace(/\bsb_secret_[a-zA-Z0-9._-]+\b/gu, "[REDACTED]");
  return text;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const FAILURE_FIELDS = [
  "phase",
  "exitCode",
  "errorCode",
  "sqlState",
  "errorClass",
  "objectName",
  "stdoutSha256",
  "stderrSha256",
];
const SAFE_CODE = /^[A-Z0-9_-]{1,64}$/u;
const SAFE_OBJECT = /^[a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?$/u;
const SQL_STATE_CLASSES = new Map([
  ["23505", "UNIQUE_VIOLATION"],
  ["23503", "FOREIGN_KEY_VIOLATION"],
  ["23502", "NOT_NULL_VIOLATION"],
  ["42P01", "UNDEFINED_TABLE"],
  ["42501", "INSUFFICIENT_PRIVILEGE"],
  ["08000", "CONNECTION_EXCEPTION"],
]);

function classifyFailure(sqlState, errorCode, exitCode) {
  if (sqlState && SQL_STATE_CLASSES.has(sqlState)) return SQL_STATE_CLASSES.get(sqlState);
  if (sqlState?.startsWith("08")) return "CONNECTION_EXCEPTION";
  if (sqlState?.startsWith("23")) return "INTEGRITY_CONSTRAINT_VIOLATION";
  if (sqlState) return "DATABASE_ERROR";
  if (errorCode) return "PROCESS_ERROR";
  if (Number.isInteger(exitCode)) return "PROCESS_EXIT";
  return "UNKNOWN_PROCESS_FAILURE";
}

export function normalizeProcessFailure({ phase, result, sensitiveValues = [] }) {
  if (typeof phase !== "string" || !/^[a-z][a-z0-9-]{1,63}$/u.test(phase)) {
    throw new Error("Failure phase is invalid");
  }
  const stdout = redactSensitiveText(result?.stdout ?? "", sensitiveValues);
  const stderr = redactSensitiveText(result?.stderr ?? "", sensitiveValues);
  const combined = `${stdout}\n${stderr}`;
  const sqlState = combined.match(/\b([0-9][0-9A-Z]{4}):(?:\s|$)/u)?.[1] ?? null;
  const objectCandidate =
    combined.match(/\bCONSTRAINT NAME:\s*([a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?)/iu)?.[1] ??
    combined.match(/\bconstraint\s+"([a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?)"/iu)?.[1] ??
    null;
  const errorCode = typeof result?.errorCode === "string" && SAFE_CODE.test(result.errorCode)
    ? result.errorCode
    : null;
  const exitCode = Number.isInteger(result?.exitCode) ? result.exitCode : null;
  return {
    phase,
    exitCode,
    errorCode,
    sqlState,
    errorClass: classifyFailure(sqlState, errorCode, exitCode),
    objectName: objectCandidate && SAFE_OBJECT.test(objectCandidate) ? objectCandidate : null,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
  };
}

function validateFailureEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Failure evidence shape is invalid");
  }
  if (
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...FAILURE_FIELDS].sort()) ||
    typeof value.phase !== "string" ||
    (value.exitCode !== null && !Number.isInteger(value.exitCode)) ||
    (value.errorCode !== null && !SAFE_CODE.test(value.errorCode)) ||
    (value.sqlState !== null && !/^[0-9A-Z]{5}$/u.test(value.sqlState)) ||
    !SAFE_CODE.test(value.errorClass) ||
    (value.objectName !== null && !SAFE_OBJECT.test(value.objectName)) ||
    !/^[a-f0-9]{64}$/u.test(value.stdoutSha256) ||
    !/^[a-f0-9]{64}$/u.test(value.stderrSha256)
  ) {
    throw new Error("Failure evidence contains an invalid field");
  }
}

export async function persistFailureEvidence(filePath, value) {
  validateFailureEvidence(value);
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) {
    throw new Error("Failure evidence path must be absolute");
  }
  try {
    await access(filePath);
    throw new Error("Failure evidence already exists");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, bytes, { encoding: "utf8", flag: "wx" });
  await rename(temporaryPath, filePath);
  return { path: filePath, sha256: sha256(bytes) };
}

function appendLimited(current, chunk, maxOutputBytes) {
  if (current.endsWith(TRUNCATION_MARKER)) return current;
  const combined = Buffer.concat([Buffer.from(current), Buffer.from(chunk)]);
  if (combined.byteLength <= maxOutputBytes) return combined.toString("utf8");
  return `${combined.subarray(0, maxOutputBytes).toString("utf8")}${TRUNCATION_MARKER}`;
}

export function runProcessOnce({
  command,
  args,
  cwd = process.cwd(),
  env,
  stdin,
  sensitiveValues = [],
  maxOutputBytes = 1024 * 1024,
}) {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    throw new Error("maxOutputBytes must be a positive safe integer");
  }
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk, maxOutputBytes);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk, maxOutputBytes);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({
        exitCode: null,
        stdout: redactSensitiveText(stdout, sensitiveValues),
        stderr: redactSensitiveText(error.message, sensitiveValues),
        errorCode: error.code ?? "SPAWN_ERROR",
      });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      resolve({
        exitCode,
        stdout: redactSensitiveText(stdout, sensitiveValues),
        stderr: redactSensitiveText(stderr, sensitiveValues),
        errorCode: null,
      });
    });
    child.stdin.end(stdin);
  });
}
