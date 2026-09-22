/**
 * A download that never touches plain http, not even in passing.
 *
 * `fetch` follows redirects by itself and only reports where it ended up, so
 * an https → http → https chain looks clean from the outside while the middle
 * hop could be rewritten in transit to point anywhere. The files fetched this
 * way decide what gets written to `ingredients`, so each hop is checked before
 * it is followed.
 */

const MAX_REDIRECTS = 5;

async function fetchHttps(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!current.startsWith("https://")) throw new Error(`refusing non-HTTPS URL: ${current}`);
    const res = await fetch(current, { redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    current = new URL(location, current).href;
  }
  throw new Error(`more than ${MAX_REDIRECTS} redirects from ${url}`);
}

export { fetchHttps };
