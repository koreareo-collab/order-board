// News headlines from public RSS feeds (shown with the source name).
// Each feed refreshes every 30 minutes; if the network is down the last list is kept.
//   BBC News World      https://feeds.bbci.co.uk/news/world/rss.xml
//   ANTARA (인도네시아어) https://www.antaranews.com/rss/top-news.xml
const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•', eacute: 'é', copy: '©', euro: '€', pound: '£', yen: '¥', deg: '°', times: '×' };
function entities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return NAMED[e.toLowerCase()] ?? m;
  });
}
function decode(s) {
  let t = String(s || '').replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
  t = entities(entities(t)); // some feeds encode twice ("&amp;#39;")
  return t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
}

function createFeed(url, maxTitle = 110) {
  let cache = { items: [], at: 0, error: null };
  async function refresh() {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0 (desk dashboard)' } });
      const xml = await r.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
        .map(m => ({
          title: tag(m[1], 'title'),
          desc: tag(m[1], 'description').slice(0, 300),
          link: tag(m[1], 'link') || tag(m[1], 'guid'),
          time: Date.parse(tag(m[1], 'pubDate')) || null,
        }))
        .filter(x => x.title && x.title.length <= maxTitle);
      if (items.length) cache = { items, at: Date.now(), error: null };
    } catch (e) { cache.error = e.message; }
    return cache;
  }
  function headlines() {
    if (Date.now() - cache.at > 30 * 60000) refresh(); // background refresh
    return cache.items;
  }
  return { refresh, headlines };
}

const bbc = createFeed('https://feeds.bbci.co.uk/news/world/rss.xml');
const indonesia = createFeed('https://www.antaranews.com/rss/top-news.xml');

// kept for existing callers: require('./bbc').refresh() / .headlines()
module.exports = { refresh: bbc.refresh, headlines: bbc.headlines, bbc, indonesia, createFeed };
