<!-- markdownlint-disable-file -->
# RPI Plan Critique: Slava Russian Dictionary rearchitecture

## Metadata

* Task ID: `SLAVA-MV3-REARCH-001`
* Critique date: 2026-10-03
* Plan: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: default required by the active `rpi-plan` invocation; the user did not request deep critique
* Critique type: initial
* Earlier critique: not applicable

## Inputs and Criterion Boundary

* Task context and caller requirements: Ground-up Manifest V3 rearchitecture; project-owned WXT/TypeScript implementation; Rikaikun, 10ten, and Yomitan used only as patterns; all stress and definition data bundled in every release; deterministic cloud indexing and packaging; no CDN, cloud lookup, analytics, account, telemetry, or extension-managed data downloads; Chrome-first delivery with portable domain boundaries; strong testable privacy and security commitments.
* Research and evidence considered: .copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md, chrome/manifest.json, scripts/package-extension.sh, conf/config.json, README.md, docs/examples.md, and the repository directory listings for chrome/ and scripts/.
* Decisions, dependencies, task Goals, and task Requirements considered: The complete FR-001 through FR-008 and NFR-001 through NFR-010 catalogs; P01 through P06; every Pxx-Txx Goal, Requirements, Details, References, and Dependencies block; D1 through D4; risks, sources, exact-removal claims, test ownership, artifact boundaries, and release evidence.
* Assessment boundary: This critique assesses implementation credibility, contradictions, unsupported scope or architecture, missing dependencies and checkable coverage, unsafe sequencing or removals, and material data, licensing, privacy, security, and release risks. It does not grade document cosmetics, perform new web research, or challenge confirmed user decisions.

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| FR-001, FR-002, FR-004, FR-006 through FR-008 | Covered | Permission lifecycle, reversible page behavior, offline bundling, deterministic data generation, release evidence, and documentation have owning tasks and observable checks. |
| FR-003, FR-005 | Partial | Interaction wording is inconsistent, and the first-release definition-language/fallback scope required by language preferences is not settled. See PC-001 and PC-007. |
| NFR-001, NFR-002, NFR-004 through NFR-010 | Covered with material release qualifications | The plan provides permission, no-egress, ambiguity, size/performance, hostile-page, accessibility, supply-chain, and unsupported-surface gates. Licensing and rollback evidence remain incomplete. See PC-005 and PC-008. |
| NFR-003 | Partial | Data determinism is owned, but the extension ZIP is explicitly built once despite the requirement for two clean byte-identical builds. See PC-003. |
| P01 through P05 | Covered with scoped gaps | The architecture and test ownership are credible, but first-release language scope, corpus completeness accounting, and artifact ownership need correction. See PC-001, PC-004, and PC-006. |
| P06-T01 through P06-T03 | Partial | The final artifact is built and attested before documentation and legacy retirement, so it is not proven to originate from the final clean repository state. See PC-002. |
| Exact removals and canonical/generated targets | Partial | The plan claims exact removals but names directories and file classes rather than a non-contradictory per-path disposition and generated-output map. See PC-006. |
| Research licensing and source-withdrawal concerns | Partial | Inventories and retained packages are planned, but blocking license eligibility and an executable bundled-data rollback path are not. See PC-005 and PC-008. |

## Verdict

* Verdict: Revise
* Rationale: The architecture is credible and substantially testable, but implementation should not start from the current plan because the first-release definition-language scope is unresolved, the final release sequence and reproducibility contract contradict their own acceptance requirements, and corpus, licensing, removal, and rollback gates lack exact resolving evidence.

## Findings

<!-- rpi:critique id=PC-001 -->
### PC-001 [High]: The first-release definition-language and source scope is unresolved

* Related IDs: FR-003, FR-005, FR-006, P01-T03, P02-T01, P02-T02, P02-T03, P03-T01, D2
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md; conf/config.json; docs/examples.md
* Concern: The plan exposes a `languages` lookup parameter and definition-language preferences, while the legacy evidence includes English, Russian, and French Wiktionary behavior. P02-T01 acquires one upstream snapshot and the plan never states which definition languages ship in the first release, which source snapshot supplies each language edition, or how fallback and omission work.
* Impact: The pipeline cannot define “complete” bundled definitions, representative fixtures, package budgets, attribution, or user-visible compatibility until the supported language set is fixed. Silently dropping legacy languages would be a material product-scope decision.
* Smallest useful change: Add a first-release definition-language matrix naming every supported, degraded, and excluded language; its exact upstream snapshot; fallback order; licensing basis; required golden cases; and package-budget contribution. Obtain the user's decision if this matrix removes English, Russian, or French behavior evidenced by the current product.
* Action owner: Planning parent, with user disposition for any material language-scope reduction
* Exact resolving evidence: A plan section and synchronized P01/P02/P03 requirements containing the approved language/source/fallback matrix, plus a recorded user decision for any divergent reduction.
* Decision route: Significant or divergent user decision if current multilingual behavior is reduced; otherwise direct planner correction.
* Confidence: high

<!-- rpi:critique id=PC-002 -->
### PC-002 [High]: The attested release is built before the repository reaches its final clean state

* Related IDs: FR-007, FR-008, NFR-003, NFR-009, P06, P06-T01, P06-T02, P06-T03
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Concern: P06-T01 builds the exact release ZIP and records its source revision, but P06-T02 then changes release-facing documentation and P06-T03 removes the legacy implementation. The final clean source revision therefore differs from the revision attested for submission, and the plan does not rebuild and re-attest after those changes.
* Impact: Release provenance would describe an intermediate repository state, while hidden imports, package inclusions, manifest changes, notices, or generated metadata introduced by cleanup and documentation synchronization could escape exact-artifact validation.
* Smallest useful change: Move all package-relevant documentation, notices, and legacy retirement before the final release build, or add a final P06 task that rebuilds once from the clean revision and repeats every checksum, SBOM, attestation, size, scan, and smoke-test gate against the replacement ZIP.
* Action owner: Planning parent
* Exact resolving evidence: Revised P06 dependencies showing the final ZIP is produced from the post-cleanup revision, with all release evidence keyed to that same source revision and artifact digest.
* Decision route: Direct planner correction
* Confidence: high

<!-- rpi:critique id=PC-003 -->
### PC-003 [High]: The extension-package reproducibility requirement has no executable owner and conflicts with “build once”

* Related IDs: NFR-003, P05-T03, P06-T01
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Concern: NFR-003 requires two clean builds of the same revision and snapshot to produce byte-identical data artifacts and extension packages. P06-T01 instead requires the complete Chrome ZIP to be built once, and neither P05-T03 nor P06-T01 requires a second isolated package build or identifies controls for ZIP timestamps, file ordering, permissions, and generated manifest metadata.
* Impact: The plan can attest one artifact without proving the claimed package reproducibility, leaving a central supply-chain and release claim unverified.
* Smallest useful change: Assign a required CI job to perform two isolated clean builds with the locked toolchain, compare every generated data digest and the final ZIP digest, fail on differences, and retain a bounded diff diagnostic. The submitted artifact should be one of the compared outputs.
* Action owner: Planning parent
* Exact resolving evidence: Updated P05-T03 or P06-T01 requirements and dependencies naming the two-build comparison, deterministic archive controls, retained comparison result, and submitted digest.
* Decision route: Direct planner correction
* Confidence: high

<!-- rpi:critique id=PC-004 -->
### PC-004 [Medium]: First-release corpus completeness is not checkable

* Related IDs: FR-006, NFR-003, NFR-004, P01-T02, P02-T01, P02-T02, P02-T03
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md; .copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md
* Concern: P02-T03 compares counts with the last accepted release, but no accepted full-corpus baseline exists for the first release. The required quality summary records output counts and rejected records but not source records seen, language/section eligibility, emitted records, filtered records by reason, or reconciliation invariants.
* Impact: A parser or filter could omit a whole source segment while still passing golden cases, schema checks, and internally plausible output counts. Later delta checks would then preserve a defective baseline.
* Smallest useful change: Add first-release extraction accounting that reconciles source records through eligibility, emission, filtering, and rejection by stable reason and language, with reviewed absolute acceptance thresholds before the first baseline is accepted.
* Action owner: Planning parent
* Exact resolving evidence: Extended quality-summary schema, P02-T02 accounting requirements, and P02-T03 first-release acceptance gates demonstrating reconciled totals and reviewed exceptions.
* Decision route: Direct planner correction
* Confidence: high

<!-- rpi:critique id=PC-005 -->
### PC-005 [Medium]: Licensing concerns are inventoried but not converted into a blocking eligibility gate

* Related IDs: FR-006, FR-008, NFR-003, NFR-009, P02-T01, P02-T02, P02-T03, P06-T01, P06-T02
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md; .copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md; README.md
* Concern: The plan recognizes ShareAlike, GFDL, icons, dependencies, and separately licensed entry material, but the release gate fails only on missing attribution. It does not require an approved eligibility policy for which source fields and entries may be redistributed, how incompatible or unknown licensing is filtered, or what evidence triggers mandatory legal review.
* Impact: A technically valid corpus and package could reach release while its redistribution, notice, source-offer, attribution, or share-alike obligations remain unresolved.
* Smallest useful change: Add a source-and-field license policy before transformation, fail the data build on unknown or disallowed provenance, and make release depend on an approved code/data/icon/third-party license inventory with any required legal disposition recorded.
* Action owner: Planning parent
* Exact resolving evidence: P02 and P06 gates naming the approved license policy artifact, machine-checkable unknown/disallowed handling, generated notices, and a recorded approval or legal disposition for every unresolved license class.
* Decision route: Direct planner correction; escalate to the user only if compliance requires a material source, license, or product-scope change.
* Confidence: high

<!-- rpi:critique id=PC-006 -->
### PC-006 [Medium]: Exact removals and canonical-versus-generated ownership remain ambiguous

* Related IDs: FR-007, FR-008, NFR-003, NFR-009, P01-T03, P02-T02, P06-T03
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md; repository listings for chrome/ and scripts/
* Concern: P01-T03 says tracked files under chrome/ and scripts/ plus conf/config.json are removed after replacement evidence is green, while also allowing icons and documentation to remain. P06-T03 narrows removal to file classes but does not enumerate paths or dispose of scripts/Pipfile and scripts/download-resources.py. The plan also does not map canonical schemas/configuration/fixtures/summaries to generated shards, unpacked builds, and release artifacts.
* Impact: Implementation can delete retained assets, preserve obsolete executable paths, track generated corpus output accidentally, or package stale files without violating the current wording.
* Smallest useful change: Add a per-path disposition table for every existing file under chrome/, scripts/, and conf/config.json, and an artifact ownership map naming canonical tracked inputs, generated untracked outputs, retained evidence, clean-checkout directories, and package inclusion rules.
* Action owner: Planning parent
* Exact resolving evidence: A complete path table with keep/migrate/remove/replace dispositions and a canonical/generated artifact map referenced by P02-T02, P05-T03, and P06-T03 tests.
* Decision route: Direct planner correction
* Confidence: high

<!-- rpi:critique id=PC-007 -->
### PC-007 [Medium]: The popup interaction requirement contradicts the functional requirement

* Related IDs: FR-003, NFR-008, P04-T02, P05-T02
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md
* Concern: FR-003 requires hover, keyboard, and explicit lookup interactions. P04-T02 permits “hover/focus or an evidence-backed alternative,” which allows implementation to omit a required interaction without changing FR-003 or obtaining a scope decision.
* Impact: Browser and accessibility tests cannot derive one authoritative interaction contract, and a release could satisfy the task while failing the stated functional requirement.
* Smallest useful change: Require hover or focus behavior consistent with FR-003 alongside explicit keyboard invocation, or formally revise FR-003 and its browser-test matrix through the appropriate user-owned scope decision.
* Action owner: Planning parent
* Exact resolving evidence: Identical interaction requirements in FR-003, P04-T02, P05-T02, the support matrix, and the manual accessibility checklist.
* Decision route: Direct planner correction if hover remains required; significant user decision if it is removed from first-release scope.
* Confidence: high

<!-- rpi:critique id=PC-008 -->
### PC-008 [Medium]: Bundled-data rollback is documented but not designed or tested

* Related IDs: D2, FR-007, NFR-003, P02-T03, P06-T01, P06-T02
* Evidence: .copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md; .copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md
* Concern: The selected architecture deliberately removes extension-managed data rollback. The plan retains previous packages and asks for rollback/recovery guidance, but it does not define the supported response to a harmful bundled corpus after store publication, including versioning, re-release of prior data in a newer extension version, source withdrawal, schema compatibility, and validation of the replacement artifact.
* Impact: The team could detect a bad release yet lack an executable, policy-compliant recovery path while users continue receiving misleading dictionary data.
* Smallest useful change: Define and test the bundled-data rollback runbook: select an accepted prior data snapshot, rebuild it under a new extension version when store versioning requires it, repeat full release gates, preserve provenance, and document user recovery and source-withdrawal handling.
* Action owner: Planning parent
* Exact resolving evidence: A P06 release requirement and smoke-test/runbook artifact demonstrating a dry run from a rejected current snapshot to an attested replacement package using an accepted prior snapshot.
* Decision route: Direct planner correction
* Confidence: moderate

## Strengths and Residual Risk

* The project-owned WXT/TypeScript boundary, no-network bundled-data architecture, optional-host permission model, local structured rendering, ambiguity preservation, reversible page integration, and layered domain/browser/release testing are mutually consistent and well supported by the supplied research.
* P01-T02 correctly gates the final index format and numerical budgets on representative measurements rather than asserting an unsupported storage technology.
* Residual upstream dictionary defects, benchmark variability, and store-review timing can remain operational risks after the findings are resolved, provided the plan retains explicit quality thresholds, manual publication approval, and truthful limitations.

## Questions or Blocking Evidence Gaps

* Decision required: Which definition languages and fallback order are in the first release, and may any of the English, Russian, or French behavior evidenced by the current product be removed?

## Limitations

* No new web research was performed. External facts and framework capabilities were assessed only as recorded in the supplied research.
* Full generated corpus assets and benchmark outputs do not yet exist, so this critique assesses whether the plan creates credible gates for them rather than validating their eventual numerical results.

## Recommended Next Action

* Highest-impact finding: PC-001
* Action owner: Planning parent, then user if the proposed first-release language matrix reduces current multilingual behavior
* Smallest next action: Draft the explicit definition-language/source/fallback matrix, obtain the one required scope disposition, then revise P01, P02, P03, P05, and P06 to resolve PC-002 through PC-008 before deciding whether a follow-up critique is warranted.
* User response required: yes

| Artifact | Description |
|----------|-------------|
| [.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md](.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md) | Plan assessed by this critique. |
| [.copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md](.copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md) | Supplied architecture, data, test, licensing, and release evidence. |
| [.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique.md](.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique.md) | Initial standard critique and complete finding set. |

## Next Steps

* Active planning parent: dispose the findings, obtain the PC-001 language-scope decision, revise the plan directly, and decide whether the material revisions warrant a follow-up critique.
