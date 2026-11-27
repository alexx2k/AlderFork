// Platform-independent playback helpers. Source URLs and add-on configuration stay in memory.
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const str=v=>typeof v==='string'?v:'';
const arr=v=>Array.isArray(v)?v:[];
const strings=v=>arr(v).filter(x=>typeof x==='string');
export function httpUrl(value){
 try{const u=new URL(str(value));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function resourceAddons(descriptors,resource,intent){
 const out=[];
 for(const raw of descriptors){
  const d=obj(raw),m=obj(d.manifest),url=httpUrl(d.transportUrl);
  if(!url)continue;
  const u=new URL(url);
  if(u.search||u.hash||!u.pathname.endsWith('/manifest.json'))continue;
  const declaration=arr(m.resources).find(r=>r===resource||obj(r).name===resource);
  if(!declaration)continue;
  const r=obj(declaration),types=strings(r.types||m.types),prefixes=strings(typeof declaration==='string'?m.idPrefixes:r.idPrefixes);
  if(!types.includes(intent.type)||prefixes.length&&!prefixes.some(p=>intent.videoId.startsWith(p)))continue;
  out.push({base:url.slice(0,-14),name:str(m.name)||str(m.id)||'Add-on'});
 }
 return out;
}
export function resourceUrl(addon,resource,intent){
 const enc=s=>encodeURIComponent(s).replace(/%3A/gi,':');
 return addon.base+'/'+resource+'/'+enc(intent.type)+'/'+enc(intent.videoId)+'.json';
}
export function parseSubtitles(raw,provider){
 return arr(raw).map(x=>{
  const s=obj(x),url=httpUrl(s.url);
  return url?{url,lang:str(s.lang)||'und',label:str(s.lang)||'Unknown',provider}:null;
 }).filter(Boolean);
}
export function parseStreams(raw,provider){
 if(!Array.isArray(obj(raw).streams))throw Error('Invalid stream response');
 const sources=[],excluded={torrent:0,headers:0,external:0,other:0};
 for(const value of raw.streams){
  const s=obj(value),h=obj(s.behaviorHints),url=httpUrl(s.url);
  if(!url||/\.torrent(?:$|[?#])/i.test(url)){
   if(s.infoHash||/^magnet:/i.test(str(s.url))||/\.torrent(?:$|[?#])/i.test(str(s.url)))excluded.torrent++;
   else if(s.externalUrl||s.ytId)excluded.external++;
   else excluded.other++;
   continue;
  }
  if(h.notWebReady===true||Object.keys(obj(obj(h.proxyHeaders).request)).length||Object.keys(obj(obj(h.proxyHeaders).response)).length){excluded.headers++;continue;}
  const size=Number(h.videoSize)||0;
  if(size>0&&size<5*1024*1024){excluded.other++;continue;}
  const name=str(s.name)||provider,description=str(s.description)||str(s.title);
  const words=[name,description,str(h.filename)].join(' ').toLowerCase();
  const height=/2160|\b4k\b|\buhd\b/.test(words)?2160:/1080/.test(words)?1080:/720/.test(words)?720:/480/.test(words)?480:0;
  const hevc=/hevc|[xh][ .-]?265/.test(words),av1=/\bav1\b/.test(words),hdr=/\bhdr|\bdv\b|dolby.?vision|\bdovi\b/.test(words);
  const riskyAudio=/truehd|\bdts(?:[ .-]?hd)?\b/.test(words);
  const cam=/\b(camrip|hdcam|hdts|telesync|telecine|screener|dvdscr)\b/.test(words);
  if(cam){excluded.other++;continue;}
  sources.push({url,provider,name,description,height,hevc,av1,hdr,riskyAudio,subtitles:parseSubtitles(s.subtitles,provider)});
 }
 return {sources,excluded};
}
export function rankSources(sources,capabilities){
 const score=s=>{
  const height=s.height||720;
  return (s.hevc&&!capabilities.hevc?-100:0)+(s.av1&&!capabilities.av1?-120:0)+(s.hdr&&!capabilities.hdr?-50:0)+(s.riskyAudio?-35:0)+(height>capabilities.height?-40:0)+Math.min(height,capabilities.height)/100;
 };
 const seen=new Set();
 return sources.slice().sort((a,b)=>score(b)-score(a)).filter(s=>{if(seen.has(s.url))return false;seen.add(s.url);return true;});
}
export async function resolveStreams(descriptors,intent,signal,request){
 const addons=resourceAddons(descriptors,'stream',intent),results=new Array(addons.length);
 let cursor=0,failures=0;
 async function worker(){
  while(!signal.aborted&&cursor<addons.length){
   const i=cursor++,addon=addons[i];
   try{results[i]=parseStreams(await request(resourceUrl(addon,'stream',intent),{},signal),addon.name);}
   catch{if(!signal.aborted)failures++;}
  }
 }
 await Promise.all(Array.from({length:Math.min(4,addons.length)},worker));
 const sources=[],excluded={torrent:0,headers:0,external:0,other:0};
 for(const result of results){if(!result)continue;sources.push(...result.sources);for(const k of Object.keys(excluded))excluded[k]+=result.excluded[k];}
 return {sources,excluded,failures,providers:addons.length};
}
export async function resolveSubtitles(descriptors,intent,signal,request){
 const addons=resourceAddons(descriptors,'subtitles',intent).slice(0,12);
 const out=[];let cursor=0;
 async function worker(){
  while(!signal.aborted&&cursor<addons.length){
   const addon=addons[cursor++];
   try{const r=obj(await request(resourceUrl(addon,'subtitles',intent),{},signal));out.push(...parseSubtitles(r.subtitles,addon.name));}catch{}
  }
 }
 await Promise.all(Array.from({length:Math.min(4,addons.length)},worker));return out;
}
export function uniqueSubtitles(tracks){
 const seen=new Set();return tracks.filter(t=>{if(seen.has(t.url))return false;seen.add(t.url);return true;});
}
export function toVtt(text){
 const input=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 if(/^WEBVTT(?:\s|$)/.test(input))return input+'\n';
 if(!/\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(input))throw Error('Unsupported subtitle format');
 const cues=input.split(/\n\s*\n/).map(block=>block.split('\n').map(line=>line.includes('-->')?line.replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2'):line).join('\n')).filter(block=>block.includes('-->'));
 return 'WEBVTT\n\n'+cues.join('\n\n')+'\n';
}
export function resumePosition(record){
 if(!record||!Number.isFinite(record.position)||!Number.isFinite(record.duration)||record.position<10||record.duration<=0||record.position>=record.duration-15||record.position/record.duration>=.95)return 0;
 return record.position;
}
export function seekPosition(position,duration,delta){
 if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0)return 0;
 return Math.max(0,Math.min(duration,position+delta));
}
export function progressKey(account,intent){
 return 'tarn.progress.v1:'+encodeURIComponent(account)+':'+encodeURIComponent(intent.type+'|'+intent.videoId);
}
