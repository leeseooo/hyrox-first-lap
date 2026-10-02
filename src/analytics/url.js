const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
// Campaign labels only. Names, contact details or private IDs never belong in UTMs.
const UTM_VALUE = /^[a-zA-Z0-9_-]{1,80}$/;

/** Drops every query parameter and hash except well-formed UTM tags. */
export function safeLocation(href) {
  const url = new URL(href);
  const clean = new URL(url.origin + url.pathname);
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key);
    if (value && UTM_VALUE.test(value)) clean.searchParams.set(key, value);
  }
  return clean.href;
}

/** Keeps only the referring origin so paths and queries of other sites are never sent. */
export function referrerOrigin(referrer) {
  try {
    return new URL(referrer).origin;
  } catch {
    return '';
  }
}
