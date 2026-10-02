import {analyticsConfig} from './analytics-config.js?v=7';
const preferenceKey='first-lap-analytics';
const configured=/^G-[A-Z0-9]+$/.test(analyticsConfig.measurementId);
let allowed=false,loaded=false;
const copy={
 en:{note:'Help improve FIRST LAP? With your permission, Google Analytics uses cookies to measure visits and race interactions. The race works without analytics.',allow:'Allow analytics',reject:'No thanks',settings:'Analytics settings',saved:'Your analytics choice is saved. You can change it below.'},
 ko:{note:'FIRST LAP 개선에 참여할까요? 동의하면 Google Analytics가 쿠키를 사용해 방문과 경기 체험을 측정합니다. 동의하지 않아도 모든 기능을 이용할 수 있습니다.',allow:'분석 허용',reject:'허용 안 함',settings:'분석 설정',saved:'분석 설정을 저장했습니다. 아래에서 변경할 수 있습니다.'}
};
function readPreference(){try{return localStorage.getItem(preferenceKey)}catch{return null}}
function safeLocation(){
 const url=new URL(location.href),clean=new URL(url.origin+url.pathname);
 for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']){
  const value=url.searchParams.get(key);
  // Campaign labels only. Never use names, contact details or private IDs in UTMs.
  if(value&&/^[a-zA-Z0-9_-]{1,80}$/.test(value))clean.searchParams.set(key,value);
 }
 return clean.href;
}
function loadTag(){
 if(loaded||!allowed||!configured)return;
 loaded=true;
 window.dataLayer=window.dataLayer||[];
 window.gtag=function(){window.dataLayer.push(arguments)};
 window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 window.gtag('js',new Date());
 let referrer='';try{referrer=new URL(document.referrer).origin}catch{}
 window.gtag('config',analyticsConfig.measurementId,{send_page_view:true,page_location:safeLocation(),page_referrer:referrer,allow_google_signals:false,allow_ad_personalization_signals:false,...(analyticsConfig.debug?{debug_mode:true}:{})});
 const script=document.createElement('script');script.async=true;script.src=`https://www.googletagmanager.com/gtag/js?id=${analyticsConfig.measurementId}`;document.head.append(script);
}
function choose(value){
 allowed=value==='granted';
 try{localStorage.setItem(preferenceKey,value)}catch{}
 if(loaded&&!allowed){window[`ga-disable-${analyticsConfig.measurementId}`]=true;window.gtag('consent','update',{analytics_storage:'denied'});}
 if(allowed){window[`ga-disable-${analyticsConfig.measurementId}`]=false;if(loaded)window.gtag('consent','update',{analytics_storage:'granted'});else loadTag();}
 document.getElementById('analyticsNotice').hidden=true;
 refreshAnalyticsLanguage();
}
export function refreshAnalyticsLanguage(){
 if(!configured)return;
 const t=copy[document.documentElement.lang]||copy.en;
 document.getElementById('analyticsNotice').setAttribute('aria-label',t.settings);
 document.getElementById('analyticsText').textContent=t.note;
 document.getElementById('analyticsAllow').textContent=t.allow;
 document.getElementById('analyticsReject').textContent=t.reject;
 document.getElementById('analyticsSettings').textContent=t.settings;
}
export function initAnalytics(){
 if(!configured)return;
 const settings=document.getElementById('analyticsSettings');settings.hidden=false;
 document.getElementById('analyticsAllow').onclick=()=>choose('granted');
 document.getElementById('analyticsReject').onclick=()=>choose('denied');
 settings.onclick=()=>{document.getElementById('analyticsNotice').hidden=false;document.getElementById('analyticsAllow').focus()};
 const choice=readPreference();allowed=choice==='granted';
 document.getElementById('analyticsNotice').hidden=choice==='granted'||choice==='denied';
 refreshAnalyticsLanguage();loadTag();
}
export function track(name,parameters={}){
 if(!configured||!allowed||!loaded)return;
 window.gtag('event',name,{...parameters,page_location:safeLocation()});
}
