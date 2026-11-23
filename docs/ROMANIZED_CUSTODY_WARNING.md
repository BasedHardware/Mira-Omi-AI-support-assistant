# Preserve romanized Hindi custody warnings

Local preparation, November 23, 2026. This separate branch is based on #110 repair `b77305f`; it is outside the frozen #110/#109 comparisons and has no PR or release claim.

The completed first #110 comparison exposed a shared defect: both main and candidate dropped the recording-preservation warning from a raw romanized Hindi review. `technicalReviewSafety` saw English action words such as “reinstall” and “sign out” but recognized only English negation before the action. Hindi can put the prohibition after it. The guard therefore mistook protective advice for a destructive recommendation.

The same technical owner now recognizes a closed postposed Hindi prohibition for the current matched action, including a bounded coordination of actions sharing that prohibition. It requires the Hindi reply locale, a complete negative suffix and no unknown continuation in that clause. It does not use a negative word elsewhere to exempt an action. Separate positive destructive actions still fail safety. No prompt, source ranking, model call, provider setting, recording operation or retained data changes.

- [x] Observed red-before loss through `technicalReviewSafety`, then green preservation controls.
- [x] Preserve independent English, comma/semicolon/dash-separated positive-action and misleading-negative controls.
- [x] Exercise the actual handler with a real technical-review owner, injected provider/official-source fixtures, one private case delivery and final customer output retaining the warning.
- [x] 1,323 local tests and eight no-model checks pass.
- [x] Final maintainer code review and exact-request-hash offline replay: the known q08 warning is restored, with the other11 candidate finals/decisions unchanged relative to the reviewed #110 repair replay. Twenty captured stages, zero provider requests; no fresh accuracy claim.
- [ ] Exact-head hosted CI and the appropriate quality-evidence disposition before readiness.
- [ ] Open a draft only when the queue permits; preserve the existing #94/#96/#109/#110 scope.
- [ ] Merge/release separately under the existing gates; no deployment or customer verification is claimed.

This is text safety-filter verification using synthetic sources and local Discord/provider substitutes. It is not a physical-device, recording recovery, live Discord or fresh generated-accuracy test. The grammar is deliberately bounded; unknown phrasing retains the conservative existing behavior. Broader source applicability, contradictory instructions and unrelated warning-trigger mistakes remain open under #83 and the real-thread audit.
