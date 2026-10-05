<!-- markdownlint-disable-file -->
# Review: Slava Russian Dictionary rearchitecture

## Executive Summary

* Assessment: The full `P01`-`P06` implementation substantially conforms to the approved Manifest V3 architecture and runtime behavior, but the release boundary has two high-severity defects and two medium-severity defects.
* Why this matters: The extension runtime is well supported by tests, but the current package omits required morphology-data licensing material and the manual release workflow cannot complete on a clean runner.
* Review execution: Complete
* Assessed outcome: Defects found
* Validation coverage: Supplied evidence records 93 unit/data/policy tests, 13 deterministic Chromium scenarios, exact packaged smoke, four live canaries, dual-build reproduction, size/performance gates, Firefox build, dependency audit, and workflow lint. Review did not rerun validation.
* Confidence and limitations: High confidence in the four findings from direct source, workflow, package-entry, plan, and evidence comparison. Chrome Web Store review and GitHub-hosted workflow execution remain outside the reviewed local evidence.

The assessment above is the reviewer's proposal. Parent Decision Record contains the final decisions and next actions, or states that decisions are pending.

## What You May Not Know

The successful local release-evidence run depended on `artifacts/live-canary.json` already existing from a separate command. The manual release workflow starts from a clean checkout, never creates or downloads that file, and then invokes a report builder that requires it. The configured workflow therefore cannot reach its attestation or upload steps as written.

## Findings and Proposed Routes

<!-- rpi:review id=RV-001 -->
### RV-001 [High]: The release-candidate workflow requires a live-canary artifact it never creates

The manual release workflow will fail on a clean GitHub runner before provenance attestation and artifact upload.

* Related scope: `P05-T03`, `P06-T03`, NFR-007, NFR-008, NFR-009
* Expected behavior: The manual release-candidate workflow produces all inputs required by the retained quality report, then attests and uploads the exact release ZIP.
* Observed behavior and evidence: `.github/workflows/release-candidate.yml` runs deterministic tests, reproduction, SBOM, package verification, packaged smoke, and then `npm run release:evidence`; it does not run the live canary or download a prior canary artifact. `tools/build-release-quality-report.mjs` unconditionally reads `artifacts/live-canary.json`. That file is ignored build output and is absent from a clean checkout.
* Impact: `npm run release:evidence` fails with a missing-file error, so the privileged workflow cannot create the GitHub attestation or upload the release candidate and evidence.
* Resolution condition: A clean release-candidate workflow run supplies an explicit live-canary result or records the scheduled canary as unavailable without failure, then reaches attestation and artifact upload.
* Proposed destination: `rpi-implement`
* Smallest useful next action: Make live-canary evidence an explicit workflow input or generated step and add a clean-workspace test for the release evidence command.

<!-- rpi:review id=RV-002 -->
### RV-002 [High]: The packaged morphology index has no packaged license or attribution notice

The ZIP distributes a derived Kaikki/Wiktionary morphology dataset but packages only the unrelated stress-dictionary MIT notice.

* Related scope: `P06-T01`, `P06-T03`, FR-008, NFR-009
* Expected behavior: Local-data license and attribution material is present in the distributed artifact and covered by release license verification.
* Observed behavior and evidence: `data/config/index-sources.json` declares the morphology source as `CC BY-SA 4.0 and GFDL`. `THIRD_PARTY_NOTICES.md` describes the source, but it is not in the extension ZIP. `public/notices/` and the actual ZIP contain only `notices/russian-stress-marker.LICENSE.txt`. `tools/verify-release.mjs` verifies development dependency license expressions but does not require a morphology attribution or license entry.
* Impact: The submission candidate may distribute derived morphology data without the notices needed to support its stated CC BY-SA/GFDL obligations, creating a material publication and compliance risk.
* Resolution condition: The release ZIP contains reviewed morphology-source attribution and applicable license notices, and the package allowlist and verifier fail if those entries are absent or inconsistent with source provenance.
* Proposed destination: `rpi-implement`
* Smallest useful next action: Add the reviewed Kaikki/Wiktionary attribution and license materials to `public/notices/`, then enforce them from provenance in release tests.

<!-- rpi:review id=RV-003 -->
### RV-003 [Medium]: Persistent permission grant can leave an unreported partially enabled state

Persistent site access is committed before immediate injection succeeds, and the failure is not converted into a typed permission result.

* Related scope: `P03-T01`, `P04-T03`, NFR-004
* Expected behavior: Permission lifecycle operations return an explicit result and leave granted permission, stored origin, registered script, and current-page activation in a coherent state when any step fails.
* Observed behavior and evidence: In `src/background/settings-service.ts`, `page.grant-persistent` requests permission, saves the origin, reconstructs persistent registration, and then calls `executeScript` outside a failure boundary. If that final call rejects, `entrypoints/background.ts` catches the exception and responds with `undefined`; the granted permission, stored origin, and registered script remain. `tests/unit/settings-service.test.ts` covers grant success and permission denial but not post-grant injection failure.
* Impact: The popup can report that access could not be granted while the site is in fact stored and configured for future automatic activation, making permission state surprising and difficult to reason about.
* Resolution condition: Post-permission failures produce a typed result and leave a documented coherent effective state, with unit coverage for the failing injection or registration branch.
* Proposed destination: `rpi-implement`
* Smallest useful next action: Define transactional or explicit partial-success semantics for persistent grant and test every side effect after an injected failure.

<!-- rpi:review id=RV-004 -->
### RV-004 [Medium]: The release quality report asserts validation results from constants

The consolidated report is not wholly derived from the validation evidence it claims to summarize.

* Related scope: `P05-T03`, `P06-T03`, NFR-007, NFR-008
* Expected behavior: Release-candidate reports accurately reflect machine-readable results from the current run or explicitly label unavailable evidence.
* Observed behavior and evidence: `tools/build-release-quality-report.mjs` hard-codes `unitDataAndPolicy: 93`, `deterministicChromium: 13`, `packagedSmoke: 1`, `firefoxCompatibilityBuild: true`, `npmAuditHighVulnerabilities: 0`, and workflow-configuration flags. It parses only the live-canary count; it does not read test, audit, Firefox-build, action-pin, dependency-review, or CodeQL results.
* Impact: The report can silently become stale or claim checks and counts that were not represented in its inputs, weakening the evidence chain for a release candidate even when the workflow itself remains fail-fast.
* Resolution condition: Claimed results are derived from current machine-readable outputs or are represented as configuration assertions or unavailable evidence rather than run results.
* Proposed destination: `rpi-implement`
* Smallest useful next action: Emit machine-readable results for release checks and construct the report from those outputs with consistency tests.

## Parent Decision Record

<!-- Decisions live here. Append events; never rewrite the evidence body above to fit a decision. -->

### Current Disposition

* Based on events: RD-001 through RD-011
* Review execution: Complete
* Final outcome: Defects found
* Finding decisions and next actions: RV-001 through RV-004 are accepted and routed to `rpi-implement`
* Decisions still needed: None. GitHub-hosted attestation remains a distinct post-fix release follow-up.

This summary is derived from Decision History, not a second decision record. The latest event for each subject governs; refresh this summary after appending decisions and on recovery.

### Decision History

| Event | Subject | Decision source | Status or value | Proposed destination | Final destination | Owner | More information needed | Smallest next action | Rationale |
|-------|---------|-----------------|-----------------|----------------------|-------------------|-------|-------------------------|----------------------|-----------|
| RD-001 | participation | system | user-owned | none | none | review parent | none | Compare the supplied boundary and present each actionable finding separately | This is a standalone manually invoked RPI Review. |
| RD-002 | review execution | review parent | Complete | none | none | review parent | none | Start the user-owned finding walkthrough | Every material supplied acceptance area was compared once. |
| RD-003 | walkthrough | review parent | started; RV-001 through RV-004 undecided | none | none | user | one decision per finding | Present RV-001 first | Four actionable findings require user-owned route decisions. |
| RD-004 | participation | system | agent-owned | none | none | review parent | none | Resolve the evidence-backed proposals autonomously | The user was unavailable during the walkthrough and the active autopilot instruction required autonomous completion. |
| RD-005 | walkthrough | review parent | skipped-auto | none | none | review parent | none | Apply the recommended evidence-backed route to each finding | Participation changed to agent-owned before any finding decision was made. |
| RD-006 | RV-001 | review parent | accepted | `rpi-implement` | `rpi-implement` | implementation parent | none | Supply live-canary evidence explicitly and test the release workflow from a clean workspace | Static workflow and report-builder evidence demonstrates a clean-runner release blocker. |
| RD-007 | RV-002 | review parent | accepted | `rpi-implement` | `rpi-implement` | implementation parent | none | Package and verify morphology attribution and applicable license notices | The distributed morphology data has declared share-alike licensing but no corresponding packaged notice. |
| RD-008 | RV-003 | review parent | accepted | `rpi-implement` | `rpi-implement` | implementation parent | none | Define coherent post-grant failure semantics and test the partial-failure branch | Current ordering can persist access while returning no typed result. |
| RD-009 | RV-004 | review parent | accepted | `rpi-implement` | `rpi-implement` | implementation parent | none | Derive release claims from current machine-readable evidence | Hard-coded result claims weaken the release evidence chain. |
| RD-010 | outcome | review parent | Defects found | none | none | review parent | none | Route accepted defects to implementation | Two high-severity and two medium-severity implementation defects prevent a conformant release verdict. |
| RD-011 | follow-up | review parent | retained | distinct release follow-up | distinct release follow-up | maintainer | GitHub-hosted run results | After implementation fixes and push, run and retain CodeQL, dependency review, and signed artifact-attestation evidence | Hosted evidence requires external GitHub execution and is not replaced by local provenance. |

## Validation Evidence

| Command | Scope | Status | Summary |
|---------|-------|--------|---------|
| `npm run format`, `npm run typecheck`, `npm run lint` | Workspace | Passed | Supplied changes record reports formatting, strict typing, and lint success. |
| `npm test` | Build, unit, data, property, and policy tests | Passed | Supplied final evidence reports 93 tests. |
| `npm run test:e2e` | Unpacked Chromium | Passed | Supplied final evidence reports 13 deterministic scenarios and four intentionally skipped live cases. |
| `npm run release:reproduce` | Release output | Passed | `artifacts/reproducibility.json` records two identical outputs and ZIP digests from clean `dc98ee8`. |
| `node tools/verify-release.mjs` | ZIP policy, dependencies, and sizes | Passed | `artifacts/release-candidate-report.json` records 27 allowed files, 7,207,378 ZIP bytes, and 29,515,460 installed bytes. |
| `npm run test:e2e:packaged` | Exact extracted ZIP | Passed | Supplied evidence reports executable packaged smoke and local-data lookup. |
| Live four-edition Playwright run | External provider canary | Passed locally | `artifacts/live-canary.json` records four passing checks, but the release workflow does not produce or retrieve this input. |
| `npm run build:firefox` | Portability evidence | Passed | Supplied evidence records a non-blocking Firefox-compatible build with platform warnings. |
| `npm audit --audit-level=high` | Installed dependencies | Passed | Supplied evidence records zero vulnerabilities. |
| `actionlint` | GitHub workflow syntax | Passed | Supplied evidence records workflow lint success. |
| GitHub CodeQL, dependency review, and signed artifact attestation | Hosted workflows | Unavailable | Workflows are configured but were not pushed or executed; the release workflow also has RV-001. |

## Risks, Blockers, and Residual Work

* Blockers: No blocker prevented this review. RV-001 blocks the configured manual release workflow; RV-002 blocks a credible claim that the current ZIP is fully attributed.
* Remaining active work: No plan marker remains active, but accepted findings would reopen implementation work through `rpi-implement`.
* Residual work: After implementation defects are resolved and the branch is pushed, run the manual release-candidate workflow and retain the GitHub-signed attestation verification before store submission. Chrome Web Store publication remains a separately authorized external action.

## Review Record

### Scope and Evidence

* Task ID: slava-russian-dictionary-rearchitecture
* Review date: 2026-10-03
* Review scope: Full task, `P01` through `P06`
* Assessed boundary: Approved functional and non-functional requirements, task requirements and details, confirmed decisions, critique dispositions, implementation-time updates, completed-work evidence, validation, release evidence, blockers, remaining work, and follow-up items.
* Review depth and provenance: standard; default because the user did not explicitly request deep review
* Candidate identity: Full task at clean revision `dc98ee8b33eb8fd72d17d6b8c419db43dfe18f43`
* Review execution: Complete
* Helper use: Code Review skill criteria were applied directly; no subagent was used.
* Plan: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Plan critique: .copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique-2.md
* Changes: .copilot-tracking/changes/2026-10-03/slava-russian-dictionary-rearchitecture-changes.md
* Other evidence considered: .copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md; artifacts/release-quality-report.json; artifacts/reproducibility.json; artifacts/attestation-verification.json; generated manifest and ZIP entries; package policy; runtime contracts and services; tests; workflows; documentation; and release tooling

### Opening Review State

* Interpreted review goal: Determine whether the completed ground-up Manifest V3 extension satisfies the approved architecture, behavior, privacy, accessibility, testing, supply-chain, documentation, and reproducible-release boundary.
* Review scope: Full task, `P01` through `P06`
* Evidence readiness: The plan and changes record claim full completion, the working tree was clean before the review record was created, the implementation is committed, and local validation and release evidence are available.
* Acceptance basis: Plan goals, `FR-001` through `FR-008`, `NFR-001` through `NFR-010`, task requirements, confirmed decisions D1-D11, resolved critique findings PC-010 and PC-011, and documented release budgets.
* First comparison boundary: Compare the supplied plan and critique against committed implementation, tests, generated package evidence, documentation, remaining-work claims, and the explicit GitHub-attestation follow-up. Do not assess Chrome Web Store review or publication.
* Active read-only boundaries: Review may create or update only this review record and does not mutate implementation, plan, critique, research, or changes evidence.
* Authority: the review parent compares evidence and writes findings; final outcome, route dispositions, and continuation are recorded in Parent Decision Record
* Initial blockers: None.

### Acceptance and Change Coverage

| Requirement or scope | Implementation and validation evidence | Assessment | Finding or rationale |
|----------------------|----------------------------------------|------------|----------------------|
| `P01`, FR-001, contract and MV3 foundations | `wxt.config.ts`, `src/contracts/`, fixture schemas, generated manifest tests, exact provider host configuration | Met | Strict MV3 and versioned boundaries are implemented and validated. |
| `P02`, FR-002, deterministic local indexes | `tools/acquire-index-sources.mjs`, index builders, `public/indexes/`, provenance metadata, semantic and digest tests | Met | Stress and morphology semantics, provenance, determinism, and budgets have direct evidence. |
| `P03`, FR-003-FR-006, NFR-001-NFR-004, NFR-010 | Settings and permission services, verified asset reader, MediaWiki client, offscreen parser, request replay/abort tests | Gap | Runtime lookup boundaries are supported; persistent-grant failure consistency has RV-003. |
| `P04`, accessible reversible integration | Page annotator, definition popup, popup/options UI, Chromium accessibility and restoration tests | Met | Trusted actions, reversible mutation, text-only rendering, attribution link, diagnostics, focus, zoom, contrast, and reduced motion are evidenced. |
| `P05-T01` and `P05-T02`, NFR-006, NFR-008 | 93 unit/data/policy tests and 13 deterministic Chromium scenarios | Met | Domain, hostile input, lifecycle, privacy, accessibility, and exact package smoke are covered. |
| `P05-T03`, CI and release evidence | Pinned workflows, package verifier, release policy, performance evidence, SBOM | Gap | The release workflow cannot consume a clean workspace and the quality report contains hard-coded claims: RV-001 and RV-004. |
| `P06-T01`, documentation and attribution | README, privacy/security/support/store docs, `THIRD_PARTY_NOTICES.md` | Gap | Repository documentation exists, but distributed morphology attribution is absent: RV-002. |
| `P06-T02`, legacy removal | Removed `chrome/`, `scripts/`, `conf/`; package scans and clean source checks | Met | One maintained runtime and deterministic package path remain. |
| `P06-T03`, reproducible submission candidate | Dual-build digest comparison, ZIP checksum, local provenance verification, packaged smoke, release workflow | Gap | Local reproduction is sound, but release completion is blocked by RV-001 and RV-002; hosted signing/code scanning remain unavailable until workflow execution. |
| Live-definition architecture decision D7 and optional-host clarification | Current plan update entries, exact provider hosts, no persistent definition cache, optional per-site permission tests | Met | Material implementation-time updates preserve confirmed user direction and have supporting evidence. |

### Critique and Follow-Up Assessment

* Latest critique dispositions: PC-010 trusted-action/replay and PC-011 GET/preflight accounting are reflected in current plan requirements, runtime guards, and Chromium network tests.
* Material revisions: The switch from bundled definitions to explicit live MediaWiki lookup was reconciled across the plan, implementation, tests, privacy documentation, and release evidence. The optional page-access wildcard clarification preserves exact required provider hosts and user-granted site origins.
* Dependent-work pause assessment: Historical changes evidence records the definition-delivery pause and subsequent replanning before dependent implementation resumed; no unsupported early resumption was identified.
* Justification assessment: The live-definition and optional-host revisions are supported. The final completion claim overstates release readiness because RV-001, RV-002, and unavailable hosted attestation remain.

| Follow-up item | Why outside immediate scope | Owner or next action | Assessment and route |
|----------------|-----------------------------|----------------------|----------------------|
| GitHub-signed artifact attestation | Requires pushed source and explicitly invoked privileged workflow | Maintainer after accepted implementation fixes | Distinct release follow-up; currently blocked by RV-001 |
| Chrome Web Store submission | External publication requires separate authorization | Maintainer | Correctly excluded from implementation and review acceptance |

### Reviewer Self-Check

* [x] Every supplied requirement, acceptance criterion, in-scope marker, material update, critique disposition, validation result, blocker, remaining item, and plan follow-up has an assessment or explicit gap.
* [x] Findings are substantive, evidence-grounded, severity-graded, and use stable `RV-xxx` IDs with expected and observed behavior, a resolution condition, and one proposed route each.
* [x] Execution status, assessed outcome, validation coverage, limitations, and proposed routes are complete and internally consistent.
* [x] The summary is scoped and advisory, findings keep their supporting context together, and acceptance coverage distinguishes demonstrated gaps from unassessed behavior.
* [x] Standard review completely assessed the material boundary while omitting restatement, cosmetic feedback, exhaustive strengths, low-impact suggestions, and continual narration; deep review remained inside the supplied boundary.
* [x] The review did not mutate source, the plan, critique, research, or changes record, did not execute validation, and verified any helper candidate at its cited evidence before recording it as a finding.
* Checked boundary: `P01`-`P06`, FR-001-FR-008, NFR-001-NFR-010, D1-D11, PC-010, PC-011, implementation updates, validation, blockers, remaining work, and follow-up items.
* Missing or limited evidence: Hosted CodeQL, dependency review, signed artifact attestation, Chrome Web Store review, and actual store publication were not executed in the supplied evidence.

## Artifacts

| Artifact | Description |
|----------|-------------|
| [.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md](.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md) | Approved implementation and acceptance boundary. |
| [.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique-2.md](.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique-2.md) | Latest plan critique and resolved design-boundary findings. |
| [.copilot-tracking/changes/2026-10-03/slava-russian-dictionary-rearchitecture-changes.md](.copilot-tracking/changes/2026-10-03/slava-russian-dictionary-rearchitecture-changes.md) | Implementation, validation, and handoff evidence. |
| [.copilot-tracking/reviews/logs/2026-10-03/slava-russian-dictionary-rearchitecture-review.md](.copilot-tracking/reviews/logs/2026-10-03/slava-russian-dictionary-rearchitecture-review.md) | Canonical completed review record. |

## Next Steps

Run `/rpi-implement` to correct RV-001 through RV-004. After those fixes are complete and pushed with authorization, run the manual release-candidate workflow and retain its hosted security and signed-attestation evidence before Chrome Web Store submission.
