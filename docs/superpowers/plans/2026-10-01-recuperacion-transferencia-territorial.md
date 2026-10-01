# Territorial Data Transfer Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the territorial production data transfer with a new auditable one-shot cycle that excludes only migration-preseeded catalogs, adopts the already verified schema without replaying it, and reaches `VERIFIED` without touching Vercel.

**Architecture:** Preserve the failed manifest, journal, and artifact as immutable evidence. Add a versioned `preseeded` data-policy class and deterministic source/target catalog probe, then create a recovery manifest whose journal adopts the existing schema through read-only checks before generating a new linted dump. A new manifest authorizes at most one native restore; its final remote write remains behind one exact confirmation after every read-only gate passes.

**Tech Stack:** Node.js ESM, `node:test`, PostgreSQL 17.11, Supabase CLI 2.119+, Docker Desktop, PowerShell, SHA-256 evidence, JSON manifests/journals.

**Spec:** `docs/superpowers/specs/2026-10-01-recuperacion-transferencia-territorial-design.md`

## Global Constraints

- Source is read-only SIPEEM-DEV `nppvprbfmjbhwheghipa`.
- The only writable database target is SIPEEM-TERRITORIAL-PROD `cdvukcthosppezjscwod`.
- Permanently denied refs remain `xvdqlozimvqluwxpbizx` and `ljlfezcpckrmbrmucbva`.
- Preserve manifest `8afa611bbdaf1d83889f28c699831caa726f25c958063df524c5efb7cb473ca4`, its `FAILED_CONFIRMED` journal, and artifact without modification.
- Never reset the target, delete target rows, reopen a terminal journal, edit an artifact in place, or retry automatically.
- Run Supabase with `--workdir infra/territorial`; credentials stay in the child environment and never enter arguments, Git, logs, evidence, or summaries.
- Recovery schema adoption and all pre-apply checks are remote read-only operations; only `data-apply` may write remotely.
- The recovery `data-apply` requires one exact `<recoveryManifestSha256>:DATA_APPLY` confirmation after the corrected artifact is ready.
- Keep Vercel, application Production, Auth, Storage, sessions, and operational data out of scope until the recovery journal is `VERIFIED`.
- On Windows use `npm.cmd`; use `& .\node_modules\.bin\tsc.cmd --noEmit` for direct TypeScript validation.

## Review Focus

- A catalog with identical rows but a different identity-sequence state must block adoption; Task 2 tests row and sequence mismatch independently.
- A `pg_dump` that excludes a preseeded table but still emits its `setval` must be rejected before the temporary artifact is published; Task 5 tests all three forbidden statement forms.
- A missing, nonterminal, wrong-ref, or wrong-hash predecessor journal must invalidate the recovery manifest; Task 3 tests every identity field.
- Matching migration history is insufficient if required objects, extensions, RLS, privileges, or operational-object boundaries drift; Task 4 tests each schema-adoption dimension.
- Process diagnostics may contain credentials or row values in multiline stderr; Task 5 tests that persisted and returned diagnostics contain only normalized codes and hashes.

---

### Task 1: Add a closed `preseeded` data-policy class

**Files:**
- Modify: `infra/territorial/data-policy.json`
- Modify: `scripts/territorial-promotion/data-policy.mjs`
- Modify: `scripts/territorial-promotion/data-policy.test.mjs`

**Interfaces:**
- Consumes: `classifySourceTables({ inventory, dataPolicy })` and the existing 66-table SIPEEM-DEV inventory fingerprint.
- Produces: `classifySourceTables(...) -> { include: string[], exclude: string[], preseeded: Array<{ table, migration, orderBy, ownedSequences }>, excludedFromDump: string[], inventorySha256 }`, where every table belongs to exactly one class and legacy contract-v1 policies remain readable for audit.

- [ ] **Step 1: Write failing policy tests**

Add tests named `classifies migration-preseeded tables exactly once` and `rejects incomplete or unsafe preseeded metadata`. Assert the exact six-table sorted set, require `migration`, nonempty `orderBy`, and `ownedSequences`, keep `public.fuerzas_electorales` in `include`, and reject duplicate/unknown/missing classifications.

- [ ] **Step 2: Run the policy tests and verify RED**

Run: `node --test scripts/territorial-promotion/data-policy.test.mjs`

Expected: FAIL because `preseeded` is unsupported and the reviewed policy still includes the six catalogs.

- [ ] **Step 3: Implement policy contract version 2**

Update `classifySourceTables` to preserve contract-v1 behavior and validate contract-v2 `include`, `exclude`, and `preseeded` as one closed partition. Return `excludedFromDump` as the sorted union of `exclude` and `preseeded`; continue requiring the three staging exclusions and document allowed `include -> preseeded` foreign keys without allowing `preseeded -> exclude` dependencies.

- [ ] **Step 4: Move exactly six catalog entries to `preseeded`**

Set `contractVersion` to `2` and declare these tables with their responsible migration, canonical ordering columns, and owned identity sequences: `cat_tipos_asentamiento`, `cat_fuentes_evento`, `cat_estados_evento`, `cat_estados_georreferenciacion`, `cat_niveles_sensibilidad`, and `cat_tipos_fuerza_electoral`. Do not move `fuerzas_electorales`.

- [ ] **Step 5: Run focused and full tests**

Run:

```powershell
node --test scripts/territorial-promotion/data-policy.test.mjs
npm.cmd run territorial:test
```

Expected: focused PASS and full territorial PASS.

- [ ] **Step 6: Commit**

```powershell
git add infra/territorial/data-policy.json scripts/territorial-promotion/data-policy.mjs scripts/territorial-promotion/data-policy.test.mjs
git commit -m "fix(db): classify migration-preseeded catalogs"
```

### Task 2: Probe and compare preseeded catalog state

**Files:**
- Create: `infra/territorial/supabase/tests/promotion_preseeded_catalogs.sql`
- Create: `scripts/territorial-promotion/preseeded.mjs`
- Create: `scripts/territorial-promotion/preseeded.test.mjs`
- Modify: `scripts/territorial-promotion/layout.mjs`
- Modify: `scripts/territorial-promotion/layout.test.mjs`

**Interfaces:**
- Consumes: `classification.preseeded` entries from Task 1 and Supabase query wrapper JSON.
- Produces: `parsePreseededReport(stdout)`, `comparePreseededReports({ source, target, expectedTables }) -> { status, evidenceSha256, issues }`, and one `promotion_preseeded_catalogs` SQL report.

- [ ] **Step 1: Write failing parser and comparator tests**

Cover exact equality, one row-hash difference, one count difference, one `lastValue` difference, one `isCalled` difference, missing/extra tables, malformed SHA-256, duplicate table names, and wrapper JSON containing exactly one report.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test scripts/territorial-promotion/preseeded.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic report parsing and comparison**

Use signatures:

```js
parsePreseededReport(stdout): PreseededReport
comparePreseededReports({ source, target, expectedTables }): {
  status: "PASSED" | "BLOCKED",
  evidenceSha256: string,
  issues: Array<{ code: string, detail: string }>
}
```

Canonicalize by fully qualified table name before hashing evidence. Never accept an unexpected table even if source and target agree.

- [ ] **Step 4: Add the read-only SQL probe**

Return contract version 1, kind `promotion_preseeded_catalogs`, row count and SHA-256 of ordered JSONB rows for exactly six tables, plus each declared sequence's `last_value` and `is_called`. Emit no row contents.

- [ ] **Step 5: Pin the SQL safety and layout contract**

Test one terminal statement, forbid mutating SQL keywords after removing comments, require all six table names and five owned sequences, and increment the territorial SQL test count in the layout invariant.

- [ ] **Step 6: Run focused and full tests, then commit**

```powershell
node --test scripts/territorial-promotion/preseeded.test.mjs scripts/territorial-promotion/layout.test.mjs
npm.cmd run territorial:test
git add infra/territorial/supabase/tests/promotion_preseeded_catalogs.sql scripts/territorial-promotion/preseeded.mjs scripts/territorial-promotion/preseeded.test.mjs scripts/territorial-promotion/layout.mjs scripts/territorial-promotion/layout.test.mjs
git commit -m "feat(db): verify preseeded catalog parity"
```

### Task 3: Introduce immutable recovery manifests and journals

**Files:**
- Modify: `scripts/territorial-promotion/manifest.mjs`
- Modify: `scripts/territorial-promotion/manifest.test.mjs`
- Modify: `scripts/territorial-promotion/journal.mjs`
- Modify: `scripts/territorial-promotion/journal.test.mjs`

**Interfaces:**
- Consumes: an existing contract-v1 manifest, its terminal journal, rollback evidence SHA-256, and the Task 2 catalog evidence SHA-256.
- Produces: `buildRecoveryManifest(input)`, `validateRecoveryManifest(manifest, context)`, `createRecoveryJournal({ manifestSha256, sourceCommit, sourceRef, targetRef, predecessorManifestSha256 })`, and journal transitions `PREFLIGHT_PASSED -> SCHEMA_ADOPTING -> SCHEMA_APPLIED` only for `DATA_RECOVERY` manifests.

- [ ] **Step 1: Write failing recovery-manifest tests**

Assert contract version 2, mode `DATA_RECOVERY`, predecessor hash, `FAILED_CONFIRMED`, cause `PRESEEDED_TABLE_COLLISION`, rollback evidence, catalog evidence, the same refs/49 migration hashes/expectations, and a distinct manifest SHA-256.

- [ ] **Step 2: Add negative manifest tests from Review Focus**

Reject a missing predecessor file, predecessor journal not terminal, predecessor manifest or journal hash mismatch, source/target ref mismatch, invalid evidence hashes, forbidden refs, altered migration bytes, and any secret-like field/value.

- [ ] **Step 3: Run manifest tests and verify RED**

Run: `node --test scripts/territorial-promotion/manifest.test.mjs`

Expected: FAIL because recovery contract version 2 is unsupported.

- [ ] **Step 4: Implement recovery manifest validation**

Add `buildRecoveryManifest(input)` and route `loadPromotionManifest` by `contractVersion`. The recovery validator must load and validate the predecessor artifacts supplied through context and require the current source commit to descend from the recovery manifest's `sourceCommit`.

- [ ] **Step 5: Write failing recovery-journal tests**

Assert the recovery sequence, reject `SCHEMA_APPLYING`, reject `FAILED_CONFIRMED -> anything`, reject recovery transitions for contract-v1 journals, and preserve probe-resolution requirements for `BLOCKED`/`FAILED_UNKNOWN`.

- [ ] **Step 6: Implement journal contract version 2**

Add `createRecoveryJournal({ manifestSha256, sourceCommit, sourceRef, targetRef, predecessorManifestSha256 })`. Extend journal identity with `mode` and `predecessorManifestSha256`; keep contract-v1 validation unchanged and terminal. Permit `SCHEMA_ADOPTING` only when `mode === "DATA_RECOVERY"`.

- [ ] **Step 7: Run focused/full tests and commit**

```powershell
node --test scripts/territorial-promotion/manifest.test.mjs scripts/territorial-promotion/journal.test.mjs
npm.cmd run territorial:test
git add scripts/territorial-promotion/manifest.mjs scripts/territorial-promotion/manifest.test.mjs scripts/territorial-promotion/journal.mjs scripts/territorial-promotion/journal.test.mjs
git commit -m "feat(db): add auditable data recovery cycle"
```

### Task 4: Adopt the existing schema through read-only evidence

**Files:**
- Create: `infra/territorial/supabase/tests/promotion_recovery_absence.sql`
- Create: `scripts/territorial-promotion/recovery.mjs`
- Create: `scripts/territorial-promotion/recovery.test.mjs`
- Modify: `scripts/territorial-promotion/preflight.mjs`
- Modify: `scripts/territorial-promotion/preflight.test.mjs`
- Modify: `scripts/territorial-promotion/layout.mjs`

**Interfaces:**
- Consumes: recovery manifest/journal, `promotion_schema_postflight`, Task 2 source/target reports, and `promotion_recovery_absence`.
- Produces: `runRecoveryPreflight({ manifest, migrationDir, exceptions, repoRoot, dependencies })` and `adoptRecoverySchema({ manifest, journal, repoRoot, dependencies }) -> { status, journal, evidenceSha256, issues }`.

- [ ] **Step 1: Write failing recovery preflight/adoption tests**

Pass only when target identity, PostgreSQL compatibility, Docker/psql health, 49 migration versions, four extensions, 82 territorial objects, required objects, RLS, privileges, functions, operational boundary, canonical-data absence, and preseeded parity all match.

- [ ] **Step 2: Add one blocking test per schema-adoption failure class**

Cover missing migration, missing extension, missing object, territorial-object count drift, RLS violation, privilege violation, function violation, operational object, nonempty canonical table, and preseeded mismatch. Assert no database write runner is invoked.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `node --test scripts/territorial-promotion/recovery.test.mjs scripts/territorial-promotion/preflight.test.mjs`

Expected: FAIL because recovery-aware preflight and adoption do not exist.

- [ ] **Step 4: Implement the exact absence report**

Return one read-only report containing the count of every `include` table and block when any count is nonzero. The SQL's table-name set must be asserted equal to the reviewed policy's `include` set in tests.

- [ ] **Step 5: Implement recovery preflight and schema adoption**

Recovery target preflight must not apply the original empty-target rule. `adoptRecoverySchema` transitions locally through `SCHEMA_ADOPTING`, queries all evidence serially per project, and reaches `SCHEMA_APPLIED` only with zero issues. A probe/process failure becomes `BLOCKED`, never a repair attempt.

- [ ] **Step 6: Update layout and run tests**

Run:

```powershell
node --test scripts/territorial-promotion/recovery.test.mjs scripts/territorial-promotion/preflight.test.mjs scripts/territorial-promotion/layout.test.mjs
npm.cmd run territorial:test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add infra/territorial/supabase/tests/promotion_recovery_absence.sql scripts/territorial-promotion/recovery.mjs scripts/territorial-promotion/recovery.test.mjs scripts/territorial-promotion/preflight.mjs scripts/territorial-promotion/preflight.test.mjs scripts/territorial-promotion/layout.mjs scripts/territorial-promotion/layout.test.mjs
git commit -m "feat(db): adopt verified schema for data recovery"
```

### Task 5: Lint corrected artifacts and preserve sanitized failure evidence

**Files:**
- Modify: `scripts/territorial-promotion/database-transfer.mjs`
- Modify: `scripts/territorial-promotion/database-transfer.test.mjs`
- Modify: `scripts/territorial-promotion/process.mjs`
- Modify: `scripts/territorial-promotion/process.test.mjs`

**Interfaces:**
- Consumes: `classification.excludedFromDump`, `classification.preseeded`, recovery manifest identity, and child-process results.
- Produces: `lintDataArtifact({ artifactPath, preseeded })`, `normalizeProcessFailure({ phase, result, sensitiveValues })`, and artifact metadata that records the lint evidence hash.

- [ ] **Step 1: Write failing dump-plan and artifact-lint tests**

Assert nine `--exclude` pairs, separate `exclude`/`preseeded` arrays, `fuerzas_electorales` inclusion, and rejection of quoted/unquoted `COPY`, `INSERT`, or `setval` references to any preseeded table/sequence.

- [ ] **Step 2: Run transfer tests and verify RED**

Run: `node --test scripts/territorial-promotion/database-transfer.test.mjs`

Expected: FAIL because the dump uses only three exclusions and has no artifact lint.

- [ ] **Step 3: Implement corrected dump planning and lint-before-rename**

Build dump args from `excludedFromDump`. After pg_dump succeeds, scan the temporary artifact and fail before `rename` if a forbidden preseeded statement exists; return `lintEvidenceSha256` in artifact metadata.

- [ ] **Step 4: Write failing diagnostic-normalization tests**

Use multiline stderr containing a password, connection URL, duplicate-key row value, SQLSTATE `23505`, and constraint name. Assert output contains only phase, exit/error codes, SQLSTATE, normalized class, a validated object identifier when present, and redacted stream hashes.

- [ ] **Step 5: Implement safe process diagnostics**

Add:

```js
normalizeProcessFailure({ phase, result, sensitiveValues }): {
  phase: string,
  exitCode: number | null,
  errorCode: string | null,
  sqlState: string | null,
  errorClass: string,
  objectName: string | null,
  stdoutSha256: string,
  stderrSha256: string
}
```

Persist only this object as `<artifact-directory>/failure.json` through an atomic `persistFailureEvidence(filePath, evidence)` helper and hash it into the journal transition. Add psql `VERBOSITY=verbose` without placing credentials in arguments.

- [ ] **Step 6: Run focused/full tests and commit**

```powershell
node --test scripts/territorial-promotion/database-transfer.test.mjs scripts/territorial-promotion/process.test.mjs
npm.cmd run territorial:test
git add scripts/territorial-promotion/database-transfer.mjs scripts/territorial-promotion/database-transfer.test.mjs scripts/territorial-promotion/process.mjs scripts/territorial-promotion/process.test.mjs
git commit -m "fix(db): harden recovery artifacts and diagnostics"
```

### Task 6: Integrate recovery commands without adding a retry path

**Files:**
- Modify: `scripts/territorial-promotion/cli.mjs`
- Modify: `scripts/territorial-promotion/cli.test.mjs`
- Create: `scripts/territorial-promotion/freeze-recovery-manifest.mjs`
- Create: `scripts/territorial-promotion/freeze-recovery-manifest.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 2-5 modules and contract-v2 recovery manifests.
- Produces: `recovery-preflight`, `schema-adopt`, existing `data-plan`, existing `data-apply`, `verify`, and `status` dispatch for `DATA_RECOVERY`; no `retry` command.

- [ ] **Step 1: Write failing CLI contract tests**

Assert `schema-adopt` accepts no confirmation and is read-only, `data-apply` is the only recovery remote-write command, contract-v1 manifests cannot invoke recovery commands, recovery manifests cannot invoke `schema-apply`, and `retry` remains unknown.

- [ ] **Step 2: Add orchestration tests**

Test new journal/artifact paths by recovery manifest hash, predecessor preservation, source and target preseeded probes, serialized per-project reads, artifact lint metadata, sanitized failure summary, and exact recovery confirmation.

- [ ] **Step 3: Run CLI tests and verify RED**

Run: `node --test scripts/territorial-promotion/cli.test.mjs`

Expected: FAIL because the commands and recovery routing are absent.

- [ ] **Step 4: Implement recovery-aware dispatch**

Route contract-v2 manifests through `runRecoveryPreflight` and `adoptRecoverySchema`; retain existing contract-v1 behavior. Do not expose an option that skips probes, reuses the old artifact, overrides refs, or replays a terminal journal.

- [ ] **Step 5: Add a manifest-freeze helper script entry**

Implement `freezeRecoveryManifest({ outputPath, input, context })` in `freeze-recovery-manifest.mjs` and expose it through an npm script. It builds from reviewed repository files and explicit predecessor paths, writes atomically, and refuses to overwrite an existing manifest. Its tests must prove it cannot read database credentials or execute remote writes.

- [ ] **Step 6: Run focused/full tests and commit**

```powershell
node --test scripts/territorial-promotion/cli.test.mjs scripts/territorial-promotion/freeze-recovery-manifest.test.mjs
npm.cmd run territorial:test
git add scripts/territorial-promotion/cli.mjs scripts/territorial-promotion/cli.test.mjs scripts/territorial-promotion/freeze-recovery-manifest.mjs scripts/territorial-promotion/freeze-recovery-manifest.test.mjs package.json
git commit -m "feat(db): orchestrate one-shot territorial recovery"
```

### Task 7: Verify the implementation and freeze the recovery manifest

**Files:**
- Create: `infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod-recovery-01.json`
- Modify: `.superpowers/sdd/2026-10-01-promocion-territorial-produccion/progress.md` (ignored runtime ledger only)

**Interfaces:**
- Consumes: completed Tasks 1-6 and immutable predecessor evidence.
- Produces: one committed, secret-free recovery manifest pinned to the implementation commit and its ancestor contract.

- [ ] **Step 1: Run the complete local verification suite**

Run:

```powershell
npm.cmd run territorial:layout:check
npm.cmd run territorial:test
node --test scripts/demografia/*.test.mjs scripts/lista-nominal/*.test.mjs scripts/import-ine*.test.mjs scripts/publish-inegi-eceg.test.mjs
npm.cmd run build
& .\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run lint
git diff --check
```

Expected: all promotion/regression/type/build checks PASS. Full lint may report only the three unchanged baseline findings already recorded; focused ESLint over all changed `.mjs` files must PASS.

- [ ] **Step 2: Freeze the recovery manifest from current HEAD**

Use promotion id `sipeem-territorial-prod-recovery-2026-10-01-01`, cause `PRESEEDED_TABLE_COLLISION`, the predecessor manifest hash, predecessor terminal evidence, the observed rollback evidence, and the confirmed preseeded parity evidence. Validate it immediately after writing.

- [ ] **Step 3: Confirm manifest secrecy and immutability**

Run tests that recompute its hash, all 49 migration hashes, policy fingerprint, ancestor relation, predecessor identity, and secret scan. Verify the old manifest, journal, and artifact checksums are unchanged.

- [ ] **Step 4: Commit the frozen manifest**

```powershell
git add infra/territorial/manifests/production/2026-10-01-sipeem-territorial-prod-recovery-01.json
git commit -m "chore(db): freeze territorial recovery manifest"
```

### Task 8: Execute read-only recovery gates and generate a new artifact

**Files:**
- Runtime only: new journal, probe evidence, artifact SQL, artifact metadata, and diagnostics under the recovery manifest hash.
- Preserve: all runtime files under predecessor hash `8afa611bbdaf1d83889f28c699831caa726f25c958063df524c5efb7cb473ca4`.

**Interfaces:**
- Consumes: frozen recovery manifest and healthy Docker/PostgreSQL 17.11 client.
- Produces: recovery journal `SCHEMA_APPLIED` and a new immutable, linted data artifact; no remote database write.

- [ ] **Step 1: Recompute predecessor checksums and inspect target state read-only**

Expected: predecessor journal remains `FAILED_CONFIRMED`; old artifact checksum remains `d56c28da8db05271c9524f086398b30f2465fe82c30941a6ac902b6b9b718b2e`; target has schema, six exact preseeded catalogs, and zero included canonical rows.

- [ ] **Step 2: Run recovery preflight**

Run `territorial:promote recovery-preflight` with the recovery manifest.

Expected: source and target identity/health/PG17 checks PASS and new journal reaches `PREFLIGHT_PASSED`.

- [ ] **Step 3: Adopt the schema read-only**

Run `territorial:promote schema-adopt` with the recovery manifest.

Expected: 49 migrations, four extensions, 82 objects, zero security/operational violations, zero included data rows, exact seed parity, and journal `SCHEMA_APPLIED`.

- [ ] **Step 4: Generate the corrected data artifact once**

Run `territorial:promote data-plan` with the recovery manifest.

Expected: a new nonempty artifact under the recovery hash, nine excluded tables, no forbidden preseeded statements or sequence `setval`, `fuerzas_electorales` present, and SHA-256/size/lint evidence recorded.

- [ ] **Step 5: Re-run only read-only checks and stop before writing**

Expected: journal remains `SCHEMA_APPLIED`; target remains data-empty except preseeded catalogs; CLI prints the exact `<recoveryManifestSha256>:DATA_APPLY` confirmation required for the next task. Report this evidence and request the single explicit remote-write authorization.

### Task 9: Perform the authorized native restore and integral verification

**Files:**
- Runtime only: recovery journal and sanitized process evidence.
- Verify: `infra/territorial/supabase/tests/promotion_postflight.sql`
- Verify: `infra/territorial/supabase/tests/promotion_preseeded_catalogs.sql`

**Interfaces:**
- Consumes: Task 8 evidence, journal `SCHEMA_APPLIED`, exact recovery confirmation, and operating-system credential provider.
- Produces: recovery journal `VERIFIED`; does not modify Vercel.

- [ ] **Step 1: Verify the explicit authorization matches the recovery hash**

Do not infer this authorization from earlier approvals. If it is absent or differs by one character, stop without a database process.

- [ ] **Step 2: Execute one native `data-apply`**

Use Docker PostgreSQL 17.11, the pooler connection, child-environment credentials, `--single-transaction`, `ON_ERROR_STOP=on`, and `VERBOSITY=verbose`.

Expected: exactly one process invocation and journal `DATA_APPLIED`. Any failure becomes `FAILED_CONFIRMED` or `FAILED_UNKNOWN` with no automatic second invocation.

- [ ] **Step 3: Run integral postflight**

Run `territorial:verify` with the recovery manifest.

Expected: counts `1/7052/125/45/40/6544/7191`, source hashes/states, geometry expectations, ECEG/nominal correspondences, RPC, security, operational boundary, advisors, and preseeded parity all match; journal reaches `VERIFIED`.

- [ ] **Step 4: Confirm isolation and preserve evidence**

Run `git status --short`, verify no runtime artifact is versionable, confirm Vercel and forbidden Supabase refs were untouched, and append the final evidence hashes/result to the ignored SDD ledger.

- [ ] **Step 5: Run final local verification and commit any documentation-only handoff**

Re-run territorial tests, focused ESLint, typecheck/build as needed, and `git diff --check`. Do not begin Preview cutover in this plan.

