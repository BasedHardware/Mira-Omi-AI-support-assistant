const { handoffFooters } = require('./plannerPolicy');

const ESCALATE_FOOTER = 'A person on the team needs to take this. I have not pinged anyone yet.';
const FAILED_HANDOFF_FOOTER = 'I could not deliver this to the support team from here. Please email help@omi.me with the details; do not post order or account information publicly.';
const PINGED_FOOTER = 'Your request has been sent to the support team for review.';
const THREAD_REPLY_FOOTER = `${PINGED_FOOTER} Please continue in this thread.`;
const ACCEPTED_FOOTER = 'A support team member has accepted your request for review. Please continue in this thread.';
const UNCONFIRMED_HANDOFF_FOOTER = 'Delivery to the support team is not confirmed. Please keep any follow-up in this thread.';
const DUPLICATE_FOOTER = 'Your request was already sent to the support team for review.';

function handoffState(opts = {}) {
  if (opts.deliveryFailed) return 'failed';
  // Retain the existing application-confirmed notification API for callers
  // without a durable case. The Discord handler always supplies its case.
  if (!opts.supportCase) return opts.pinged ? 'delivered' : 'pending';
  const value = opts.supportCase;
  if (opts.customerId && String(value.customerId || '') !== String(opts.customerId)) return 'unconfirmed';
  if (value.status === 'accepted' && value.acceptedBy &&
      Number.isFinite(Date.parse(value.acceptedAt))) return 'accepted';
  if (value.status === 'delivered') return 'delivered';
  return 'unconfirmed';
}

function handoffFooter(opts = {}) {
  const footers = opts.footers || handoffFooters({ replyLanguage: opts.language || 'en' }, opts.question);
  switch (handoffState(opts)) {
    case 'failed': return footers?.failed || FAILED_HANDOFF_FOOTER;
    case 'unconfirmed': return footers?.unconfirmed || UNCONFIRMED_HANDOFF_FOOTER;
    case 'accepted': return footers?.accepted || ACCEPTED_FOOTER;
    case 'delivered': return opts.replyInThread ? footers?.thread || THREAD_REPLY_FOOTER
      : opts.duplicate ? footers?.duplicate || DUPLICATE_FOOTER : footers?.sent || PINGED_FOOTER;
    default: return footers?.pending || ESCALATE_FOOTER;
  }
}

// Preserve only the exact application-owned event copy. Arbitrary caller text,
// model prose and even a supplied locale map cannot authorize an outcome.
function splitHandoffFooter(answer, context) {
  const text = String(answer || '');
  if (!context) return { text, footer: '' };
  const footer = handoffFooter({ ...context, footers: undefined });
  const parts = text.split('\n\n');
  if (!parts.includes(footer)) return { text, footer: '' };
  return { text: parts.filter(part => part !== footer).join('\n\n'), footer };
}

module.exports = { handoffState, handoffFooter, splitHandoffFooter,
  ESCALATE_FOOTER, FAILED_HANDOFF_FOOTER, PINGED_FOOTER, THREAD_REPLY_FOOTER,
  ACCEPTED_FOOTER, UNCONFIRMED_HANDOFF_FOOTER, DUPLICATE_FOOTER };
