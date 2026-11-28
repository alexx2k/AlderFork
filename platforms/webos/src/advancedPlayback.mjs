// Platform-independent advanced playback policy. No network, tokens or media URLs in persistent memory.
export const PREPARE_SECONDS=120;
export const PREPARED_TTL=120000;
export const COUNTDOWN_SECONDS=5;
export function providerKey(namespace,titleId){return 'tarn.seriesprovider.v1:'+encodeURIComponent(namespace)+':'+encodeURIComponent(titleId);}
export function preferredOrder(sources,provider){
 if(!provider)return sources.slice();
 return sources.filter(s=>s.providerId===provider).concat(sources.filter(s=>s.providerId!==provider));
}
// Reserve the last automatic attempt for another provider, if one is available.
export function fallbackIndex(sources,attempted,tries,preferred){
 if(tries>=3)return -1;
 if(tries===2&&preferred){const other=sources.findIndex((s,i)=>!attempted.has(i)&&s.providerId!==preferred);if(other>=0)return other;}
 return sources.findIndex((_,i)=>!attempted.has(i));
}
export function preparedFresh(prepared,namespace,intent,now=Date.now()){
 return !!prepared&&prepared.namespace===namespace&&prepared.videoId===intent.videoId&&prepared.titleId===intent.titleId&&prepared.type===intent.type&&Number.isFinite(prepared.at)&&now>=prepared.at&&now-prepared.at<=PREPARED_TTL&&!!prepared.result?.sources?.length;
}
export function introQuery(title,intent){
 if(intent.type!=='series'||!/^tt\d+$/.test(title.id))return null;
 const episode=title.episodes?.find(e=>e.id===intent.videoId);
 const match=intent.videoId.startsWith(title.id+':')?intent.videoId.match(/^tt\d+:(\d+):(\d+)$/):null;
 const season=episode?.season??(match?Number(match[1]):null),number=episode?.number??(match?Number(match[2]):null);
 if(!Number.isSafeInteger(season)||season<0||!Number.isSafeInteger(number)||number<1)return null;
 return {imdbId:title.id,season,episode:number};
}
export function parseSegments(raw){
 const segments=[];
 for(const kind of ['intro','recap','outro']){
  const s=raw?.[kind];if(!s||typeof s!=='object')continue;
  const start=s.start_sec,end=s.end_sec,confidence=s.confidence??1;
  if(typeof start!=='number'||typeof end!=='number'||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<.8)continue;
  segments.push({kind,start,end});
 }
 return segments;
}
export function chapterSegments(chapters,duration){
 if(!Number.isFinite(duration)||duration<=0)return [];
 const sorted=chapters.filter(c=>Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start>=0&&c.end>c.start&&c.end<=duration+1).sort((a,b)=>a.start-b.start);
 return sorted.reduce((out,c)=>{
  const label=String(c.label||'').trim();
  if(/\b(post[- ]credits?|after credits?|mid[- ]credits?)\b/i.test(label))return out;
  const kind=/^(?:end(?:ing)?[ -]+credits?|credits?|closing(?: titles)?|outro)$/i.test(label)?'outro':/\b(recap|previously on)\b/i.test(label)?'recap':/\b(intro|opening|opening titles)\b/i.test(label)?'intro':null;
  if(kind)out.push({kind,start:c.start,end:c.end});return out;
 },[]);
}
export function validCredits(duration,start){
 return Number.isFinite(duration)&&duration>=120&&Number.isFinite(start)&&start>=duration/2&&start<=duration-5;
}
export function creditsStart(duration,remote,chapters){
 if(!Number.isFinite(duration)||duration<120)return null;
 const fromRemote=remote.find(s=>s.kind==='outro'&&validCredits(duration,s.start)&&s.end<=duration+30);
 if(fromRemote)return fromRemote.start;
 const valid=chapters.filter(s=>s.kind==='outro'&&validCredits(duration,s.start)).map(s=>s.start);
 return valid.length?Math.min(...valid):null;
}
export function triggerAt(duration,remote,chapters,fallbackSeconds=5){
 if(!Number.isFinite(duration)||duration<120)return null;
 return creditsStart(duration,remote,chapters)??duration-Math.max(5,Math.min(30,Number.isFinite(fallbackSeconds)?fallbackSeconds:5));
}
export function skipSegment(position,duration,remote,chapters,dismissed){
 if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<120)return null;
 // Native chapters are stronger evidence than remote intro timings; never skip a whole episode.
 const valid=s=>s.kind!=='outro'&&s.start>=0&&s.end>s.start&&s.end<=Math.min(duration/2,600)&&s.end-s.start<=300;
 const options=chapters.some(valid)?chapters:remote;
 return options.find(s=>valid(s)&&position>=s.start&&position<s.end&&!dismissed.includes(segmentKey(s)))||null;
}
export function segmentKey(s){return s.kind+':'+s.start+':'+s.end;}
export function countdownTick(remaining,previous,current,playing){
 const delta=current-previous;
 return Math.max(0,remaining-(playing&&Number.isFinite(delta)&&delta>0&&delta<=2?delta:0));
}

// For the last episode or a movie, jump only to the end of a validated credits segment, not past a later scene.
export function creditsSkipTarget(duration,position,remote,chapters){
 const start=creditsStart(duration,remote,chapters);
 if(start===null||position<start)return null;
 const segment=remote.concat(chapters).find(s=>s.kind==='outro'&&s.start===start&&Number.isFinite(s.end)&&s.end>position&&s.end<=duration+1);
 return segment?Math.min(duration,segment.end):null;
}
