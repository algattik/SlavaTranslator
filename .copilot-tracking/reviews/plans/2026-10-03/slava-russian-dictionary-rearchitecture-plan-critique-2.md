<!-- markdownlint-disable-file -->
# RPI Plan Critique: Slava Russian Dictionary rearchitecture

## Metadata

* Task ID: `SLAVA-MV3-REARCH-001`
* Critique date: 2026-10-03
* Plan: `.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md`
* Critique execution: Complete
* Critique depth: standard
* Depth provenance: default; the user did not request deep critique or skip
* Critique type: follow-up after the live-definition architecture revision
* Earlier critique: `.copilot-tracking/reviews/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan-critique-follow-up.md`

## Inputs and Criterion Boundary

* Task context and caller requirements: ground-up MV3 rearchitecture; project-owned WXT/TypeScript shell; automated testing and cloud indexing; smaller package; enforceable security/privacy claims; local stress and morphology; explicit live English/French/German/Russian Wiktionary definitions with English fallback.
* Research and evidence considered: `.copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md`, `.copilot-tracking/spikes/2026-10-03/slava-rearchitecture-spikes.md`, `chrome/content_script.js`, `conf/config.json`, and the two earlier critique artifacts.
* Decisions, dependencies, task Goals, and task Requirements considered: D1-D11, FR-001-FR-008, NFR-001-NFR-010, P01-P06, every Pxx-Txx block, the legacy disposition, artifact ownership map, risks, and release gates.
* Assessment boundary: the supplied plan and evidence are sufficient to assess implementation credibility. The critique does not validate future Chromium measurements, parser code, live API availability, or legal conclusions that implementation has not yet produced.

## Coverage Assessment

| Requirement, research, phase, or task ID | Coverage | Evidence or concern |
|------------------------------------------|----------|---------------------|
| FR-001-FR-003, FR-005-FR-008 | Covered | User activation, local indexes, settings, reversibility, pipeline, documentation, cleanup, and release ownership are assigned to concrete tasks and objective gates. |
| FR-004, NFR-002, P03-T03, P04-T02, P05-T02 | Partial | The plan requires an explicit user action but does not require the content-side event to be browser-trusted or otherwise capability-bound, so a hostile page can potentially synthesize DOM events that cause remote lemma requests. |
| NFR-001, P01-T03, D9 | Covered | Four exact HTTPS Wiktionary host permissions are explicit, browser-spiked, documented, and tested against wildcard expansion. |
| NFR-003-NFR-010 | Covered | Response bounds, inert parsing, lifecycle errors, size/performance, accessibility, reproducibility, test ownership, supply-chain controls, and portability all have measurable task ownership. |
| D8, P01-T03, P03-T03, P05-T02 | Partial | “One request per edition attempt” is ambiguous because `Api-User-Agent` triggers a browser-managed CORS preflight. The tests could incorrectly count the `OPTIONS` request as a forbidden extra attempt or fail to assert its privacy boundary. |
| Earlier bundled-plan critique findings | Superseded | The current plan replaces bundled-definition tasks, diagrams, privacy claims, and release gates; earlier finding dispositions do not establish readiness for the new architecture. |

## Verdict

* Verdict: Revise
* Rationale: The plan is otherwise implementation-credible and materially complete, but the explicit-user-action privacy guarantee is not enforceable against synthetic page events, and the request-count contract conflicts with the known browser preflight behavior. Both are direct planner corrections rather than user decisions.

## Earlier Finding Reconciliation

| Earlier finding | Status | Evidence |
|-----------------|--------|----------|
| Initial PC-001 through PC-008 | Superseded | They assessed the bundled-definition architecture and were replaced by D7 and the rewritten phase/task set. |
| Follow-up PC-004, PC-005, PC-009 | Superseded | Their bundled multilingual data-flow and keyboard-flow corrections do not cover live request provenance or preflight accounting. Relevant keyboard accessibility requirements are retained independently in P04-T02 and P05-T02. |

## Findings

<!-- rpi:critique id=PC-010 -->
### PC-010 [High]: Explicit definition requests are not bound to a trusted user action

* Related IDs: FR-004, NFR-002, P01-T02, P03-T03, P04-T02, P05-T02
* Evidence: `.copilot-tracking/plans/2026-10-03/slava-russian-dictionary-rearchitecture-plan.md`; the plan says click, keyboard command, or search submission starts the request and tests zero passive requests, but it does not reject script-generated DOM events or require a short-lived request capability created by a trusted extension interaction.
* Concern: A hostile page can synthesize click or keyboard events against content-script-owned interaction surfaces unless the handler checks trusted event provenance or the extension uses an equivalent capability boundary. The resulting request would satisfy the typed lemma contract yet violate the user's promise that only their explicit action transmits the term.
* Impact: Page-controlled activity could disclose lemmas and generate Wikimedia traffic without the user's action, undermining the core privacy guarantee and API-etiquette controls.
* Smallest useful change: Add a binding requirement in P04-T02 that remote lookup entrypoints accept only `Event.isTrusted` pointer/keyboard events or direct extension-page submissions, and add a short-lived single-use request capability or equivalent service-side guard when a background message can otherwise be replayed. Add Chromium tests that dispatch synthetic page events and replay messages and assert zero remote GETs.
* Action owner: Planning parent
* Exact resolving evidence: Updated P01/P03/P04/P05 requirements name trusted event provenance, replay/concurrency bounds, and synthetic-event/replay network tests.
* Decision route: Direct planner correction

<!-- rpi:critique id=PC-011 -->
### PC-011 [Medium]: Request-count requirements do not distinguish API attempts from CORS preflight

* Related IDs: D8, NFR-002, P01-T03, P03-T03, P05-T02
* Evidence: `.copilot-tracking/research/2026-10-03/slava-russian-dictionary-rearchitecture-research.md` W16 and W19 establish `Api-User-Agent` and successful preflight; the plan allows one selected-edition attempt plus one English fallback attempt and directs network interception to fail on excess requests.
* Concern: A browser-generated `OPTIONS` preflight is an additional network request but not an Action API lookup attempt. The current wording can produce contradictory implementation and test interpretations and leaves the preflight's origin/header privacy properties untested.
* Impact: Tests may reject correct browser behavior, implementations may drop the required identifying header to avoid the apparent extra request, or preflight traffic may escape the intended privacy assertions.
* Smallest useful change: Define the budget as at most one Action API GET per edition attempt, excluding browser-managed same-origin preflight. Require preflight, when emitted, to target the same exact allowlisted origin and contain no lemma, page context, cookies, or credentials; test GET attempts and preflight separately.
* Action owner: Planning parent
* Exact resolving evidence: Revised D8/NFR-002/P01-T03/P03-T03/P05-T02 wording and separate request-interception assertions for GET attempts and `OPTIONS`.
* Decision route: Direct planner correction

## Strengths and Residual Risk

* The revised plan removes the stale bundled-definition architecture rather than mixing histories, gives local and remote data separate trust models, locks exact hosts and response budgets, assigns every semantic and browser contract to tests, and treats live parser drift as an explicit residual operational risk.
* The 2 MiB ceiling, edition-specific parser model, typed errors, no persistent definition cache, package budgets, legacy removal table, and exact-ZIP release gate are credible and evidence-grounded.

## Questions or Blocking Evidence Gaps

* None. Both findings are planner-owned corrections supported by the supplied evidence.

## Limitations

* The critique cannot prove that future selectors cover all Wiktionary entry variants or that the proposed performance thresholds will pass; the plan correctly makes those implementation gates rather than assumptions.

## Recommended Next Action

* Highest-impact finding: PC-010
* Action owner: Planning parent
* Smallest next action: Revise the trusted-user-action and request-accounting requirements, then finalize without another critique because the corrections do not change architecture or scope.
* User response required: no
