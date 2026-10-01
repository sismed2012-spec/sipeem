import { spawn } from "node:child_process";

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
