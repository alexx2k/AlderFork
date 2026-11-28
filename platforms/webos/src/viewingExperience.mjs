// Ephemeral viewing-session policy, shared across player mounts but never persisted.
export const STILL_THRESHOLD=3;
export function newSession(profile){return {profile,autoStarts:0,suppressed:false,pendingFrame:false};}
export function forAdvance(session,origin){return {...session,autoStarts:origin==='autoplay'?session.autoStarts:0,pendingFrame:origin==='autoplay'};}
export function firstFrame(session){return session.pendingFrame?{...session,pendingFrame:false,autoStarts:Math.min(STILL_THRESHOLD,session.autoStarts+1)}:session;}
export function intentionalInput(session){return {...session,autoStarts:0,pendingFrame:false};}
export function confirmWatching(session,suppress){return {...intentionalInput(session),suppressed:session.suppressed||suppress};}
export function shouldAsk(session){return !session.suppressed&&session.autoStarts>=STILL_THRESHOLD;}
export function episodeAired(e,now=Date.now()){const at=Date.parse(e.released||'');return !Number.isFinite(at)||at<=now;}
export function seasonStats(episodes,watched,now=Date.now()){
 const result=[];for(const e of episodes){let row=result.find(r=>r.season===e.season);if(!row){row={season:e.season,total:0,unwatched:0};result.push(row);}if(episodeAired(e,now)){row.total++;if(!watched(e.id))row.unwatched++;}}
 return result;
}
export function episodeTarget(episodes,watched,resume,now=Date.now()){
 const available=episodes.filter(e=>episodeAired(e,now)),regular=available.filter(e=>e.season!==0);
 const eligible=regular.length?regular:available;
 return available.find(e=>!watched(e.id)&&resume(e.id)>0)||eligible.find(e=>!watched(e.id))||eligible[0]||null;
}
export function thumbnailCue(text,start,end,base,resolve){
 if(typeof text!=='string'||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)return null;
 const raw=text.trim();if(!raw||raw.length>2048||/\s|[<>"']/.test(raw))return null;
 const parts=raw.split('#'),image=parts[0];if(parts.length>2||! /\.(?:jpg|jpeg|png|webp)(?:\?|$)/i.test(image))return null;
 let url;try{url=resolve(image,base);if(!/^https?:\/\//i.test(url))return null;}catch{return null;}
 let crop=null;
 if(parts.length===2){const m=parts[1].match(/^xywh=(?:pixel:)?(\d+),(\d+),(\d+),(\d+)$/);if(!m)return null;const [x,y,w,h]=m.slice(1).map(Number);if(w<1||h<1||x+w>8192||y+h>8192)return null;crop={x,y,w,h};}
 return {start,end,url,crop};
}
export function thumbnailAt(cues,seconds){return cues.find(c=>seconds>=c.start&&seconds<c.end)||null;}
