import { analyticsConfig } from './config.js';
import { referrerOrigin, safeLocation } from './url.js';

const PREFERENCE_KEY = 'first-lap-analytics';
const INTERNAL_KEY = 'first-lap-internal';
// EEA, UK and Switzerland: analytics cookies stay off until the visitor opts in.
// Everywhere else analytics starts on entry and the visitor can opt out.
const OPT_IN_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT',
  'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH',
]; // prettier-ignore
const ADS_DENIED = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

const copy = {
  en: {
    note: 'FIRST LAP uses Google Analytics cookies to count visits and race interactions. We never collect your name or contact details.',
    policy: 'Privacy policy',
    allow: 'OK',
    reject: 'Decline',
    settings: 'Analytics settings',
  },
  ko: {
    note: 'FIRST LAP은 방문과 체험 통계를 위해 Google Analytics 쿠키를 사용합니다. 이름·연락처 같은 개인 식별 정보는 수집하지 않습니다.',
    policy: '개인정보처리방침',
    allow: '확인',
    reject: '거부',
    settings: '분석 설정',
  },
};

const { measurementId, productionHosts, debug } = analyticsConfig;
let choice = null;
let loaded = false;

const $ = (id) => document.getElementById(id);

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

// Open the site once with ?internal=1 to tag this browser as internal traffic
// (excluded by the GA4 "Internal Traffic" data filter). ?internal=0 clears it.
function isInternal() {
  const flag = new URL(location.href).searchParams.get('internal');
  if (flag === '1') writeStorage(INTERNAL_KEY, '1');
  if (flag === '0') writeStorage(INTERNAL_KEY, null);
  return readStorage(INTERNAL_KEY) === '1';
}

function gtag() {
  window.dataLayer.push(arguments);
}

function loadTag() {
  if (loaded) return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = gtag;
  gtag('consent', 'default', {
    ...ADS_DENIED,
    analytics_storage: 'denied',
    region: OPT_IN_REGIONS,
  });
  gtag('consent', 'default', { ...ADS_DENIED, analytics_storage: 'granted' });
  if (choice === 'granted') gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  gtag('config', measurementId, {
    page_location: safeLocation(location.href),
    page_referrer: referrerOrigin(document.referrer),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(isInternal() && { traffic_type: 'internal' }),
    ...(debug && { debug_mode: true }),
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
}

function choose(value) {
  choice = value;
  writeStorage(PREFERENCE_KEY, value);
  window[`ga-disable-${measurementId}`] = value === 'denied';
  if (loaded) gtag('consent', 'update', { analytics_storage: value });
  else if (value === 'granted') loadTag();
  $('analyticsNotice').hidden = true;
}

function isEnabled() {
  return /^G-[A-Z0-9]+$/.test(measurementId) && productionHosts.includes(location.hostname);
}

export function refreshAnalyticsLanguage() {
  if (!isEnabled()) return;
  const t = copy[document.documentElement.lang] || copy.en;
  $('analyticsNotice').setAttribute('aria-label', t.settings);
  $('analyticsText').textContent = t.note;
  $('analyticsPolicy').textContent = t.policy;
  $('analyticsAllow').textContent = t.allow;
  $('analyticsReject').textContent = t.reject;
  $('analyticsSettings').textContent = t.settings;
}

export function initAnalytics() {
  if (!isEnabled()) return;
  const settings = $('analyticsSettings');
  settings.hidden = false;
  settings.onclick = () => {
    $('analyticsNotice').hidden = false;
    $('analyticsAllow').focus();
  };
  $('analyticsAllow').onclick = () => choose('granted');
  $('analyticsReject').onclick = () => choose('denied');
  const saved = readStorage(PREFERENCE_KEY);
  choice = saved === 'granted' || saved === 'denied' ? saved : null;
  $('analyticsNotice').hidden = choice !== null;
  refreshAnalyticsLanguage();
  if (choice === 'denied') window[`ga-disable-${measurementId}`] = true;
  else loadTag();
}

export function track(name, parameters = {}) {
  if (!loaded || choice === 'denied') return;
  gtag('event', name, { ...parameters, page_location: safeLocation(location.href) });
}
