const router = require('./router');
const { customerHistory } = require('./caseContext');

function isContinuation(question) {
  const text = String(question || '').trim();
  return router.looksLikeSupportNudge(text) || router.isFailedSupportFollowup(text) ||
    /^(?:(?:yes|no|again)\s*[,.!]?|(?:the\s+)?same\s+(?:thing|problem|issue)\s*[.!?]?)$/i.test(text) ||
    /^(?:it|this|that)\s+(?:still|happens?|happened|does(?:n['’]?t)?|is(?:n['’]?t)?|was(?:n['’]?t)?|did(?:n['’]?t)?|won['’]?t|has(?:n['’]?t)?|worked|works|failed)\b/i.test(text) ||
    /^(?:any|an?)\s+updates?\b/i.test(text) ||
    /^(?:does|did|will|would|can|could)\s+(?:it|this|that|they|those)\b/i.test(text) ||
    /^\d+(?:\.\d+){1,3}\s*[.!]?$/u.test(text);
}

function routeForRequest(question, { history = [], title = '', currentRoute } = {}) {
  const current = currentRoute || router.classify(question);
  if (current.lane !== 'unknown' || !isContinuation(question)) return current;
  // Recover only an elliptical subject, newest owned statement first. Never
  // classify a bag of all prior topics or let a stale title beat a correction.
  const earlier = customerHistory(history).filter(entry => entry.author === 'customer' || entry.role === 'customer');
  const subjects = [...earlier].reverse().map(entry => entry.content);
  if (title) subjects.push(title);
  for (const subject of subjects) {
    const context = router.classify(subject);
    if (context.lane === 'unknown') continue;
    return { ...context, wantHuman: Boolean(current.wantHuman),
      escalate: Boolean(context.escalate || current.escalate) };
  }
  return current;
}

module.exports = { routeForRequest };
