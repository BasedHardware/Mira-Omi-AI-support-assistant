// A shared staff message may point to public guidance, but its prose is not
// evidence about the current customer. Only catalog-matched pages are read.
const { caseSourceMessages } = require('./caseContext');
function publicSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return '';
    if (url.hostname === 'help.omi.me' && /^\/en\/articles\/[A-Za-z0-9-]+\/?$/.test(url.pathname)) return url.href;
    if (url.hostname === 'docs.omi.me' && /^\/[A-Za-z0-9_./-]+$/.test(url.pathname)) return url.href;
  } catch {}
  return '';
}

function sourceHintUrls(values = []) {
  return [...new Set(values.map(publicSourceUrl).filter(Boolean))].slice(0, 2);
}

function sharedSourceHints(messages, options = {}) {
  const rows = [], seen = new Set();
  for (const message of caseSourceMessages(messages, options)) {
    for (const match of String(message.content || '').matchAll(/https:\/\/[^\s<>]+/g)) {
      const url = publicSourceUrl(match[0].replace(/[),.;]+$/, ''));
      if (!url || seen.has(url)) continue;
      seen.add(url);
      rows.push({ id: `${message.id}-source-${rows.length}`, at: message.createdTimestamp || 0,
        author: 'shared official reference', role: 'source_hint', content: url,
        caseContext: 'shared_source', trust: 'conversation_only' });
      if (rows.length === 2) return rows;
    }
  }
  return rows;
}

module.exports = { sourceHintUrls, sharedSourceHints };
