export const TABS=['Home','Discover','Movies','Series','My List'];
export const homeDefaults={start:'Home',order:TABS.slice(1),hidden:[],featured:true,blurThumbnails:false,updates:true};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
export function cleanHome(raw){
 const p=obj(raw),known=values=>Array.isArray(values)?Array.from(new Set(values.filter(v=>TABS.slice(1).includes(v)))):[];
 const hidden=known(p.hidden),order=known(p.order).concat(TABS.slice(1).filter(t=>!known(p.order).includes(t)));
 return {start:TABS.includes(p.start)&&!hidden.includes(p.start)?p.start:'Home',order,hidden,featured:typeof p.featured==='boolean'?p.featured:true,blurThumbnails:p.blurThumbnails===true,updates:typeof p.updates==='boolean'?p.updates:true};
}
export function homeKey(namespace){return 'tarn.homeprefs.v1:'+encodeURIComponent(namespace);}
export function visibleTabs(p){const v=cleanHome(p);return ['Home',...v.order.filter(t=>!v.hidden.includes(t))];}
export function changeTab(p,tab,kind,delta=0){
 const v=cleanHome(p);if(!v.order.includes(tab))return v;
 if(kind==='toggle')return cleanHome({...v,hidden:v.hidden.includes(tab)?v.hidden.filter(t=>t!==tab):v.hidden.concat(tab)});
 if(kind==='move'){const order=v.order.slice(),i=order.indexOf(tab),j=i+delta;if(![-1,1].includes(delta)||j<0||j>=order.length)return v;[order[i],order[j]]=[order[j],order[i]];return cleanHome({...v,order});}
 return v;
}
export const MAX_AVATAR_BYTES=8*1024*1024;
export const MAX_AVATAR_PIXELS=24000000;
export const MAX_AVATAR_DATA=180000;
export function validLocalAvatar(value){return typeof value==='string'&&value.length<=MAX_AVATAR_DATA&&/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(value);}
export function avatarCrop(width,height){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>MAX_AVATAR_PIXELS)throw Error('Image dimensions are too large or invalid.');
 const side=Math.min(width,height);return {x:(width-side)/2,y:(height-side)/2,side,size:Math.min(side,256)};
}
export function versionParts(value){if(typeof value!=='string'||!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(value))return null;return value.split('.').map(Number);}
export function compareVersions(a,b){const x=versionParts(a),y=versionParts(b);if(!x||!y)return null;for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;}
export const RELEASES_URL='https://github.com/alexx2k/Tarn/releases';
export const RELEASES_API='https://api.github.com/repos/alexx2k/Tarn/releases?per_page=30';
export const APP_ID='dev.tarn.webos.dev';
export const APP_VERSION='0.6.0';
export function availableUpdate(raw,current=APP_VERSION,appId=APP_ID){
 if(!Array.isArray(raw)||!versionParts(current))return null;
 let best=null;
 for(const r of raw){
  if(!r||r.draft!==false||r.prerelease!==false||!Array.isArray(r.assets))continue;
  for(const a of r.assets){
   if(!a||typeof a.name!=='string'||!a.name.startsWith(appId+'_')||!a.name.endsWith('_all.ipk'))continue;
   const version=a.name.slice(appId.length+1,-'_all.ipk'.length);
   if(compareVersions(version,current)!==1||best&&compareVersions(version,best.version)!==1)continue;
   const tag=typeof r.tag_name==='string'?r.tag_name:'';
   if(!tag||!/^[-a-zA-Z0-9._]+$/.test(tag)||a.browser_download_url!==RELEASES_URL+'/download/'+tag+'/'+a.name||a.state!=='uploaded'||!Number.isFinite(a.size)||a.size<=0)continue;
   best={version,url:a.browser_download_url,tag,page:RELEASES_URL+'/tag/'+tag};
  }
 }
 return best;
}
export function releaseScore(source,prefs){
 const label=[source.name,source.description,source.filename].join(' ').toLowerCase();
 const dv=/\bdv\b|\bdovi\b|dolby[ ._-]?vision/.test(label),hdr=/\bhdr(?:10|10\+)?\b/.test(label),remux=/\bremux\b/.test(label),web=/\bweb[ ._-]?(?:dl|rip)\b/.test(label);
 const kind=remux?'remux':web?'web':/\b(?:x264|x265|encode)\b/.test(label)?'encode':'unknown';
 let score=prefs.releaseType&&prefs.releaseType!=='auto'&&kind===prefs.releaseType?18:0;
 if(prefs.hdrPreference==='sdr'&&(dv||hdr||source.hdr))score-=45;
 if(prefs.hdrPreference==='hdr10'&&hdr)score+=18;
 if(prefs.hdrPreference==='dv'&&dv)score+=18;
 return score;
}
