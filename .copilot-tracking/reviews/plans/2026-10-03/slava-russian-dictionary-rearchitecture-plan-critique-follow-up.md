<!-- markdownlint-disable-file -->
# RPI Plan Critique: Slava Russian Dictionary rearchitecture follow-up

## Metadata

* Task ID: `SLAVA-MV3-REARCH-001`
* Critique date: 2026-10-03
* Plan: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: warranted follow-up explicitly requested after material planner-owned revisions to the language/source contract and final release sequence
* Critique type: follow-up
* Earlier critique: .copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique.md

## Inputs and Criterion Boundary

* Task context and caller requirements: Assess the revised ground-up WXT/TypeScript Manifest V3 plan while preserving the authoritative decisions to bundle all data, use a deterministic cloud pipeline, prohibit CDN/cloud lookup/telemetry/download subsystems, deliver Chrome first behind portable domain boundaries, preserve English/Russian/French definitions, and make security/privacy commitments testable.
* Research and evidence considered: .copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md, .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md, .copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique.md, and the tracked legacy-path inventory under `chrome/`, `scripts/`, and `conf/config.json`.
* Decisions, dependencies, task Goals, and task Requirements considered: FR-001 through FR-008; NFR-001 through NFR-010; D1 through D5; P01 through P06 and every task contract; the first-release language matrix; corpus accounting; licensing; legacy-path disposition; artifact ownership; interaction behavior; reproducibility; final artifact sequencing; and rollback.
* Assessment boundary: This standard follow-up reconciles PC-001 through PC-008 and assesses the supplied revision once for internal consistency and implementation credibility. It identifies material gaps introduced or exposed by the revision, but does not perform web research, validate future corpus measurements, grade cosmetics, or restate the plan.

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| D5, FR-003, FR-005, P01-T03, P02-T01, First-Release Definition Language Matrix | Covered | English, Russian, and French sources, order, enablement, fallback, omission, provenance, and escalation for any future language removal are explicit and mutually consistent. Confidence: high. |
| NFR-003, P05-T03, P06-T03 | Covered | Two isolated builds control archive metadata, compare data and ZIP digests, retain diagnostics, and submit one compared ZIP. Confidence: high. |
| P06-T01 through P06-T03 | Covered | Documentation and cleanup precede the reproducible final build, and release evidence is keyed to the post-cleanup source revision and exact submitted ZIP. Confidence: high. |
| P01-T02, P02-T02, P02-T03 | Partial | The prose requires stage reconciliation per edition and globally, but the mandatory quality-summary schema cannot record emitted records or per-edition stage totals. See PC-004. Confidence: high. |
| P02-T02, P02-T03, P06-T01, NFR-009 | Partial | The plan requires a source-and-field policy before transformation, but the task that enforces it follows transformation and final approval occurs in P06. See PC-005. Confidence: high. |
| Legacy Path Disposition, Artifact Ownership Map, P06-T02 | Covered | Every currently tracked legacy path has a disposition, canonical and generated classes are separated, package inclusion is allowlisted, and cleanup is tested before release. Confidence: high. |
| FR-003, NFR-007, NFR-008, P04-T02, P05-T02 | Partial | Pointer and keyboard wording no longer contradicts itself, but the plan does not define how keyboard users target words without creating an unbounded tab sequence. See PC-009. Confidence: moderate. |
| P06-T01, P06-T03 | Covered | The rollback path selects an accepted prior snapshot, increments the extension version, repeats release gates, preserves provenance, and requires a separately attested dry-run artifact. Confidence: high. |

## Verdict

* Verdict: Revise
* Rationale: The revision credibly resolves the language/source matrix, final-artifact sequence, reproducibility, legacy ownership, interaction wording, and rollback findings. Implementation should still wait for two direct contract corrections: the required corpus report cannot prove its stated reconciliation invariant, and the license policy is sequenced after the transformation it must govern. The keyboard target-acquisition model also needs a bounded accessibility contract before page integration is implementation-ready. Confidence: high.

## Earlier Finding Reconciliation

| Earlier finding | Status | Evidence |
|-----------------|--------|----------|
| PC-001 | Resolved | D5, P01-T03, P02-T01, the First-Release Definition Language Matrix, FR-003, and FR-005 preserve all three legacy definition languages and define source, order, fallback, omission, provenance, and scope-change routing. |
| PC-002 | Resolved | P06-T01 finalizes documentation, P06-T02 cleans the repository, and P06-T03 builds and attests the exact artifact from the post-cleanup revision. |
| PC-003 | Resolved | P05-T03 and P06-T03 require two isolated clean builds, deterministic archive controls, digest comparison, bounded diagnostics, and submission of one compared ZIP. |
| PC-004 | Still open | P02-T02 and P02-T03 state the correct reconciliation invariant, but P01-T02's mandatory schema has no `emittedRecords` field and only one scalar per language rather than stage totals per edition. |
| PC-005 | Still open | P02-T03 requires policy enforcement before transformation but depends on P02-T02, while P06-T01 approves the policy after the complete data pipeline. |
| PC-006 | Resolved | The Legacy Path Disposition covers every tracked file under `chrome/`, `scripts/`, and `conf/config.json`; the Artifact Ownership Map separates canonical inputs, generated outputs, evidence, and package inclusion. |
| PC-007 | Resolved | FR-003, P04-T02, and P05-T02 consistently require pointer hover, keyboard focus/invocation, explicit lookup, focus handling, dismissal, and accessibility validation. The remaining target-acquisition detail is recorded separately as PC-009. |
| PC-008 | Resolved | P06-T01 defines the versioned prior-snapshot recovery process and requires a dry run; P06-T03 requires a fully gated, separately attested replacement ZIP and retained result. |

## Findings

<!-- rpi:critique id=PC-004 -->
### PC-004 [Medium]: The mandatory corpus summary still cannot prove the required reconciliation

* Related IDs: FR-006, NFR-003, NFR-004, P01-T02, P02-T02, P02-T03
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Concern: The revised tasks correctly require every source record to reconcile through source-seen, eligibility, emission, filtering, and rejection per edition and globally. The mandatory quality-summary schema omits an emitted-record count and represents `recordsByLanguage` as one number per language, so it cannot demonstrate stage-by-stage per-edition balance or the invariant `eligible = emitted + filtered + rejected`.
* Impact: A parser can lose an edition-specific segment or misclassify records while still producing plausible aggregate lemma, form, and definition counts and satisfying the declared schema.
* Smallest useful change: Replace the scalar language counts with stage counters per edition and globally, including `sourceRecordsSeen`, `eligibleRecords`, `emittedRecords`, `filteredRecords`, and `rejectedRecords`, and state the exact balance invariant checked by P02-T03.
* Action owner: Planning parent
* Exact resolving evidence: The mandatory P01-T02 schema contains global and `en`/`ru`/`fr` stage totals including emitted records, and P02-T02/P02-T03 require machine-checked balance with reviewed exceptions identified by stable reason.
* Decision route: Direct planner correction
* Confidence: high

<!-- rpi:critique id=PC-005 -->
### PC-005 [Medium]: License-policy enforcement remains sequenced after the transformation it must constrain

* Related IDs: FR-006, FR-008, NFR-003, NFR-009, P02-T01, P02-T02, P02-T03, P06-T01
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Concern: P02-T03 says the tracked source-and-field policy is enforced before transformation, yet it depends on the completed P02-T02 transformation. P06-T01 then says to approve that policy during final documentation. The dependency graph therefore permits implementation and emission of fields before their redistribution eligibility and unknown-provenance behavior are approved.
* Impact: The pipeline can be built around fields or records later found ineligible, causing avoidable redesign, incomplete filtering, or a release-blocking source decision late in P06.
* Smallest useful change: Make the initial approved source-and-field policy an output of P01-T02 or P02-T01 and a dependency of P02-T02; leave P02-T03 to verify machine enforcement and P06-T01 to finalize generated notices and confirm that no unresolved class remains.
* Action owner: Planning parent
* Exact resolving evidence: Revised dependencies show an approved tracked policy before P02-T02 starts, transformation tests fail unknown/disallowed provenance at field and record boundaries, and P06 consumes the resulting inventory rather than approving the governing policy for the first time.
* Decision route: Direct planner correction; user input is needed only if enforcement later requires removal of a confirmed language or another material scope change.
* Confidence: high

<!-- rpi:critique id=PC-009 -->
### PC-009 [Medium]: Keyboard lookup lacks a bounded word-target acquisition contract

* Related IDs: FR-003, NFR-007, NFR-008, P04-T01, P04-T02, P05-T02
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Concern: The revised plan consistently requires keyboard focus and invocation, but it does not define how a keyboard user selects or reaches a word in ordinary page text. Making every annotated token tabbable would create an unbounded tab sequence and conflict with bounded, non-disruptive page behavior; relying on pointer hover would fail the keyboard requirement.
* Impact: Implementers and browser tests lack one authoritative interaction model, and a superficially accessible popup can still make lookup impractical or disruptive for keyboard and assistive-technology users.
* Smallest useful change: Define one bounded first-release keyboard target model, such as explicit invocation for the current text selection or caret word plus controlled popup focus, and explicitly prohibit adding every annotated token to the normal tab order. Synchronize its states and assertions across P04-T01, P04-T02, and P05-T02.
* Action owner: Planning parent
* Exact resolving evidence: The plan names the target-acquisition gesture, eligible text state, no-selection/error behavior, focus transfer/restoration, tab-order rule, and matching Playwright/manual accessibility cases.
* Decision route: Direct planner correction because it implements the confirmed keyboard requirement without changing product scope.
* Confidence: moderate

## Strengths and Residual Risk

* The three-edition matrix is implementation-credible: each edition has immutable provenance, independent accounting and package evidence, deterministic fallback, no translation, and an explicit user decision gate for future removal. Confidence: high.
* The final release sequence now has one authoritative artifact: documentation and cleanup precede two isolated builds, and scans, SBOM, attestation, license evidence, size evidence, and smoke tests target the submitted ZIP. Confidence: high.
* The legacy disposition and artifact ownership map are complete for the current tracked tree. The remaining choice of exact new pipeline root is an implementation detail because the plan requires one declared equivalent root and explicit package exclusion. Confidence: high.
* Residual risks around measured package size, lookup latency, upstream defects, and GitHub feature availability are appropriately gated downstream and do not independently block planning. Confidence: moderate.

## Questions or Blocking Evidence Gaps

* None. All findings are direct planner corrections within confirmed user direction.

## Limitations

* No web research was performed. External framework, source, browser, licensing, and CI claims were assessed only through the supplied research.
* The corpus, benchmark, legal disposition, browser-test, and release artifacts do not yet exist; this critique assesses whether the plan can generate decisive evidence, not whether future outputs will pass.

## Recommended Next Action

* Highest-impact finding: PC-005
* Action owner: Planning parent
* Smallest next action: Move initial license-policy approval ahead of transformation, then update the corpus-summary schema and define the bounded keyboard target model in one plan revision before finalizing readiness.
* User response required: no

| Artifact | Description |
|----------|-------------|
| [.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md](.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md) | Revised plan assessed by this follow-up critique. |
| [.copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md](.copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md) | Supplied architecture, data, security, testing, licensing, and release evidence. |
| [.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique.md](.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique.md) | Earlier critique reconciled finding by finding. |
| [.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique-follow-up.md](.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique-follow-up.md) | Complete follow-up finding set and verdict. |

## Next Steps

* Active planning parent: revise the plan for PC-004, PC-005, and PC-009, then dispose this follow-up critique. No user action is required.
