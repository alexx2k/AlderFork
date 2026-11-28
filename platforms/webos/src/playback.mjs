import {audioCodec,audioScore,qualityScore} from './playerPrefs.mjs';
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
  out.push({base:url.slice(0,-14),name:str(m.name)||str(m.id)||'Add-on',id:str(m.id)||str(m.name)||'Add-on'});
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
  return url?{url,id:str(s.id)||undefined,lang:str(s.lang)||'und',label:str(s.lang)||'Unknown',provider}:null;
 }).filter(Boolean);
}
export function parseStreams(raw,provider,providerId=provider){
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
  const codec=audioCodec(words),riskyAudio=['truehd','dts'].includes(codec);
  const cam=/\b(camrip|hdcam|hdts|telesync|telecine|screener|dvdscr)\b/.test(words);
  if(cam){excluded.other++;continue;}
  sources.push({url,provider,providerId,name,description,height,hevc,av1,hdr,riskyAudio,audioCodec:codec,filename:str(h.filename),size,subtitles:parseSubtitles(s.subtitles,provider)});
 }
 return {sources,excluded};
}
export function rankSources(sources,capabilities,prefs){
 const score=s=>{
  const height=s.height||720;
  return (s.hevc&&!capabilities.hevc?-100:0)+(s.av1&&!capabilities.av1?-120:0)+(s.hdr&&!capabilities.hdr?-50:0)+(prefs?audioScore(s.audioCodec||'unknown',capabilities.audio,prefs.audioMode):s.riskyAudio?-35:0)+(prefs?qualityScore(s.height,prefs.quality,capabilities.height):(height>capabilities.height?-40:0)+Math.min(height,capabilities.height)/100);
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
   try{results[i]=parseStreams(await request(resourceUrl(addon,'stream',intent),{},signal),addon.name,addon.id);}
   catch{if(!signal.aborted)failures++;}
  }
 }
 await Promise.all(Array.from({length:Math.min(4,addons.length)},worker));
 const sources=[],excluded={torrent:0,headers:0,external:0,other:0};
 for(const result of results){if(!result)continue;sources.push(...result.sources);for(const k of Object.keys(excluded))excluded[k]+=result.excluded[k];}
 return {sources,excluded,failures,providers:addons.length};
}
export async function resolveSubtitles(descriptors,intent,signal,request,source){
 const addons=resourceAddons(descriptors,'subtitles',intent).slice(0,12);
 const out=[];let cursor=0;
 async function worker(){
  while(!signal.aborted&&cursor<addons.length){
   const addon=addons[cursor++];
   try{
    const base=resourceUrl(addon,'subtitles',intent),specific=subtitleResourceUrl(base,source);
    let tracks=[];
    try{const r=obj(await request(specific,{},signal));tracks=parseSubtitles(r.subtitles,addon.name);}catch{}
    if(!tracks.length&&specific!==base&&!signal.aborted){const r=obj(await request(base,{},signal));tracks=parseSubtitles(r.subtitles,addon.name);}
    if(!signal.aborted)out.push(...tracks);
   }catch{}
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

// Store opaque matching keys, not expiring URLs, filenames, or provider credentials.
function fingerprint(value){
 let a=2166136261,b=5381;
 for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}
 return (a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
export function sourceIdentity(s){
 const provider=fingerprint(s.providerId||s.provider);
 const filename=s.filename?fingerprint(provider+'|'+s.filename.trim().toLowerCase()+'|'+(s.size||0)):'';
 const label=fingerprint(provider+'|'+s.name+'|'+s.description+'|'+(s.size||0));
 return {provider,exact:fingerprint(s.url),filename,label};
}
export function preferResumeSource(sources,saved){
 if(!saved)return sources;
 const entries=sources.map((s,i)=>({i,key:sourceIdentity(s)}));
 let found=entries.find(e=>e.key.exact===saved.exact&&e.key.provider===saved.provider);
 if(!found&&saved.filename){const matches=entries.filter(e=>e.key.filename===saved.filename&&e.key.provider===saved.provider);if(matches.length===1)found=matches[0];}
 if(!found){const matches=entries.filter(e=>e.key.label===saved.label&&e.key.provider===saved.provider);if(matches.length===1)found=matches[0];}
 if(!found)found=entries.find(e=>e.key.provider===saved.provider);
 return found?[sources[found.i],...sources.filter((_,i)=>i!==found.i)]:sources;
}
export function subtitleResourceUrl(base,source){
 const extras=[];
 if(source&&Number.isFinite(source.size)&&source.size>0)extras.push('videoSize='+Math.floor(source.size));
 if(source&&source.filename)extras.push('filename='+encodeURIComponent(source.filename));
 return extras.length?base.slice(0,-5)+'/'+extras.join('&')+'.json':base;
}
function cueTime(value){
 const parts=value.replace(',','.').split(':').map(Number);
 if(parts.some(n=>!Number.isFinite(n)))return NaN;
 return parts.length===3?parts[0]*3600+parts[1]*60+parts[2]:parts.length===2?parts[0]*60+parts[1]:NaN;
}
function cueText(value){
 return value.replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|lrm|rlm);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ','&lrm;':'\u200e','&rlm;':'\u200f'})[s]).trim();
}
export function parseCues(text){
 const input=String(text).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim(),out=[];
 const stamp='(?:\\d{1,3}:)?\\d{2}:\\d{2}[,.]\\d{3}';
 const timing=new RegExp('^\\s*('+stamp+')\\s+-->\\s+('+stamp+')(?:\\s.*)?$');
 for(const block of input.split(/\n[ \t]*\n/)){
  const lines=block.split('\n');
  if(/^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0]))continue;
  const i=lines.findIndex(line=>timing.test(line));
  if(i<0)continue;
  const match=lines[i].match(timing),start=cueTime(match[1]),end=cueTime(match[2]),value=cueText(lines.slice(i+1).join('\n'));
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&value)out.push({start,end,text:value});
 }
 if(!out.length)throw Error('No supported subtitle cues');
 return out.sort((a,b)=>a.start-b.start||a.end-b.end);
}
export function activeSubtitle(cues,seconds){
 if(!Number.isFinite(seconds))return '';
 // Typical subtitle lists are small. Stop once the next cue starts in the future.
 const lines=[];
 for(const cue of cues){if(cue.start>seconds)break;if(seconds<cue.end)lines.push(cue.text);}
 return lines.join('\n');
}
export function decodeSubtitle(bytes){
 if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
 if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return new TextDecoder('windows-1252').decode(bytes);}
}
