// Scope raw Discord history before customer text reaches routing or a prompt.
// These markers are application-owned; prose and display names confer no role.
const key = value => String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const id = value => value == null ? '' : String(value);

function staffVerified(message, isStaff) {
  try { return typeof isStaff === 'function' && isStaff(message) === true; }
  catch { return false; }
}

function namedTargets(content, aliases) {
  let remaining = String(content || '').trimStart();
  let greeted = /^(?:hi|hello|hey|dear)\s+/iu.test(remaining);
  remaining = remaining.replace(/^(?:hi|hello|hey|dear)\s+/iu, '');
  remaining = remaining.replace(/^(?:<@!?\d+>[,\s]*)+/u, '');
  const targets = [];
  // Only an anchored address such as "Alice," or "Hi Willow Reed:" counts.
  // A name appearing in ordinary prose never creates an association.
  for (;;) {
    const match = /^([^,:\n!?]{1,80}?)\s*([,:!–—]|-(?=\s))(?:\s+|$)/u.exec(remaining);
    if (!match) return targets;
    const candidate = match[1].trim();
    const names = candidate.split(/\s+(?:and|&)\s+/iu).map(name => key(name.replace(/^@/u, '')));
    const explicit = greeted || candidate.startsWith('@') || names.some(name => aliases.has(name));
    // Unknown single-name prefixes (including "Update:") are deliberately
    // rejected rather than guessing whether a label is a customer's name.
    const looksNamed = /^[\p{L}\p{N}_][\p{L}\p{M}\p{N}_.'-]*$/u.test(candidate) ||
      /^[\p{Lu}][\p{L}\p{M}.'-]*(?:\s+[\p{Lu}][\p{L}\p{M}.'-]*){1,3}$/u.test(candidate);
    if (!explicit && !looksNamed) return targets;
    for (const name of names) {
      const matches = aliases.get(name);
      if (!matches || matches.size !== 1) return null;
      targets.push([...matches][0]);
    }
    remaining = remaining.slice(match[0].length);
    greeted = false;
    if (match[2] !== ',') return targets;
  }
}

function projectCase(messages = [], { customerId, botId, isStaff, excludeId } = {}) {
  const customer = id(customerId);
  const bot = id(botId);
  if (!customer) return { entries: [], sourceMessages: [] };
  const raw = Array.isArray(messages) ? messages : [];
  const byId = new Map();
  const aliases = new Map();
  const roles = new Map();
  for (const message of raw) {
    if (!message || !id(message.id) || !id(message.author?.id)) continue;
    const messageId = id(message.id);
    byId.set(messageId, byId.has(messageId) ? null : message);
    const authorId = id(message.author.id);
    const webhook = message.webhookId != null;
    const role = webhook ? '' : message.author.bot === true
      ? (bot && authorId === bot ? 'bot' : '')
      : message.author.bot === false && authorId !== bot
        ? (authorId === customer ? 'customer' : staffVerified(message, isStaff) ? 'staff' : 'customer')
        : '';
    roles.set(message, role);
    if (webhook) continue;
    for (const value of [message.author.username, message.author.globalName, message.member?.displayName]) {
      const alias = key(value);
      if (!alias) continue;
      if (!aliases.has(alias)) aliases.set(alias, new Set());
      aliases.get(alias).add(authorId);
    }
  }
  const customers = new Set(raw.filter(message => roles.get(message) === 'customer').map(message => id(message.author.id)));
  // A verified staff identity is never a customer target for somebody else's case.
  for (const message of raw) if (roles.get(message) === 'staff') customers.delete(id(message.author.id));
  const resolved = new Map();
  const visiting = new Set();
  const addresses = new Map();
  function address(message) {
    if (addresses.has(message)) return addresses.get(message);
    const content = String(message.content || '');
    const mentions = [...content.matchAll(/<@!?(\d+)>/gu)].map(match => match[1]);
    const prefix = /^(?:(?:hi|hello|hey|dear)\s+)?(?:<@!?\d+>[,\s]*)+/iu.exec(content.trimStart())?.[0] || '';
    const anchored = [...prefix.matchAll(/<@!?(\d+)>/gu)].map(match => match[1]);
    const named = namedTargets(content, aliases);
    const group = /<@&\d+>|@(?:everyone|here)\b/iu.test(content);
    const value = { mentions, anchored, named, group };
    addresses.set(message, value);
    return value;
  }
  function owner(message) {
    if (!message || byId.get(id(message.id)) !== message) return '';
    if (resolved.has(message)) return resolved.get(message);
    if (visiting.has(message)) return '';
    const role = roles.get(message);
    if (!role) return '';
    if (role === 'customer') return customers.has(id(message.author.id)) ? id(message.author.id) : '';
    visiting.add(message);
    const targets = [];
    let valid = true;
    if (message.reference) {
      const target = owner(byId.get(id(message.reference.messageId)));
      if (!target) valid = false;
      else targets.push(target);
    } else if (role === 'bot') valid = false;
    const { mentions, anchored, named, group } = address(message);
    if (group || named === null) valid = false;
    // Profiles are mutable even on fetched older Message.author objects.
    // Names can veto an ID binding, but never establish historical ownership.
    targets.push(...anchored);
    const unique = new Set(targets);
    const target = unique.size === 1 ? [...unique][0] : '';
    if ((named || []).some(namedTarget => namedTarget !== target)) valid = false;
    // An in-body mention can contradict a recipient, but cannot create one.
    if (mentions.some(mentioned => mentioned !== target)) valid = false;
    const result = valid && customers.has(target) ? target : '';
    visiting.delete(message);
    resolved.set(message, result);
    return result;
  }
  const eligible = raw.filter(message => message && byId.get(id(message.id)) === message && id(message.id) !== id(excludeId));
  const entries = eligible.filter(message => owner(message) === customer)
    .map(message => ({
      id: id(message.id), author: roles.get(message), content: String(message.content || ''),
      caseContext: 'current_customer', role: roles.get(message), trust: 'conversation_only',
      at: Number.isFinite(message.createdTimestamp) ? message.createdTimestamp : null,
    }));
  const sourceMessages = eligible.filter(message => {
    if (roles.get(message) !== 'staff') return false;
    if (owner(message) === customer) return true;
    const { mentions, anchored, named, group } = address(message);
    return !message.reference && !group && mentions.length === 0 && anchored.length === 0 &&
      named !== null && named.length === 0;
  });
  return { entries, sourceMessages };
}

function projectCaseHistory(messages, options) { return projectCase(messages, options).entries; }
function caseSourceMessages(messages, options) { return projectCase(messages, options).sourceMessages; }

function marked(entry) {
  return entry && typeof entry === 'object' && 'caseContext' in entry;
}

function customerHistory(entries = []) {
  return entries.filter(entry => entry && (!marked(entry) ||
    (entry.caseContext === 'current_customer' && entry.role === 'customer')));
}

function formatCaseEntry(entry) {
  if (!entry) return '';
  if (!marked(entry)) return `${entry.author}: ${entry.content}`;
  if (entry.caseContext !== 'current_customer') return '';
  if (entry.role === 'customer') return `customer: ${entry.content}`;
  if (entry.role === 'staff' || entry.role === 'bot') {
    return `${entry.role} (unverified conversation context; not tool or current account-state proof): ${entry.content}`;
  }
  return '';
}

function caseContextPolicy(entries = []) {
  if (!entries.some(marked)) return '';
  return "Customer rows are this customer's own reports. Staff and bot rows were addressed to this customer but remain earlier unverified conversation, not current account/tool evidence. Latest customer corrections control; do not repeat disowned findings or infer investigation/ownership.";
}

module.exports = { projectCaseHistory, caseSourceMessages, customerHistory, formatCaseEntry, caseContextPolicy };
