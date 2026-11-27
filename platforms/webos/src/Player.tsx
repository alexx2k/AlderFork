import React,{useEffect,useRef,useState} from 'react';
import type {PlaybackIntent} from './liveCatalogue.ts';
import {jsonRequest,installedAddons} from './stremio.ts';
import {rankSources,resolveStreams,resolveSubtitles,uniqueSubtitles,parseCues,activeSubtitle,decodeSubtitle,preferResumeSource,seekPosition,Source,Subtitle,Resolution,SubtitleCue} from './playback.mjs';
import {saveProgress,readSource,rememberSource} from './progress.ts';
import {mergeStreamAddons} from './profiles.mjs';

type AudioTrack={enabled:boolean;label?:string;language?:string};
type AudioList={length:number;[index:number]:AudioTrack;addEventListener?:(type:string,fn:()=>void)=>void;removeEventListener?:(type:string,fn:()=>void)=>void};
type NativeVideo=HTMLVideoElement&{audioTracks?:AudioList};
type Attempt={index:number;serial:number};
function capabilities(){
 const v=document.createElement('video');
 return {height:Math.min(2160,Math.max(720,screen.height||1080)),hevc:!!v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"'),av1:!!v.canPlayType('video/mp4; codecs="av01.0.08M.08"'),hdr:typeof matchMedia==='function'&&matchMedia('(dynamic-range: high)').matches};
}
function time(seconds:number){
 const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
 return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map((x,i)=>i===0?String(x):String(x).padStart(2,'0')).join(':');
}
function button(id:string,label:string,action:()=>void,disabled=false){
 return <button type="button" data-focus id={id} onClick={action} disabled={disabled}>{label}</button>;
}
export function Player({intent,addons,lenders,account,startAt,onProgress,onExit}:{intent:PlaybackIntent;addons:unknown[];lenders:string[];account:string;startAt:number;onProgress:(position:number,duration:number,played:number,ended:boolean)=>void;onExit:()=>void}){
 const [resolution,setResolution]=useState<Resolution|null>(null);
 const [sources,setSources]=useState<Source[]>([]);
 const [addonSubs,setAddonSubs]=useState<Subtitle[]>([]);
 const [attempt,setAttempt]=useState<Attempt|null>(null);
 const [revision,setRevision]=useState(0);
 const [panel,setPanel]=useState<'sources'|'subtitles'|'audio'|null>(null);
 const [status,setStatus]=useState('Finding compatible sources…');
 const [position,setPosition]=useState(()=>startAt);
 const [duration,setDuration]=useState(0);
 const [paused,setPaused]=useState(true);
 const [subtitle,setSubtitle]=useState<Subtitle|null>(null);
 const [subtitleStatus,setSubtitleStatus]=useState('');
 const [audio,setAudio]=useState<{index:number;name:string;enabled:boolean}[]>([]);
 const [cues,setCues]=useState<SubtitleCue[]>([]);
 const [caption,setCaption]=useState('');
 const [embedded,setEmbedded]=useState<{index:number;label:string}[]>([]);
 const [embeddedChoice,setEmbeddedChoice]=useState<number|null>(null);
 const [subtitleLoading,setSubtitleLoading]=useState(false);
 const video=useRef<NativeVideo|null>(null);
 const last=useRef({position:startAt,duration:0});
 const lastSaved=useRef(0);
 const playedSinceSave=useRef(0),lastTick=useRef<number|null>(null),finished=useRef(false),lastReport=useRef('');
 const resume=useRef(last.current.position);
 const pendingSeek=useRef<number|null>(null);
 const tries=useRef(0);
 const serial=useRef(0);
 const current=useRef<Attempt|null>(null);
 const failed=useRef(false);
 const activeSources=useRef<Source[]>([]);
 const attempted=useRef(new Set<number>());
 const started=useRef(false);
 const clock=useRef<number|undefined>(undefined);
 const stall=useRef<number|undefined>(undefined);
 const source=attempt?sources[attempt.index]:undefined;
 const persist=(final=false)=>{const p=last.current;if(p.duration<=0||finished.current)return;saveProgress(account,intent,p.position,p.duration);const done=final&&p.position>=p.duration*.9;if(!final&&p.position>=p.duration*.9)return;const signature=p.position+'|'+p.duration+'|'+done;if(signature===lastReport.current&&!playedSinceSave.current)return;lastReport.current=signature;if(done)finished.current=true;const watched=playedSinceSave.current;playedSinceSave.current=0;onProgress(p.position,p.duration,watched,done);};
 const cancelTimers=()=>{if(clock.current!==undefined)window.clearTimeout(clock.current);if(stall.current!==undefined)window.clearTimeout(stall.current);clock.current=undefined;stall.current=undefined;};
 const begin=(index:number,manual=false)=>{
  if(!activeSources.current[index])return;
  cancelTimers();
  if(manual){tries.current=0;attempted.current.clear();}
  const v=video.current;
  if(v&&started.current&&pendingSeek.current===null&&Number.isFinite(v.duration)&&v.duration>0){last.current={position:v.currentTime,duration:v.duration};resume.current=v.currentTime;persist();}
  else resume.current=last.current.position;
  lastTick.current=null;attempted.current.add(index);tries.current++;failed.current=false;started.current=false;pendingSeek.current=null;
  const next={index,serial:++serial.current};current.current=next;
  setAttempt(next);setPanel(null);setPaused(true);setStatus('Opening '+activeSources.current[index].name+'…');
  setSubtitle(null);setCues([]);setCaption('');setEmbedded([]);setEmbeddedChoice(null);setAddonSubs([]);setSubtitleStatus('');setAudio([]);
  requestAnimationFrame(()=>{if(current.current?.serial===next.serial&&document.activeElement===document.body)document.getElementById('player-toggle')?.focus();});
 };
 const fallback=(id:number,reason:string)=>{
  if(current.current?.serial!==id||failed.current)return;
  failed.current=true;cancelTimers();
  const v=video.current;
  if(v&&started.current&&pendingSeek.current===null&&Number.isFinite(v.duration)&&v.duration>0){last.current={position:v.currentTime,duration:v.duration};persist();}
  const next=activeSources.current.findIndex((_,i)=>!attempted.current.has(i));
  if(tries.current<3&&next>=0){begin(next);return;}
  current.current=null;setAttempt(null);setPaused(true);setStatus(reason+' Choose another source or retry.');setPanel('sources');
 };
 useEffect(()=>{
  const c=new AbortController(),signal=c.signal;
  setResolution(null);setSources([]);activeSources.current=[];setStatus('Finding compatible sources…');setPanel(null);setAttempt(null);current.current=null;
  tries.current=0;attempted.current.clear();
  const resolve=async()=>{
   const shared=await Promise.all(lenders.map(token=>installedAddons(token,signal).catch(()=>[])));
   return resolveStreams(mergeStreamAddons(addons,shared.reduce<unknown[]>((all,x)=>all.concat(x),[])),intent,signal,jsonRequest);
  };
  resolve().then(result=>{
   if(signal.aborted)return;
   const ranked=preferResumeSource(rankSources(result.sources,capabilities()),readSource(account,intent));activeSources.current=ranked;setSources(ranked);setResolution(result);
   if(ranked.length)begin(0,true);else setStatus(result.providers?'No directly playable sources found.':'No installed add-on advertises streams for this title.');
  }).catch(()=>{if(!signal.aborted)setStatus('Could not resolve sources. Retry or return to details.');});
  return()=>c.abort();
 },[revision]);
 useEffect(()=>{
  if(!attempt)return;
  const v=video.current,id=attempt.serial;if(!v)return;
  let alive=true;
  const valid=()=>alive&&current.current?.serial===id&&!failed.current;
  const startClock=()=>{clock.current=window.setTimeout(()=>{if(valid()&&!started.current)fallback(id,'Source did not start in time.');},25000);};
  const play=()=>{const p=v.play();if(p)p.catch(error=>{
   if(!valid())return;
   if(error?.name==='NotAllowedError'){cancelTimers();setStatus('Press Play to begin playback.');}
   else if(error?.name!=='AbortError')fallback(id,'Could not start this source.');
  });};
  const metadata=()=>{
   if(!valid())return;
   if(Number.isFinite(v.duration)&&v.duration>0){
    const target=resume.current<v.duration-10?resume.current:0;
    if(target>0)try{pendingSeek.current=target;v.currentTime=target;}catch{pendingSeek.current=null;}
    setDuration(v.duration);setPosition(target);
   }
   refreshAudio();refreshEmbedded();
  };
  const refreshAudio=()=>{
   if(!valid())return;
   const list=v.audioTracks;
   setAudio(list?Array.from({length:list.length},(_,index)=>({index,name:list[index].label||list[index].language||'Audio '+(index+1),enabled:list[index].enabled})):[]);
  };
  const refreshEmbedded=()=>{
   if(!valid())return;
   setEmbedded(Array.from({length:v.textTracks.length},(_,index)=>({track:v.textTracks[index],index})).filter(x=>x.track.kind==='subtitles'||x.track.kind==='captions').map(x=>({index:x.index,label:x.track.label||x.track.language||'Embedded '+(x.index+1)})));
  };
  const playing=()=>{if(!valid())return;started.current=true;const successful=activeSources.current[attempt.index];if(successful)rememberSource(account,intent,successful);cancelTimers();setPaused(false);setStatus('Playing');refreshAudio();refreshEmbedded();};
  const pausedEvent=()=>{if(valid()){lastTick.current=null;setPaused(true);if(started.current){cancelTimers();persist();}}};
  const tick=()=>{
   if(!valid()||!started.current||!Number.isFinite(v.duration)||v.duration<=0)return;
   if(pendingSeek.current!==null){if(v.seeking||Math.abs(v.currentTime-pendingSeek.current)>3)return;pendingSeek.current=null;}
   const before=lastTick.current;lastTick.current=v.currentTime;if(before!==null&&!v.paused&&!v.seeking){const delta=v.currentTime-before;if(delta>0&&delta<=3)playedSinceSave.current+=delta;}
   last.current={position:v.currentTime,duration:v.duration};setPosition(v.currentTime);setDuration(v.duration);
   if(Date.now()-lastSaved.current>=5000){lastSaved.current=Date.now();persist();}
  };
  const waiting=()=>{
   if(!valid()||v.paused)return;
   setStatus('Buffering…');
   if(started.current&&stall.current===undefined)stall.current=window.setTimeout(()=>{stall.current=undefined;if(valid()&&!v.paused&&v.readyState<3)fallback(id,'Playback stalled.');},20000);
  };
  const ended=()=>{if(!valid())return;cancelTimers();if(Number.isFinite(v.duration)){last.current={position:v.duration,duration:v.duration};setPosition(v.duration);persist(true);}setPaused(true);setStatus('Playback finished.');};
  const error=()=>{if(valid())fallback(id,'Media playback error '+(v.error?.code||'unknown')+'.');};
  const seeked=()=>{if(valid()){pendingSeek.current=null;lastTick.current=null;}};
  const listeners:[string,()=>void][]=[['seeked',seeked],['loadedmetadata',metadata],['playing',playing],['pause',pausedEvent],['timeupdate',tick],['waiting',waiting],['stalled',waiting],['ended',ended],['error',error]];
  listeners.forEach(([event,fn])=>v.addEventListener(event,fn));
  v.audioTracks?.addEventListener?.('change',refreshAudio);v.audioTracks?.addEventListener?.('addtrack',refreshAudio);
  v.textTracks.addEventListener?.('addtrack',refreshEmbedded);v.textTracks.addEventListener?.('removetrack',refreshEmbedded);
  startClock();v.src=activeSources.current[attempt.index].url;v.load();play();
  return()=>{alive=false;cancelTimers();listeners.forEach(([event,fn])=>v.removeEventListener(event,fn));v.audioTracks?.removeEventListener?.('change',refreshAudio);v.audioTracks?.removeEventListener?.('addtrack',refreshAudio);v.textTracks.removeEventListener?.('addtrack',refreshEmbedded);v.textTracks.removeEventListener?.('removetrack',refreshEmbedded);v.pause();v.removeAttribute('src');v.load();};
 },[attempt?.serial]);
 useEffect(()=>{const flush=()=>persist(true);window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',flush);return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',flush);persist(true);};},[]);
 useEffect(()=>{
  if(!attempt||!source){setAddonSubs([]);setSubtitleLoading(false);return;}
  const c=new AbortController();setAddonSubs([]);setSubtitleLoading(true);
  resolveSubtitles(addons,intent,c.signal,jsonRequest,source).then(t=>{if(!c.signal.aborted)setAddonSubs(t);}).catch(()=>{}).finally(()=>{if(!c.signal.aborted)setSubtitleLoading(false);});
  return()=>c.abort();
 },[attempt?.serial]);
 useEffect(()=>{
  setCues([]);setCaption('');
  if(!subtitle)return;
  const c=new AbortController();let active=true;const timeout=window.setTimeout(()=>{c.abort();if(active)setSubtitleStatus('Subtitle download timed out.');},15000);
  setSubtitleStatus('Downloading subtitles…');
  (async()=>{
   try{
    const r=await fetch(subtitle.url,{signal:c.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!r.ok){if(active)setSubtitleStatus('Subtitle server returned HTTP '+r.status+'. Try another track.');return;}
    const declared=Number(r.headers.get('content-length')||0);
    if(declared>2*1024*1024){if(active)setSubtitleStatus('Subtitle file is too large.');return;}
    const bytes=new Uint8Array(await r.arrayBuffer());
    if(c.signal.aborted)return;
    if(bytes.length>2*1024*1024){if(active)setSubtitleStatus('Subtitle file is too large.');return;}
    try{
     const parsed=parseCues(decodeSubtitle(bytes));
     if(active&&!c.signal.aborted){setCues(parsed);setSubtitleStatus(parsed.length+' subtitle cues loaded.');}
    }catch{if(active)setSubtitleStatus('Unsupported or empty subtitle file. Try another SRT/WebVTT track.');}
   }catch{if(active&&!c.signal.aborted)setSubtitleStatus('Subtitle download failed (network or CORS). Try another track.');}
   finally{window.clearTimeout(timeout);}
  })();
  return()=>{active=false;c.abort();window.clearTimeout(timeout);};
 },[subtitle,attempt?.serial]);
 useEffect(()=>{
  const v=video.current;if(!v||!cues.length){setCaption('');return;}
  const update=()=>setCaption(activeSubtitle(cues,v.currentTime));
  update();const timer=window.setInterval(update,150);
  v.addEventListener('timeupdate',update);v.addEventListener('seeked',update);
  return()=>{window.clearInterval(timer);v.removeEventListener('timeupdate',update);v.removeEventListener('seeked',update);};
 },[cues,attempt?.serial]);
 useEffect(()=>{
  const v=video.current;if(!v)return;
  for(let i=0;i<v.textTracks.length;i++){const t=v.textTracks[i];if(t.kind==='subtitles'||t.kind==='captions')t.mode=embeddedChoice===i?'showing':'disabled';}
 },[embeddedChoice,embedded,attempt?.serial]);
 const toggle=()=>{
  const v=video.current;if(!v||!attempt)return;
  if(!v.paused){v.pause();return;}
  setStatus('Starting…');
  if(!started.current){cancelTimers();clock.current=window.setTimeout(()=>fallback(attempt.serial,'Source did not start in time.'),25000);}
  v.play()?.catch(error=>{if(error?.name==='NotAllowedError'){cancelTimers();setStatus('Playback blocked by this device. Press Play again.');}else fallback(attempt.serial,'Could not play this source.');});
 };
 const seek=(delta:number)=>{const v=video.current;if(v&&Number.isFinite(v.duration)&&v.duration>0){pendingSeek.current=null;lastTick.current=null;try{v.currentTime=seekPosition(v.currentTime,v.duration,delta);setPosition(v.currentTime);}catch{setStatus('Seeking is not available for this source.');}}};
 const tracks=uniqueSubtitles((source?.subtitles||[]).concat(addonSubs));
 const selectAudio=(index:number)=>{
  const list=video.current?.audioTracks;if(!list)return;
  try{for(let i=0;i<list.length;i++)list[i].enabled=i===index;setAudio(previous=>previous.map(a=>({...a,enabled:a.index===index})));}catch{setStatus('Audio track selection is not supported by this device.');}
 };
 const retry=()=>{persist();cancelTimers();setRevision(x=>x+1);};
 const closePanel=()=>{const target=panel==='sources'?'player-sources':panel==='subtitles'?'player-subs':'player-audio';setPanel(null);requestAnimationFrame(()=>document.getElementById(target)?.focus());};
 const exit=()=>{persist(true);onExit();};
 return <main className="player-page">
  <div className="player-video">{attempt&&source?<video key={attempt.serial} ref={video} playsInline preload="auto"/>:<div className="player-empty"><h1>{intent.name}</h1><p>{status}</p></div>}</div>
  {caption&&!panel&&<div className="player-caption" aria-hidden="true"><span>{caption}</span></div>}
  <section className="player-controls"><div className="player-top"><h2>{intent.name}</h2><p aria-live="polite">{status}{source?' · '+source.provider:''}</p></div>
   <div className="player-progress"><span>{time(position)}</span><div className="progress-rail"><div style={{width:(duration>0?Math.max(0,Math.min(100,100*position/duration)):0)+'%'}}/></div><span>{time(duration)}</span></div>
   <div className="controls">{button('player-back','‹ Back',exit)}{button('player-rewind','−10 sec',()=>seek(-10),!attempt)}{button('player-toggle',paused?'▶ Play':'Ⅱ Pause',toggle,!attempt)}{button('player-forward','+10 sec',()=>seek(10),!attempt)}{button('player-sources','Sources ('+sources.length+')',()=>setPanel(panel==='sources'?null:'sources'))}{button('player-subs','Subtitles',()=>setPanel(panel==='subtitles'?null:'subtitles'),!attempt)}{button('player-audio','Audio',()=>setPanel(panel==='audio'?null:'audio'),!attempt)}{button('player-retry','Retry sources',retry)}</div>
  </section>
  {panel&&<section className="player-panel"><div className="player-panel-header"><h2>{panel==='sources'?'Sources':panel==='audio'?'Audio tracks':'Subtitles'}</h2>{button('player-close-panel','Close',closePanel)}</div>
   {panel==='sources'?<><p className="muted">Direct HTTP(S) sources only. Automatic playback tries up to three candidates.</p>{resolution&&<p className="muted">{resolution.providers} providers · {resolution.failures} failed · {resolution.excluded.torrent} torrent · {resolution.excluded.headers} header-dependent · {resolution.excluded.external} external · {resolution.excluded.other} other excluded</p>}
    <div className="player-list">{sources.map((s,i)=><button key={i} id={'source-'+i} data-focus type="button" className={attempt?.index===i?'filter-active':''} onClick={()=>begin(i,true)}><strong>{s.name}</strong><small>{s.provider}{s.height?' · '+s.height+'p':''}{s.hevc?' · HEVC':''}{s.hdr?' · HDR/DV':''}{s.riskyAudio?' · audio compatibility uncertain':''}</small><small>{s.description}</small></button>)}</div>{!sources.length&&<p>No compatible direct sources to display.</p>}</>:panel==='audio'?<>{audio.length?audio.map(a=><button key={a.index} id={'audio-'+a.index} data-focus type="button" className={a.enabled?'filter-active':''} onClick={()=>selectAudio(a.index)}>{a.name}</button>):<p>This device does not expose selectable native audio tracks.</p>}</>:<><div className="player-list">{button('subtitle-off','Off',()=>{setSubtitle(null);setCues([]);setCaption('');setEmbeddedChoice(null);setSubtitleStatus('Subtitles off.');})}{embedded.map(t=><button key={'embedded-'+t.index} id={'embedded-'+t.index} data-focus type="button" className={embeddedChoice===t.index?'filter-active':''} onClick={()=>{setSubtitle(null);setCues([]);setCaption('');setEmbeddedChoice(t.index);setSubtitleStatus('Native embedded subtitle selected.');}}>{t.label} · Embedded</button>)}{tracks.map((t,i)=><button key={i} id={'subtitle-'+i} data-focus type="button" className={subtitle?.url===t.url?'filter-active':''} onClick={()=>{setEmbeddedChoice(null);setCues([]);setCaption('');setSubtitle(previous=>previous?.url===t.url?{...t}:t);}}>{t.label} · {t.provider}</button>)}</div><p aria-live="polite">{subtitleStatus||(subtitleLoading?'Finding subtitles for this source…':!tracks.length&&!embedded.length?'No subtitle tracks available.':'External SRT/WebVTT rendered by Tarn. Embedded tracks depend on the device.')}</p></>}
  </section>}
 </main>;
}
