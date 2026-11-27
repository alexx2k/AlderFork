import React,{useEffect,useRef,useState} from 'react';
import type {PlaybackIntent} from './liveCatalogue.ts';
import {jsonRequest} from './stremio.ts';
import {rankSources,resolveStreams,resolveSubtitles,uniqueSubtitles,toVtt,seekPosition,Source,Subtitle,Resolution} from './playback.mjs';
import {resumeFor,saveProgress} from './progress.ts';

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
export function Player({intent,addons,account,onExit}:{intent:PlaybackIntent;addons:unknown[];account:string;onExit:()=>void}){
 const [resolution,setResolution]=useState<Resolution|null>(null);
 const [sources,setSources]=useState<Source[]>([]);
 const [addonSubs,setAddonSubs]=useState<Subtitle[]>([]);
 const [attempt,setAttempt]=useState<Attempt|null>(null);
 const [revision,setRevision]=useState(0);
 const [panel,setPanel]=useState<'sources'|'subtitles'|'audio'|null>(null);
 const [status,setStatus]=useState('Finding compatible sources…');
 const [position,setPosition]=useState(()=>resumeFor(account,intent));
 const [duration,setDuration]=useState(0);
 const [paused,setPaused]=useState(true);
 const [subtitle,setSubtitle]=useState<Subtitle|null>(null);
 const [subtitleStatus,setSubtitleStatus]=useState('');
 const [audio,setAudio]=useState<{index:number;name:string;enabled:boolean}[]>([]);
 const [subtitleUrl,setSubtitleUrl]=useState('');
 const video=useRef<NativeVideo|null>(null);
 const last=useRef({position:resumeFor(account,intent),duration:0});
 const lastSaved=useRef(0);
 const resume=useRef(last.current.position);
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
 const persist=()=>{const p=last.current;if(p.duration>0)saveProgress(account,intent,p.position,p.duration);};
 const cancelTimers=()=>{if(clock.current!==undefined)window.clearTimeout(clock.current);if(stall.current!==undefined)window.clearTimeout(stall.current);clock.current=undefined;stall.current=undefined;};
 const begin=(index:number,manual=false)=>{
  if(!activeSources.current[index])return;
  cancelTimers();
  if(manual){tries.current=0;attempted.current.clear();}
  const v=video.current;
  if(v&&started.current&&Number.isFinite(v.duration)&&v.duration>0){last.current={position:v.currentTime,duration:v.duration};resume.current=v.currentTime;persist();}
  else resume.current=last.current.position;
  attempted.current.add(index);tries.current++;failed.current=false;started.current=false;
  const next={index,serial:++serial.current};current.current=next;
  setAttempt(next);setPanel(null);setPaused(true);setStatus('Opening '+activeSources.current[index].name+'…');
  setSubtitle(null);setSubtitleStatus('');setAudio([]);
 };
 const fallback=(id:number,reason:string)=>{
  if(current.current?.serial!==id||failed.current)return;
  failed.current=true;cancelTimers();
  const v=video.current;
  if(v&&started.current&&Number.isFinite(v.duration)&&v.duration>0){last.current={position:v.currentTime,duration:v.duration};persist();}
  const next=activeSources.current.findIndex((_,i)=>!attempted.current.has(i));
  if(tries.current<3&&next>=0){begin(next);return;}
  current.current=null;setAttempt(null);setPaused(true);setStatus(reason+' Choose another source or retry.');setPanel('sources');
 };
 useEffect(()=>{
  const c=new AbortController(),signal=c.signal;
  setResolution(null);setSources([]);activeSources.current=[];setStatus('Finding compatible sources…');setPanel(null);setAttempt(null);current.current=null;
  tries.current=0;attempted.current.clear();
  resolveStreams(addons,intent,signal,jsonRequest).then(result=>{
   if(signal.aborted)return;
   const ranked=rankSources(result.sources,capabilities());activeSources.current=ranked;setSources(ranked);setResolution(result);
   if(ranked.length)begin(0,true);else setStatus(result.providers?'No directly playable sources found.':'No installed add-on advertises streams for this title.');
  }).catch(()=>{if(!signal.aborted)setStatus('Could not resolve sources. Retry or return to details.');});
  resolveSubtitles(addons,intent,signal,jsonRequest).then(t=>{if(!signal.aborted)setAddonSubs(t);}).catch(()=>{});
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
    if(target>0)try{v.currentTime=target;}catch{}
    setDuration(v.duration);setPosition(target);
   }
   refreshAudio();
  };
  const refreshAudio=()=>{
   if(!valid())return;
   const list=v.audioTracks;
   setAudio(list?Array.from({length:list.length},(_,index)=>({index,name:list[index].label||list[index].language||'Audio '+(index+1),enabled:list[index].enabled})):[]);
  };
  const playing=()=>{if(!valid())return;started.current=true;cancelTimers();setPaused(false);setStatus('Playing');refreshAudio();};
  const pausedEvent=()=>{if(valid()){setPaused(true);cancelTimers();persist();}};
  const tick=()=>{
   if(!valid()||!started.current||!Number.isFinite(v.duration)||v.duration<=0)return;
   last.current={position:v.currentTime,duration:v.duration};setPosition(v.currentTime);setDuration(v.duration);
   if(Date.now()-lastSaved.current>=5000){lastSaved.current=Date.now();persist();}
  };
  const waiting=()=>{
   if(!valid()||v.paused)return;
   setStatus('Buffering…');
   if(started.current&&stall.current===undefined)stall.current=window.setTimeout(()=>{stall.current=undefined;if(valid()&&!v.paused&&v.readyState<3)fallback(id,'Playback stalled.');},20000);
  };
  const ended=()=>{if(!valid())return;cancelTimers();if(Number.isFinite(v.duration)){last.current={position:v.duration,duration:v.duration};setPosition(v.duration);persist();}setPaused(true);setStatus('Playback finished.');};
  const error=()=>{if(valid())fallback(id,'Media playback error '+(v.error?.code||'unknown')+'.');};
  const listeners:[string,()=>void][]=[['loadedmetadata',metadata],['playing',playing],['pause',pausedEvent],['timeupdate',tick],['waiting',waiting],['stalled',waiting],['ended',ended],['error',error]];
  listeners.forEach(([event,fn])=>v.addEventListener(event,fn));
  v.audioTracks?.addEventListener?.('change',refreshAudio);v.audioTracks?.addEventListener?.('addtrack',refreshAudio);
  startClock();v.src=activeSources.current[attempt.index].url;v.load();play();
  return()=>{alive=false;cancelTimers();listeners.forEach(([event,fn])=>v.removeEventListener(event,fn));v.audioTracks?.removeEventListener?.('change',refreshAudio);v.audioTracks?.removeEventListener?.('addtrack',refreshAudio);v.pause();v.removeAttribute('src');v.load();};
 },[attempt?.serial]);
 useEffect(()=>{const flush=()=>persist();window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',flush);return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',flush);persist();};},[]);
 useEffect(()=>{
  setSubtitleUrl('');
  if(!subtitle)return;
  const c=new AbortController();let objectUrl='';const timeout=window.setTimeout(()=>c.abort(),15000);
  setSubtitleStatus('Loading subtitles…');
  (async()=>{
   try{
    const r=await fetch(subtitle.url,{signal:c.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!r.ok)throw Error();
    const declared=Number(r.headers.get('content-length')||0);
    if(declared>2*1024*1024)throw Error();
    const text=await r.text();
    if(text.length>2*1024*1024||c.signal.aborted)throw Error();
    objectUrl=URL.createObjectURL(new Blob([toVtt(text)],{type:'text/vtt'}));
    setSubtitleUrl(objectUrl);setSubtitleStatus('Subtitles enabled (if supported by this device).');
   }catch{if(!c.signal.aborted)setSubtitleStatus('Subtitle unavailable or unsupported. Try another track.');}
   finally{window.clearTimeout(timeout);}
  })();
  return()=>{c.abort();window.clearTimeout(timeout);if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[subtitle]);
 useEffect(()=>{const v=video.current;if(!v)return;for(let i=0;i<v.textTracks.length;i++)v.textTracks[i].mode=subtitleUrl?'showing':'disabled';},[subtitleUrl,attempt?.serial]);
 const toggle=()=>{
  const v=video.current;if(!v||!attempt)return;
  if(!v.paused){v.pause();return;}
  setStatus('Starting…');
  if(!started.current){cancelTimers();clock.current=window.setTimeout(()=>fallback(attempt.serial,'Source did not start in time.'),25000);}
  v.play()?.catch(error=>{if(error?.name==='NotAllowedError'){cancelTimers();setStatus('Playback blocked by this device. Press Play again.');}else fallback(attempt.serial,'Could not play this source.');});
 };
 const seek=(delta:number)=>{const v=video.current;if(v&&Number.isFinite(v.duration)&&v.duration>0){v.currentTime=seekPosition(v.currentTime,v.duration,delta);setPosition(v.currentTime);}};
 const tracks=uniqueSubtitles((source?.subtitles||[]).concat(addonSubs));
 const selectAudio=(index:number)=>{
  const list=video.current?.audioTracks;if(!list)return;
  try{for(let i=0;i<list.length;i++)list[i].enabled=i===index;setAudio(previous=>previous.map(a=>({...a,enabled:a.index===index})));}catch{setStatus('Audio track selection is not supported by this device.');}
 };
 const retry=()=>{persist();cancelTimers();setRevision(x=>x+1);};
 const exit=()=>{persist();onExit();};
 return <main className="player-page">
  <div className="player-video">{attempt&&source?<video key={attempt.serial} ref={video} playsInline preload="auto">{subtitleUrl&&<track key={subtitleUrl} kind="subtitles" src={subtitleUrl} srcLang={subtitle?.lang||'und'} label={subtitle?.label||'Subtitles'} default onError={()=>setSubtitleStatus('Device could not render this subtitle track.')}/>}</video>:<div className="player-empty"><h1>{intent.name}</h1><p>{status}</p></div>}</div>
  <section className="player-controls"><div className="player-top"><h2>{intent.name}</h2><p aria-live="polite">{status}{source?' · '+source.provider:''}</p></div>
   <div className="player-progress"><span>{time(position)}</span><div className="progress-rail"><div style={{width:(duration>0?Math.max(0,Math.min(100,100*position/duration)):0)+'%'}}/></div><span>{time(duration)}</span></div>
   <div className="controls">{button('player-back','‹ Back',exit)}{button('player-rewind','−10 sec',()=>seek(-10),!attempt)}{button('player-toggle',paused?'▶ Play':'Ⅱ Pause',toggle,!attempt)}{button('player-forward','+10 sec',()=>seek(10),!attempt)}{button('player-sources','Sources ('+sources.length+')',()=>setPanel(panel==='sources'?null:'sources'))}{button('player-subs','Subtitles',()=>setPanel(panel==='subtitles'?null:'subtitles'),!attempt)}{button('player-audio','Audio',()=>setPanel(panel==='audio'?null:'audio'),!attempt)}{button('player-retry','Retry sources',retry)}</div>
  </section>
  {panel&&<section className="player-panel"><div className="player-panel-header"><h2>{panel==='sources'?'Sources':panel==='audio'?'Audio tracks':'Subtitles'}</h2>{button('player-close-panel','Close',()=>setPanel(null))}</div>
   {panel==='sources'?<><p className="muted">Direct HTTP(S) sources only. Automatic playback tries up to three candidates.</p>{resolution&&<p className="muted">{resolution.providers} providers · {resolution.failures} failed · {resolution.excluded.torrent} torrent · {resolution.excluded.headers} header-dependent · {resolution.excluded.external} external · {resolution.excluded.other} other excluded</p>}
    <div className="player-list">{sources.map((s,i)=><button key={i} id={'source-'+i} data-focus type="button" className={attempt?.index===i?'filter-active':''} onClick={()=>begin(i,true)}><strong>{s.name}</strong><small>{s.provider}{s.height?' · '+s.height+'p':''}{s.hevc?' · HEVC':''}{s.hdr?' · HDR/DV':''}{s.riskyAudio?' · audio compatibility uncertain':''}</small><small>{s.description}</small></button>)}</div>{!sources.length&&<p>No compatible direct sources to display.</p>}</>:panel==='audio'?<>{audio.length?audio.map(a=><button key={a.index} id={'audio-'+a.index} data-focus type="button" className={a.enabled?'filter-active':''} onClick={()=>selectAudio(a.index)}>{a.name}</button>):<p>This device does not expose selectable native audio tracks.</p>}</>:<><div className="player-list">{button('subtitle-off','Off',()=>{setSubtitle(null);setSubtitleStatus('Subtitles off.');})}{tracks.map((t,i)=><button key={i} id={'subtitle-'+i} data-focus type="button" className={subtitle?.url===t.url?'filter-active':''} onClick={()=>setSubtitle(t)}>{t.label} · {t.provider}</button>)}</div><p aria-live="polite">{subtitleStatus||(!tracks.length?'No external subtitles available.':'External SRT/WebVTT. Embedded tracks depend on the device.')}</p></>}
  </section>}
 </main>;
}
