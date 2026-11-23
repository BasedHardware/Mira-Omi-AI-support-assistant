# Preserve romanized Hindi custody warnings

November23,2026. #113 merged as `8f3f7b7bc97e7f635cd4ee4393e474192a13ab51` under Aryan’s explicit merge-only approval. Exact-head CI45227109152 and merged-main CI45228073506 pass. It is outside #110/#109’s accepted frozen comparisons. Release is separately tracked in #111; no deployment or customer verification is claimed.

The completed first #110 comparison exposed a shared defect: both main and candidate dropped the recording-preservation warning from a raw romanized Hindi review. `technicalReviewSafety` saw English action words such as “reinstall” and “sign out” but recognized only English negation before the action. Hindi can put the prohibition after it. The guard therefore mistook protective advice for a destructive recommendation.

The same technical owner now recognizes a closed postposed Hindi prohibition for the current matched action, including a bounded coordination of actions sharing that prohibition. It requires the Hindi reply locale, a complete negative suffix and no unknown continuation in that clause. It does not use a negative word elsewhere to exempt an action. Separate recognized positive destructive actions still fail safety; this is not a complete multilingual action parser. No prompt, source ranking, model call, provider setting, recording operation or retained data changes.

- [x] Observed red-before loss through `technicalReviewSafety`, then green preservation controls.
- [x] Preserve independent English, comma/semicolon/dash-separated positive-action and misleading-negative controls.
- [x] Exercise the actual handler with a real technical-review owner, injected provider/official-source fixtures, one private case delivery and final customer output retaining the warning.
- [x] Integrated main passes1,358 local tests/eight no-model checks. The strengthened actual-handler control retains a real handoff even when both injected model stages decline escalation.
- [x] Final maintainer code review and exact-request-hash offline replay: the known q08 warning is restored, with the other11 candidate finals/decisions unchanged relative to the reviewed #110 repair replay. Twenty captured stages, zero provider requests; no fresh accuracy claim.
- [x] Postprocessing quality disposition reuses valid evidence: all12 English candidate finals/decisions from accepted B remain byte-identical, with all22 request bodies matching before any captured response is supplied. A direct production-owner check on the actual synthetic A/q08 raw review changes from unsafe/dropped to safe/preserved; it is not represented as a matching A prompt after context integration. No model/prompt/provider/retrieval boundary changed and no fresh generated-accuracy claim or paid call follows.
- [x] Exact-head hosted Node20/24/PostgreSQL CI before readiness, plus merged-main CI.
- [x] Opened draft #113 within the queue cap, then marked ready after final review and current-head checks.
- [x] User-authorized merge with a merge commit.
- [ ] Separately authorized release and smoke verification, tracked in #111; no deployment or customer verification is claimed.

This is text safety-filter verification using synthetic sources and local Discord/provider substitutes. It is not a physical-device, recording recovery, live Discord or fresh generated-accuracy test. The grammar is deliberately bounded; an unknown suffix on a recognized hazardous action retains its unsafe classification. Unrecognized action vocabulary is outside this repair’s guarantee. Broader source applicability, contradictory instructions and unrelated warning-trigger mistakes remain open under #83 and the real-thread audit.
