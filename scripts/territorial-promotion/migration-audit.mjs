import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const MIGRATION_NAME = /^\d{14}_[a-z0-9_]+\.sql$/u;
const ALLOWED_SCHEMAS = new Set(["public", "extensions", "territorial_private"]);
const PROJECT_REFERENCE = /\b(?:nppvprbfmjbhwheghipa|cdvukcthosppezjscwod|xvdqlozimvqluwxpbizx|ljlfezcpckrmbrmucbva)\b/giu;

export const SECURITY_DEFINER_JUSTIFICATION =
  "Función privilegiada histórica revisada; requiere search_path fijo y privilegios explícitos.";

function finding(rule, file, line, message, signature = null, severity = "error") {
  return { rule, file, line, signature, severity, message };
}

function substantiveLines(sql) {
  return sql
    .split(/\r?\n/u)
    .map((text, index) => ({ text: text.replace(/--.*$/u, "").trim(), line: index + 1 }))
    .filter(({ text }) => text.length > 0 && text !== ";");
}

function findFunctionSignature(lines, index) {
  const preceding = lines
    .slice(Math.max(0, index - 12), index + 1)
    .map(({ text }) => text)
    .join(" ");
  const matches = [
    ...preceding.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_$]*\.[a-z_][a-z0-9_$]*)\s*\(/giu,
    ),
  ];
  return matches.at(-1)?.[1]?.toLowerCase() ?? null;
}

function validateExceptions(exceptions) {
  if (!Array.isArray(exceptions)) throw new Error("exceptions must be an array");
  const keys = new Set();
  for (const [index, exception] of exceptions.entries()) {
    if (
      exception?.rule !== "SECURITY_DEFINER" ||
      typeof exception.file !== "string" ||
      !MIGRATION_NAME.test(exception.file) ||
      !Number.isSafeInteger(exception.line) ||
      exception.line <= 0 ||
      typeof exception.signature !== "string" ||
      !/^[a-z_][a-z0-9_$]*\.[a-z_][a-z0-9_$]*$/u.test(exception.signature) ||
      exception.justification !== SECURITY_DEFINER_JUSTIFICATION
    ) {
      throw new Error(`Malformed security exception at index ${index}`);
    }
    const key = `${exception.rule}|${exception.file}|${exception.line}|${exception.signature}`;
    if (keys.has(key)) throw new Error(`Duplicate exception: ${key}`);
    keys.add(key);
  }
}

function auditTransactionControl(file, sql, errors, warnings) {
  const lines = substantiveLines(sql);
  const controls = lines.filter(({ text }) => /^(?:begin|start\s+transaction|commit|rollback)\s*;$/iu.test(text));
  if (controls.length === 0) return;
  const completeOuter =
    controls.length === 2 &&
    /^(?:begin|start\s+transaction)\s*;$/iu.test(controls[0].text) &&
    /^commit\s*;$/iu.test(controls[1].text) &&
    controls[0] === lines[0] &&
    controls[1] === lines.at(-1);
  if (completeOuter) {
    warnings.push(
      finding(
        "OUTER_TRANSACTION",
        file,
        controls[0].line,
        "Migration contains one complete outer transaction",
        null,
        "warning",
      ),
    );
    return;
  }
  errors.push(
    finding(
      "NESTED_TRANSACTION",
      file,
      controls[0].line,
      "Migration contains nested, repeated, or misplaced transaction control",
    ),
  );
}

function auditStatements(file, sql, errors) {
  const lines = sql.split(/\r?\n/u);
  for (const [index, text] of lines.entries()) {
    const line = index + 1;
    if (/\bdrop\s+(?:table|view|materialized\s+view|schema|function|type|index)\b[^;]*\bcascade\b/iu.test(text)) {
      errors.push(finding("DROP_CASCADE", file, line, "DROP ... CASCADE is forbidden"));
    }
    if (/\bgrant\b[^;]*\bto\s+(?:group\s+)?public\b/iu.test(text)) {
      errors.push(finding("GRANT_TO_PUBLIC", file, line, "Implicit PUBLIC grants are forbidden"));
    }
    if (PROJECT_REFERENCE.test(text)) {
      errors.push(finding("PROJECT_REFERENCE", file, line, "Project references are forbidden in migrations"));
    }
    PROJECT_REFERENCE.lastIndex = 0;
    if (/\bsecurity\s+definer\b/iu.test(text)) {
      errors.push(
        finding(
          "SECURITY_DEFINER",
          file,
          line,
          "SECURITY DEFINER requires an exact reviewed exception",
          findFunctionSignature(
            lines.map((value, itemIndex) => ({ text: value, line: itemIndex + 1 })),
            index,
          ),
        ),
      );
    }
  }

  const objectPattern = /\bcreate\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view|function|procedure|sequence|type)\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_$]*)\s*\./giu;
  for (const match of sql.matchAll(objectPattern)) {
    const schema = match[1].toLowerCase();
    if (!ALLOWED_SCHEMAS.has(schema)) {
      const line = sql.slice(0, match.index).split(/\r?\n/u).length;
      errors.push(
        finding(
          "OBJECT_OUTSIDE_ALLOWED_SCHEMA",
          file,
          line,
          `Object creation in schema ${schema} is outside the territorial domain`,
          `${schema}.*`,
        ),
      );
    }
  }
}

function applyExceptions(errors, exceptions) {
  const used = new Set();
  const remaining = errors.filter((item) => {
    if (item.rule !== "SECURITY_DEFINER") return true;
    const index = exceptions.findIndex(
      (exception, candidateIndex) =>
        !used.has(candidateIndex) &&
        exception.rule === item.rule &&
        exception.file === item.file &&
        Math.abs(exception.line - item.line) <= 2 &&
        exception.signature === item.signature &&
        exception.justification === SECURITY_DEFINER_JUSTIFICATION,
    );
    if (index < 0) return true;
    used.add(index);
    return false;
  });
  const unused = exceptions.filter((_, index) => !used.has(index));
  if (unused.length > 0) {
    throw new Error(
      `Unused exception: ${unused.map(({ file, line, signature }) => `${file}:${line}:${signature}`).join(", ")}`,
    );
  }
  return {
    errors: remaining,
    exceptionsUsed: exceptions.filter((_, index) => used.has(index)),
  };
}

export async function auditMigrations({ migrationDir, exceptions = [] }) {
  validateExceptions(exceptions);
  const entries = await readdir(migrationDir, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  const errors = [];
  const warnings = [];

  for (const file of sqlFiles) {
    if (!MIGRATION_NAME.test(file)) {
      errors.push(finding("OPERATIONAL_FILE", file, 1, "Only timestamped migrations are allowed"));
    }
    const sql = await readFile(path.join(migrationDir, file), "utf8");
    auditTransactionControl(file, sql, errors, warnings);
    auditStatements(file, sql, errors);
  }

  const resolved = applyExceptions(errors, exceptions);
  return {
    passed: resolved.errors.length === 0,
    filesScanned: sqlFiles.length,
    errors: resolved.errors,
    warnings,
    exceptionsUsed: resolved.exceptionsUsed,
  };
}
