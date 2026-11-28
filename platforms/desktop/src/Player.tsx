import React,{useEffect,useRef,useState} from 'react';
import type {PlaybackIntent,Title,Episode} from './liveCatalogue.ts';
import {jsonRequest,installedAddons} from './stremio.ts';
import {rankSources,resolveStreams,resolveSubtitles,uniqueSubtitles,parseCues,activeSubtitle,decodeSubtitle,preferResumeSource,seekPosition,Source,Subtitle,Resolution,SubtitleCue} from './playback.mjs';
import {saveProgress,readSource,rememberSource} from './progress.ts';
import {mergeStreamAddons} from './profiles.mjs';
import {PlayerPreferences} from './PlayerPreferences.tsx';
import {Prefs,colors,matchTrack,preferredTrack,trackFingerprint,scrubTarget,scrubStep,captionTime,objectFit,shouldAutoHide} from './playerPrefs.mjs';
import {readChoices,saveChoices} from './playerSettings.ts';
import {directionFor,isBack} from './navigation.ts';
import {PREPARE_SECONDS,COUNTDOWN_SECONDS,preferredOrder,fallbackIndex,preparedFresh,introQuery,parseSegments,chapterSegments,triggerAt,creditsSkipTarget,skipSegment,segmentKey,countdownTick,Prepared,Segment,Chapter} from './advancedPlayback.mjs';
import {readProvider,saveProvider,forgetProvider} from './advancedStore.ts';
import {firstFrame,forAdvance,intentionalInput,confirmWatching,shouldAsk,newSession,thumbnailCue,thumbnailAt,ViewingSession,Thumbnail} from './viewingExperience.mjs';
import {boundedBody,withinSeekRange,mediaSnapshot} from './auditPolicy.mjs';
import {ScrubThumbnail} from './ScrubThumbnail.tsx';
function readThumbnails(v:HTMLVideoElement):Thumbnail[]{
 const out:Thumbnail[]=[];
 for(let i=0;i<v.textTracks.length;i++){
  const track=v.textTracks[i];
  if(track.kind!=='metadata'||!/thumbnail|storyboard|trick.?play/i.test(track.label))continue;
  try{
   if(track.mode==='disabled')track.mode='hidden';
   const cues=track.cues;if(!cues)continue;
   const element=Array.from(v.querySelectorAll('track')).find(el=>el.track===track);
   const base=element?.src||v.currentSrc;
   for(let j=0;j<Math.min(cues.length,20000);j++){
    const c=cues[j] as VTTCue;
    const frame=thumbnailCue(c.text,c.startTime,c.endTime,base,(url,base)=>{const u=new URL(url,base);if(u.username||u.password)throw Error('Credentials in URL');return u.href;});
    if(frame)out.push(frame);
   }
  }catch{}
 }
 return out.sort((a,b)=>a.start-b.start);
}
async function resolveEpisodeSources(addons:unknown[],lenders:string[],intent:PlaybackIntent,signal:AbortSignal){
 const shared=await Promise.all(lenders.map(token=>installedAddons(token,signal).catch(()=>[])));
 return resolveStreams(mergeStreamAddons(addons,shared.reduce<unknown[]>((all,x)=>all.concat(x),[])),intent,signal,jsonRequest);
}
function nativeChapters(v:HTMLVideoElement):Chapter[]{
 const out:Chapter[]=[];
 for(let i=0;i<v.textTracks.length;i++){
  const t=v.textTracks[i];if(t.kind!=='chapters')continue;
  try{if(t.mode==='disabled')t.mode='hidden';const cues=t.cues;if(cues)for(let j=0;j<cues.length;j++){const cue=cues[j] as VTTCue;if(typeof cue.text==='string')out.push({label:cue.text,start:cue.startTime,end:cue.endTime});}}catch{}
 }
 return out;
}

type AudioTrack={enabled:boolean;label?:string;language?:string};
type AudioList={length:number;[index:number]:AudioTrack;addEventListener?:(type:string,fn:()=>void)=>void;removeEventListener?:(type:string,fn:()=>void)=>void};
type NativeVideo=HTMLVideoElement&{audioTracks?:AudioList};
type Attempt={index:number;serial:number};
function capabilities(){
 const v=document.createElement('video');
 const audio={aac:!!v.canPlayType('audio/mp4; codecs="mp4a.40.2"'),mp3:!!v.canPlayType('audio/mpeg'),ac3:!!v.canPlayType('audio/mp4; codecs="ac-3"'),eac3:!!v.canPlayType('audio/mp4; codecs="ec-3"'),opus:!!v.canPlayType('audio/webm; codecs="opus"')};
 return {audio,height:Math.min(2160,Math.max(720,screen.height||1080)),hevc:!!v.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"'),av1:!!v.canPlayType('video/mp4; codecs="av01.0.08M.08"'),hdr:typeof matchMedia==='function'&&matchMedia('(dynamic-range: high)').matches};
}
function time(seconds:number){
 const n=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
 return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map((x,i)=>i===0?String(x):String(x).padStart(2,'0')).join(':');
}
function button(id:string,label:string,action:()=>void,disabled=false){
 return <button type="button" data-focus id={id} onClick={action} disabled={disabled}>{label}</button>;
}
export function Player({viewingSession,title,nextIntent,nextEpisode,prepared,onAdvance,intent,addons,lenders,account,startAt,prefs,onPrefs,onProgress,onExit}:{viewingSession:React.MutableRefObject<ViewingSession>;title:Title;nextIntent:PlaybackIntent|null;nextEpisode:Episode|null;prepared?:Prepared;onAdvance:(next:PlaybackIntent,prepared:Prepared|undefined,origin:'manual'|'autoplay')=>void;intent:PlaybackIntent;addons:unknown[];lenders:string[];account:string;startAt:number;prefs:Prefs;onPrefs:(patch:Partial<Prefs>)=>void;onProgress:(position:number,duration:number,played:number,ended:boolean)=>void;onExit:()=>void}){
 const [stillPrompt,setStillPrompt]=useState(false);
 const stillActive=useRef(false),stillTarget=useRef<PlaybackIntent|null>(null);
 const [thumbnailFrames,setThumbnailFrames]=useState<Thumbnail[]>([]);
 const deliberate=()=>{if(!stillActive.current)viewingSession.current=intentionalInput(viewingSession.current);};
 const countFrame=()=>{if(viewingSession.current.profile===account)viewingSession.current=firstFrame(viewingSession.current);};
 const [remoteSegments,setRemoteSegments]=useState<Segment[]>([]);
 const [chapterMarkers,setChapterMarkers]=useState<Segment[]>([]);
 const [dismissedSegments,setDismissedSegments]=useState<string[]>([]);
 const [upNextDismissed,setUpNextDismissed]=useState(false);
 const [countdown,setCountdown]=useState<number|null>(null);
 const [endedPlayback,setEndedPlayback]=useState(false);
 const [pageVisible,setPageVisible]=useState(()=>document.visibilityState!=='hidden');
 const preparedNext=useRef<Prepared|undefined>(undefined),prefetchController=useRef<AbortController|null>(null);
 const advanced=useRef(false),remaining=useRef(COUNTDOWN_SECONDS),manualAttempt=useRef(-1),usedPrepared=useRef(false);
 const latestProgress=useRef(onProgress);latestProgress.current=onProgress;
 const latestAdvance=useRef(onAdvance);latestAdvance.current=onAdvance;
 const [preferredProvider,setPreferredProvider]=useState(()=>intent.type==='series'?readProvider(account,intent.titleId):null);
 const preferred=useRef(preferredProvider);preferred.current=preferredProvider;
 const [resolution,setResolution]=useState<Resolution|null>(null);
 const [sources,setSources]=useState<Source[]>([]);
 const [addonSubs,setAddonSubs]=useState<Subtitle[]>([]);
 const [attempt,setAttempt]=useState<Attempt|null>(null);
 const [revision,setRevision]=useState(0);
 const [panel,setPanel]=useState<'sources'|'subtitles'|'audio'|'settings'|null>(null);
 const [controlsShown,setControlsShown]=useState(true);
 const [activity,setActivity]=useState(0);
 const pointerActivity=useRef(0);
 const [preview,setPreview]=useState<number|null>(null);
 const scrubValue=useRef<number|null>(null),scrubTimer=useRef<number|undefined>(undefined),repeatCount=useRef(0),revealKey=useRef(false);
 const titleChoiceKey=intent.type+'|'+intent.titleId;
 const [initialChoices]=useState(()=>readChoices(account,titleChoiceKey));
 const choices=useRef(initialChoices);
 const latestPrefs=useRef(prefs);latestPrefs.current=prefs;
 const selectedAudioAttempt=useRef(-1),subtitleChosen=useRef(false);
 const [status,setStatus]=useState('Finding compatible sources…');
 const [position,setPosition]=useState(()=>startAt);
 const [duration,setDuration]=useState(0);
 const [paused,setPaused]=useState(true);
 const [subtitle,setSubtitle]=useState<Subtitle|null>(null);
 const [subtitleStatus,setSubtitleStatus]=useState('');
 const [audio,setAudio]=useState<{index:number;name:string;lang:string;enabled:boolean}[]>([]);
 const [cues,setCues]=useState<SubtitleCue[]>([]);
 const [caption,setCaption]=useState('');
 const [embedded,setEmbedded]=useState<{index:number;label:string;lang:string}[]>([]);
 const [embeddedChoice,setEmbeddedChoice]=useState<number|null>(null);
 const [subtitleLoading,setSubtitleLoading]=useState(false);
 const video=useRef<NativeVideo|null>(null);
 const last=useRef({position:startAt,duration:0});
 const lastSaved=useRef(0);
 const playedSinceSave=useRef(0),lastTick=useRef<number|null>(null),finished=useRef(false),lastReport=useRef('');
 const resume=useRef(last.current.position);
 const seekDeadline=useRef(0);
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
 const persist=(final=false,forceComplete=false)=>{const p=mediaSnapshot(last.current.position,last.current.duration);if(!p||finished.current)return;saveProgress(account,intent,p.position,p.duration);const done=forceComplete||final&&p.position>=p.duration*.9;if(!final&&p.position>=p.duration*.9)return;const signature=p.position+'|'+p.duration+'|'+done;if(signature===lastReport.current&&!playedSinceSave.current)return;lastReport.current=signature;if(done)finished.current=true;const watched=playedSinceSave.current;playedSinceSave.current=0;latestProgress.current(p.position,p.duration,watched,done);};
 const cancelTimers=()=>{if(clock.current!==undefined)window.clearTimeout(clock.current);if(stall.current!==undefined)window.clearTimeout(stall.current);clock.current=undefined;stall.current=undefined;};
 const resetReplay=()=>{finished.current=false;lastReport.current='';playedSinceSave.current=0;lastTick.current=null;last.current={position:0,duration:0};resume.current=0;pendingSeek.current=null;setEndedPlayback(false);setUpNextDismissed(false);setDismissedSegments([]);};
 const begin=(index:number,manual=false,explicit=false)=>{
  if(!activeSources.current[index])return;
  cancelTimers();
  if(manual){tries.current=0;attempted.current.clear();}
  const v=video.current;
  if(finished.current)resetReplay();
  else if(v&&started.current&&pendingSeek.current===null&&Number.isFinite(v.duration)&&v.duration>0){last.current={position:v.currentTime,duration:v.duration};resume.current=v.currentTime;persist();}
  else resume.current=last.current.position;
  lastTick.current=null;selectedAudioAttempt.current=-1;subtitleChosen.current=false;clearScrub();setControlsShown(true);setActivity(x=>x+1);attempted.current.add(index);tries.current++;failed.current=false;started.current=false;pendingSeek.current=null;
  const next={index,serial:++serial.current};current.current=next;manualAttempt.current=explicit?next.serial:-1;setEndedPlayback(false);setChapterMarkers([]);setThumbnailFrames([]);
  setAttempt(next);setPanel(null);setPaused(true);setDuration(0);setPosition(resume.current);setCountdown(null);setStatus('Opening '+activeSources.current[index].name+'…');
  setSubtitle(null);setCues([]);setCaption('');setEmbedded([]);setEmbeddedChoice(null);setSubtitleLoading(true);setAddonSubs([]);setSubtitleStatus('');setAudio([]);
  requestAnimationFrame(()=>{if(current.current?.serial===next.serial&&!document.activeElement?.closest('.player-controls'))document.getElementById('player-toggle')?.focus();});
 };
 const fallback=(id:number,reason:string)=>{
  if(current.current?.serial!==id||failed.current)return;
  failed.current=true;cancelTimers();
  const v=video.current;
  if(v&&started.current&&pendingSeek.current===null&&Number.isFinite(v.duration)&&v.duration>0){last.current={position:v.currentTime,duration:v.duration};persist();}
  const next=fallbackIndex(activeSources.current,attempted.current,tries.current,preferred.current);
  if(next>=0){begin(next);return;}
  if(usedPrepared.current){usedPrepared.current=false;setAttempt(null);current.current=null;setRevision(x=>x+1);return;}
  current.current=null;setAttempt(null);setPaused(true);setControlsShown(true);setStatus(reason+' Choose another source or retry.');setPanel('sources');requestAnimationFrame(()=>document.getElementById('player-close-panel')?.focus());
 };
 useEffect(()=>{
  const c=new AbortController(),signal=c.signal;
  setResolution(null);setSources([]);activeSources.current=[];setStatus('Finding compatible sources…');setPanel(null);setAttempt(null);current.current=null;
  tries.current=0;attempted.current.clear();
  const cached=revision===0&&preparedFresh(prepared,account,intent)?prepared:undefined;
  usedPrepared.current=!!cached;
  const resolve=cached?Promise.resolve(cached.result):resolveEpisodeSources(addons,lenders,intent,signal);
  resolve.then(result=>{
   if(signal.aborted)return;
   const ranked=preferResumeSource(preferredOrder(rankSources(result.sources,capabilities(),latestPrefs.current),preferred.current),readSource(account,intent));activeSources.current=ranked;setSources(ranked);setResolution(result);
   if(ranked.length)begin(0,true);else setStatus(result.providers?'No directly playable sources found.':'No installed add-on advertises streams for this title.');
  }).catch(()=>{if(!signal.aborted)setStatus('Could not resolve sources. Retry or return to details.');});
  return()=>c.abort();
 },[revision]);
 useEffect(()=>{
  if(!attempt)return;
  const v=video.current,id=attempt.serial;if(!v)return;
  let alive=true,frameHandle:number|undefined,framePending=false,frameStart=0,frameCallbackSupported=false;
  const frameVideo=v as NativeVideo&{requestVideoFrameCallback?:(callback:()=>void)=>number;cancelVideoFrameCallback?:(handle:number)=>void};
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
    if(target>0)try{pendingSeek.current=target;seekDeadline.current=Date.now()+10000;v.currentTime=target;}catch{pendingSeek.current=null;}
    setDuration(v.duration);setPosition(target);
   }
   refreshAudio();refreshEmbedded();setChapterMarkers(chapterSegments(nativeChapters(v),v.duration));setThumbnailFrames(readThumbnails(v));
  };
  const refreshAudio=()=>{
   if(!valid())return;
   const list=v.audioTracks;
   if(list&&list.length&&selectedAudioAttempt.current!==id){
    const wanted=choices.current.audio||{lang:latestPrefs.current.audioLanguage};
    const options=Array.from({length:list.length},(_,i)=>({lang:list[i].language||'',label:list[i].label||''}));
    const chosen=preferredTrack(options,wanted,latestPrefs.current.audioFallback);
    if(chosen>=0){selectedAudioAttempt.current=id;try{for(let i=0;i<list.length;i++)list[i].enabled=i===chosen;}catch{}}
   }
   setAudio(list?Array.from({length:list.length},(_,index)=>({index,name:list[index].label||list[index].language||'Audio '+(index+1),lang:list[index].language||'',enabled:list[index].enabled})):[]);
  };
  const refreshEmbedded=()=>{
   if(!valid())return;
   setEmbedded(Array.from({length:v.textTracks.length},(_,index)=>({track:v.textTracks[index],index})).filter(x=>x.track.kind==='subtitles'||x.track.kind==='captions').map(x=>({index:x.index,label:x.track.label||x.track.language||'Embedded '+(x.index+1),lang:x.track.language||''})));
  };
  const playing=()=>{if(!valid())return;started.current=true;if(viewingSession.current.pendingFrame&&!framePending){framePending=true;frameStart=v.currentTime;if(typeof frameVideo.requestVideoFrameCallback==='function')try{frameHandle=frameVideo.requestVideoFrameCallback(()=>{frameHandle=undefined;if(valid()&&v.videoWidth>0)countFrame();else frameCallbackSupported=false;});frameCallbackSupported=true;}catch{frameHandle=undefined;}}const successful=activeSources.current[attempt.index];if(successful){rememberSource(account,intent,successful);if(intent.type==='series'&&manualAttempt.current===id){manualAttempt.current=-1;saveProvider(account,intent.titleId,successful.providerId);preferred.current=successful.providerId;setPreferredProvider(successful.providerId);}}cancelTimers();setPaused(false);setStatus('Playing');refreshAudio();refreshEmbedded();setThumbnailFrames(readThumbnails(v));};
  const pausedEvent=()=>{if(valid()){lastTick.current=null;setPaused(true);if(started.current){cancelTimers();persist();}}};
  const tick=()=>{
   if(!valid()||!started.current||!Number.isFinite(v.duration)||v.duration<=0)return;
   if(pendingSeek.current!==null){if(v.seeking)return;if(Math.abs(v.currentTime-pendingSeek.current)>3&&Date.now()<seekDeadline.current)return;pendingSeek.current=null;}
   if(viewingSession.current.pendingFrame&&framePending&&v.videoWidth>0&&!v.paused&&!v.seeking&&v.readyState>=2&&v.currentTime>frameStart+.05&&(!frameCallbackSupported||v.currentTime>frameStart+2))countFrame();
   const before=lastTick.current;lastTick.current=v.currentTime;if(before!==null&&!v.paused&&!v.seeking){const delta=v.currentTime-before;if(delta>0&&delta<=3)playedSinceSave.current+=delta;}
   last.current={position:v.currentTime,duration:v.duration};setPosition(v.currentTime);setDuration(v.duration);
   if(Date.now()-lastSaved.current>=5000){lastSaved.current=Date.now();persist();}
  };
  const waiting=()=>{
   if(!valid()||v.paused)return;
   setStatus('Buffering…');
   if(started.current&&stall.current===undefined)stall.current=window.setTimeout(()=>{stall.current=undefined;if(valid()&&!v.paused&&v.readyState<3)fallback(id,'Playback stalled.');else if(valid()&&!v.paused)setStatus('Playing');},20000);
  };
  const ended=()=>{if(!valid())return;cancelTimers();if(Number.isFinite(v.duration)){last.current={position:v.duration,duration:v.duration};setPosition(v.duration);persist(true);}setPaused(true);setEndedPlayback(true);setStatus('Playback finished.');};
  const error=()=>{if(valid())fallback(id,'Media playback error '+(v.error?.code||'unknown')+'.');};
  const seeked=()=>{if(valid()){pendingSeek.current=null;lastTick.current=null;const snapshot=mediaSnapshot(v.currentTime,v.duration);if(started.current&&snapshot){last.current=snapshot;setPosition(snapshot.position);}}};
  const listeners:[string,()=>void][]=[['seeked',seeked],['loadedmetadata',metadata],['playing',playing],['pause',pausedEvent],['timeupdate',tick],['waiting',waiting],['stalled',waiting],['ended',ended],['error',error]];
  listeners.forEach(([event,fn])=>v.addEventListener(event,fn));
  v.audioTracks?.addEventListener?.('change',refreshAudio);v.audioTracks?.addEventListener?.('addtrack',refreshAudio);
  v.textTracks.addEventListener?.('addtrack',refreshEmbedded);v.textTracks.addEventListener?.('removetrack',refreshEmbedded);
  startClock();v.src=activeSources.current[attempt.index].url;v.load();play();
  return()=>{alive=false;if(frameHandle!==undefined)frameVideo.cancelVideoFrameCallback?.(frameHandle);cancelTimers();listeners.forEach(([event,fn])=>v.removeEventListener(event,fn));v.audioTracks?.removeEventListener?.('change',refreshAudio);v.audioTracks?.removeEventListener?.('addtrack',refreshAudio);v.textTracks.removeEventListener?.('addtrack',refreshEmbedded);v.textTracks.removeEventListener?.('removetrack',refreshEmbedded);v.pause();v.removeAttribute('src');v.load();};
 },[attempt?.serial]);
 useEffect(()=>{const flush=()=>persist(true);const hidden=()=>{if(document.visibilityState==='hidden')persist();};window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden);persist(true);};},[]);
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
    const bytes=await boundedBody(r,2*1024*1024);
    if(c.signal.aborted)return;
    if(bytes.length>2*1024*1024){if(active)setSubtitleStatus('Subtitle file is too large.');return;}
    try{
     const parsed=parseCues(decodeSubtitle(bytes));
     if(active&&!c.signal.aborted){setCues(parsed);setSubtitleStatus(parsed.length+' subtitle cues loaded.');}
    }catch{if(active)setSubtitleStatus('Unsupported or empty subtitle file. Try another SRT/WebVTT track.');}
   }catch(e){if(active&&!c.signal.aborted)setSubtitleStatus(e instanceof Error&&e.message==='Response too large'?'Subtitle file is too large.':'Subtitle download failed (network or CORS). Try another track.');}
   finally{window.clearTimeout(timeout);}
  })();
  return()=>{active=false;c.abort();window.clearTimeout(timeout);};
 },[subtitle,attempt?.serial]);
 useEffect(()=>{
  const v=video.current;if(!v||!cues.length){setCaption('');return;}
  const update=()=>setCaption(activeSubtitle(cues,captionTime(v.currentTime,prefs.delay)));
  update();const timer=window.setInterval(update,150);
  v.addEventListener('timeupdate',update);v.addEventListener('seeked',update);
  return()=>{window.clearInterval(timer);v.removeEventListener('timeupdate',update);v.removeEventListener('seeked',update);};
 },[cues,attempt?.serial,prefs.delay]);
 useEffect(()=>{
  const v=video.current;if(!v)return;
  for(let i=0;i<v.textTracks.length;i++){const t=v.textTracks[i];if(t.kind==='subtitles'||t.kind==='captions')t.mode=embeddedChoice===i?'showing':'disabled';}
 },[embeddedChoice,embedded,attempt?.serial]);
 const toggle=()=>{
  const v=video.current;if(!v||!attempt)return;
  if(!v.paused){v.pause();return;}
  if(v.ended&&finished.current){resetReplay();setPosition(0);}
  setStatus('Starting…');
  if(!started.current){cancelTimers();clock.current=window.setTimeout(()=>fallback(attempt.serial,'Source did not start in time.'),25000);}
  v.play()?.catch(error=>{if(current.current?.serial!==attempt.serial||failed.current||error?.name==='AbortError')return;if(error?.name==='NotAllowedError'){cancelTimers();setStatus('Playback blocked by this device. Press Play again.');}else fallback(attempt.serial,'Could not play this source.');});
 };
 const seek=(delta:number)=>{const v=video.current;if(v&&Number.isFinite(v.duration)&&v.duration>0){lastTick.current=null;const target=seekPosition(v.currentTime,v.duration,delta);try{if(!withinSeekRange(v.seekable,target))throw Error('Not seekable');pendingSeek.current=target;seekDeadline.current=Date.now()+10000;v.currentTime=target;setPosition(target);}catch{pendingSeek.current=null;setStatus('Seeking is not available for this source.');}}};
 const tracks=uniqueSubtitles((source?.subtitles||[]).concat(addonSubs));
 const trackSignature=JSON.stringify(tracks.map(t=>[t.url,t.lang,t.label,t.provider]));
 useEffect(()=>{
  if(!attempt||subtitleChosen.current||subtitleLoading)return;
  const wanted=choices.current.subtitle;
  if(wanted==='off'||!wanted&&prefs.subtitleLanguage==='off')return;
  const choice=wanted||{lang:prefs.subtitleLanguage};
  const combined=[...tracks.map(t=>({lang:t.lang,label:t.label,provider:t.provider,key:trackFingerprint(t.id||t.url)})),...embedded.map(t=>({lang:t.lang,label:t.label,provider:'embedded'}))];
  const index=matchTrack(combined,choice);
  if(index<0)return;
  subtitleChosen.current=true;
  if(index<tracks.length){setEmbeddedChoice(null);setSubtitle(tracks[index]);}
  else{setSubtitle(null);setEmbeddedChoice(embedded[index-tracks.length].index);}
 },[attempt?.serial,trackSignature,embedded,subtitleLoading,prefs.subtitleLanguage]);
 const rememberSubtitle=(choice:typeof choices.current.subtitle)=>{
  subtitleChosen.current=true;choices.current={...choices.current,subtitle:choice};saveChoices(account,titleChoiceKey,choices.current);
 };
 const selectAudio=(index:number)=>{
  const list=video.current?.audioTracks;if(!list)return;
  try{selectedAudioAttempt.current=attempt?.serial??-1;for(let i=0;i<list.length;i++)list[i].enabled=i===index;
  choices.current={...choices.current,audio:{lang:list[index].language||'',label:list[index].label||'',provider:''}};saveChoices(account,titleChoiceKey,choices.current);setAudio(previous=>previous.map(a=>({...a,enabled:a.index===index})));}catch{setStatus('Audio track selection is not supported by this device.');}
 };
 const retry=()=>{clearScrub();persist();cancelTimers();setRevision(x=>x+1);};
 const closePanel=()=>{const target=panel==='sources'?'player-sources':panel==='subtitles'?'player-subs':panel==='settings'?'player-settings':'player-audio';setPanel(null);requestAnimationFrame(()=>{const el=document.getElementById(target) as HTMLButtonElement|null;(el&&!el.disabled?el:document.getElementById('player-back'))?.focus();});};
 const exit=()=>{clearScrub();prefetchController.current?.abort();persist(true);onExit();};
 // A public metadata query only includes IMDb title and episode identifiers. No account or stream URLs.
 const intro=introQuery(title,intent),introId=intro?intro.imdbId+':'+intro.season+':'+intro.episode:'';
 useEffect(()=>{
  setRemoteSegments([]);if(!intro)return;
  const c=new AbortController();
  jsonRequest('https://api.introdb.app/segments?imdb_id='+encodeURIComponent(intro.imdbId)+'&season='+intro.season+'&episode='+intro.episode,{},c.signal)
   .then(raw=>{if(!c.signal.aborted)setRemoteSegments(parseSegments(raw));}).catch(()=>{});
  return()=>c.abort();
 },[introId]);
 // Native chapter lists may arrive after loadedmetadata. Poll infrequently; no second media decoder.
 useEffect(()=>{
  if(!attempt)return;
  const update=()=>{const v=video.current;if(v){const markers=chapterSegments(nativeChapters(v),v.duration);setChapterMarkers(old=>JSON.stringify(old)===JSON.stringify(markers)?old:markers);}};
  update();const timer=window.setInterval(update,1500);return()=>window.clearInterval(timer);
 },[attempt?.serial]);
 const creditsTarget=creditsSkipTarget(duration,position,remoteSegments,chapterMarkers);
 const trigger=triggerAt(duration,remoteSegments,chapterMarkers,prefs.creditsFallback);
 const hasNext=!!nextIntent&&intent.type==='series';
 const playbackReady=!!attempt&&started.current&&!failed.current;
 const inCredits=hasNext&&playbackReady&&trigger!==null&&position>=trigger;
 const shouldPrepare=hasNext&&playbackReady&&!upNextDismissed&&prefs.autoplay&&trigger!==null&&position>=Math.max(0,trigger-PREPARE_SECONDS);
 useEffect(()=>{
  if(!shouldPrepare||!nextIntent){preparedNext.current=undefined;return;}
  if(preparedFresh(preparedNext.current,account,nextIntent))return;
  const c=new AbortController();prefetchController.current=c;
  const target=nextIntent;
  resolveEpisodeSources(addons,lenders,target,c.signal).then(result=>{
   if(!c.signal.aborted&&result.sources.length)preparedNext.current={namespace:account,titleId:target.titleId,videoId:target.videoId,type:target.type,at:Date.now(),result};
  }).catch(()=>{}).finally(()=>{if(prefetchController.current===c)prefetchController.current=null;});
  return()=>{c.abort();if(prefetchController.current===c)prefetchController.current=null;};
 },[shouldPrepare,nextIntent?.videoId,account,addons,lenders]);
 const dismissUpNext=()=>{
  setUpNextDismissed(true);setCountdown(null);prefetchController.current?.abort();preparedNext.current=undefined;
  setControlsShown(true);setActivity(x=>x+1);requestAnimationFrame(()=>document.getElementById('player-toggle')?.focus());
 };
 const advance=(origin:'manual'|'autoplay',confirmed=false)=>{
  const target=confirmed?stillTarget.current:nextIntent;
  if(advanced.current||!target||(!confirmed&&!inCredits&&!endedPlayback)||stillActive.current&&!confirmed)return;
  if(origin==='autoplay'&&!confirmed&&shouldAsk(viewingSession.current)){
   stillActive.current=true;stillTarget.current=target;setStillPrompt(true);setCountdown(null);clearScrub();setPanel(null);
   video.current?.pause();setControlsShown(false);return;
  }
  advanced.current=true;stillActive.current=false;setStillPrompt(false);clearScrub();cancelTimers();prefetchController.current?.abort();
  const v=video.current;if(v&&Number.isFinite(v.duration)&&v.duration>0)last.current={position:v.currentTime,duration:v.duration};
  // A deliberate transition at validated credits counts as completion even before 90%.
  persist(true,true);v?.pause();
  const ready=preparedFresh(preparedNext.current,account,target)?preparedNext.current:undefined;
  viewingSession.current=forAdvance(viewingSession.current,origin);
  latestAdvance.current(target,ready,origin);
 };
 const stopWatching=()=>{if(!stillActive.current)return;stillActive.current=false;advanced.current=true;persist(true,true);prefetchController.current?.abort();viewingSession.current=newSession(account);onExit();};
 const confirmNext=(suppress:boolean)=>{if(!stillActive.current)return;viewingSession.current=confirmWatching(viewingSession.current,suppress);advance('autoplay',true);};
 const showNext=!stillPrompt&&hasNext&&!upNextDismissed&&(inCredits||endedPlayback&&duration>=120)&&!panel&&preview===null;
 const canCountdown=showNext&&prefs.autoplay;
 useEffect(()=>{const visible=()=>setPageVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',visible);return()=>document.removeEventListener('visibilitychange',visible);},[]);
 useEffect(()=>{
  if(!canCountdown){remaining.current=COUNTDOWN_SECONDS;setCountdown(null);return;}
  remaining.current=COUNTDOWN_SECONDS;setCountdown(COUNTDOWN_SECONDS);
  const v=video.current;if(!v)return;
  let previous=v.currentTime;
  const timer=window.setInterval(()=>{
   const now=v.currentTime;
   remaining.current=countdownTick(remaining.current,previous,now,!v.paused&&!v.seeking&&!v.ended&&v.readyState>=3&&document.visibilityState!=='hidden');
   previous=now;
   setCountdown(Math.ceil(remaining.current));
  },250);
  return()=>window.clearInterval(timer);
 },[canCountdown,nextIntent?.videoId,attempt?.serial]);
 useEffect(()=>{
  if(canCountdown&&pageVisible&&(remaining.current<=0||endedPlayback))advance('autoplay');
 },[canCountdown,countdown,endedPlayback,nextIntent?.videoId,pageVisible]);
 useEffect(()=>{
  if(stillPrompt){requestAnimationFrame(()=>document.getElementById('still-continue')?.focus());return;}
  if(showNext){requestAnimationFrame(()=>document.getElementById('up-next-play')?.focus());}
 },[showNext,stillPrompt]);
 const candidate=skipSegment(position,duration,remoteSegments,chapterMarkers,dismissedSegments);
 const showSkip=!stillPrompt&&playbackReady&&!!candidate&&!showNext&&!panel&&preview===null&&!endedPlayback;
 useEffect(()=>{
  if(!showSkip||!candidate)return;
  const id=segmentKey(candidate),timer=window.setTimeout(()=>{setDismissedSegments(old=>old.concat(id));if(document.activeElement?.id==='skip-intro')requestAnimationFrame(()=>document.getElementById(controlsShown?'player-toggle':'player-reveal')?.focus());},10000);
  return()=>window.clearTimeout(timer);
 },[showSkip,candidate?segmentKey(candidate):'']);
 useEffect(()=>{if(showSkip&&!controlsShown)requestAnimationFrame(()=>document.getElementById('skip-intro')?.focus());},[showSkip,controlsShown]);
 const skipCurrent=()=>{
  const v=video.current;if(!v||!candidate)return;
  try{
   const target=candidate.end;
   if(!withinSeekRange(v.seekable,target))throw Error('Not seekable');
   lastTick.current=null;pendingSeek.current=target;seekDeadline.current=Date.now()+10000;v.currentTime=target;setPosition(target);
   setDismissedSegments(old=>old.concat(segmentKey(candidate)));requestAnimationFrame(()=>document.getElementById(controlsShown?'player-toggle':'player-reveal')?.focus());
  }catch{pendingSeek.current=null;setStatus('This source does not allow skipping here.');}
 };
 const skipFinalCredits=()=>{
  const v=video.current;if(!v||creditsTarget===null)return;
  try{const target=creditsTarget;if(!withinSeekRange(v.seekable,target))throw Error('Not seekable');lastTick.current=null;pendingSeek.current=target;seekDeadline.current=Date.now()+10000;v.currentTime=target;setPosition(target);requestAnimationFrame(()=>document.getElementById(controlsShown?'player-toggle':'player-reveal')?.focus());}catch{pendingSeek.current=null;setStatus('This source does not allow skipping credits.');}
 };
 function clearScrub(){if(scrubTimer.current!==undefined)window.clearTimeout(scrubTimer.current);scrubTimer.current=undefined;scrubValue.current=null;repeatCount.current=0;setPreview(null);}
 function commitScrub(){
  const value=scrubValue.current,v=video.current;clearScrub();
  if(value===null||!v||!Number.isFinite(v.duration)||v.duration<=0)return;
  pendingSeek.current=null;lastTick.current=null;
  try{const target=scrubTarget(value,v.duration,0);if(!withinSeekRange(v.seekable,target))throw Error('Not seekable');pendingSeek.current=target;seekDeadline.current=Date.now()+10000;v.currentTime=target;setPosition(target);}catch{pendingSeek.current=null;setStatus('Seeking is not available for this part of the source.');}
 }
 function queueScrub(value:number){
  scrubValue.current=value;setPreview(value);setActivity(x=>x+1);
  if(scrubTimer.current!==undefined)window.clearTimeout(scrubTimer.current);
  scrubTimer.current=window.setTimeout(commitScrub,600);
 }
 const reveal=()=>{setControlsShown(true);setActivity(x=>x+1);requestAnimationFrame(()=>document.getElementById('player-toggle')?.focus());};
 const openPanel=(next:NonNullable<typeof panel>)=>{if(panel===next){closePanel();return;}setControlsShown(true);setPanel(next);requestAnimationFrame(()=>document.getElementById('player-close-panel')?.focus());};
 useEffect(()=>{if(showNext||stillPrompt){setControlsShown(false);return;}if(!shouldAutoHide(prefs.autoHide,paused,panel,preview,attempt,status)){setControlsShown(true);return;}
  if(!controlsShown)return;
  const timer=window.setTimeout(()=>{setControlsShown(false);requestAnimationFrame(()=>(document.getElementById('skip-intro')||document.getElementById('skip-credits')||document.getElementById('player-reveal'))?.focus());},5000);
  return()=>window.clearTimeout(timer);
 },[prefs.autoHide,paused,panel,preview,attempt?.serial,status,activity,controlsShown,showNext,stillPrompt]);
 useEffect(()=>()=>{if(scrubTimer.current!==undefined)window.clearTimeout(scrubTimer.current);},[]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   const dir=directionFor(e.key,e.keyCode),ok=e.key==='Enter'||e.keyCode===13;
   if(stillActive.current){
    if(isBack(e.key,e.keyCode)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)stopWatching();return;}
    if(dir){e.preventDefault();e.stopImmediatePropagation();const ids=['still-continue','still-suppress','still-stop'];const at=ids.indexOf(document.activeElement?.id||'');document.getElementById(ids[Math.max(0,Math.min(ids.length-1,at+(dir==='up'||dir==='left'?-1:1)))])?.focus();return;}
    if(ok&&document.activeElement?.closest('.still-watching')&&!e.repeat)return;
    e.preventDefault();e.stopImmediatePropagation();return;
   }
   if(!panel&&!showNext&&!e.repeat&&e.code==='Space'&&!['BUTTON','INPUT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName||'')){e.preventDefault();e.stopImmediatePropagation();deliberate();setControlsShown(true);setActivity(x=>x+1);toggle();return;}
   if(e.isTrusted&&!e.repeat&&(dir||ok||isBack(e.key,e.keyCode)||[179,415,19,417,412].includes(e.keyCode)||['MediaPlayPause','MediaPlay','MediaPause','MediaFastForward','MediaRewind'].includes(e.key)))deliberate();
   if(isBack(e.key,e.keyCode)&&showNext){e.preventDefault();e.stopImmediatePropagation();dismissUpNext();return;}
   if(showNext&&(dir||ok)&&!document.activeElement?.closest('.player-upnext')){e.preventDefault();e.stopImmediatePropagation();document.getElementById('up-next-play')?.focus();return;}
   if(showNext&&dir){e.preventDefault();e.stopImmediatePropagation();const id=document.activeElement?.id==='up-next-play'?'up-next-dismiss':'up-next-play';document.getElementById(id)?.focus();return;}
   if(showNext&&ok){if(e.repeat){e.preventDefault();e.stopImmediatePropagation();}return;}
   if(ok&&(document.activeElement?.id==='skip-intro'||document.activeElement?.id==='skip-credits'))return;
   if(isBack(e.key,e.keyCode)&&panel){e.preventDefault();e.stopImmediatePropagation();closePanel();return;}
   if(panel&&dir){const items=Array.from(document.querySelectorAll<HTMLElement>('.player-panel [data-focus]:not([disabled])'));if(!items.includes(document.activeElement as HTMLElement)){e.preventDefault();e.stopImmediatePropagation();items[0]?.focus();return;}}
   if(revealKey.current&&e.repeat){e.preventDefault();e.stopImmediatePropagation();return;}
   if(e.key==='MediaPlayPause'||e.keyCode===179||e.key==='MediaPlay'||e.keyCode===415||e.key==='MediaPause'||e.keyCode===19){
    e.preventDefault();e.stopImmediatePropagation();setControlsShown(true);setActivity(x=>x+1);
    if(!e.repeat){const v=video.current;if(e.key==='MediaPause'||e.keyCode===19){v?.pause();}else if(e.key==='MediaPlay'||e.keyCode===415){if(v?.paused)toggle();}else toggle();}return;
   }
   if(e.key==='MediaFastForward'||e.keyCode===417||e.key==='MediaRewind'||e.keyCode===412){
    e.preventDefault();e.stopImmediatePropagation();setControlsShown(true);setActivity(x=>x+1);seek(e.key==='MediaRewind'||e.keyCode===412?-10:10);return;
   }
   if(!controlsShown&&(dir||ok)){e.preventDefault();e.stopImmediatePropagation();revealKey.current=true;reveal();return;}
   if(dir||ok)setActivity(x=>x+1);
   if(document.activeElement?.id==='player-timeline'&&(dir==='left'||dir==='right'||ok)){
    e.preventDefault();e.stopImmediatePropagation();
    if(ok){commitScrub();return;}
    const v=video.current;if(!v||!Number.isFinite(v.duration)||v.duration<=0)return;
    repeatCount.current=e.repeat?repeatCount.current+1:0;
    queueScrub(scrubTarget(scrubValue.current??v.currentTime,v.duration,(dir==='left'?-1:1)*scrubStep(repeatCount.current)));
   }
  };
  const release=()=>{revealKey.current=false;repeatCount.current=0;};
  document.addEventListener('keydown',handler,true);document.addEventListener('keyup',release,true);
  return()=>{document.removeEventListener('keydown',handler,true);document.removeEventListener('keyup',release,true);};
 },[panel,controlsShown,attempt?.serial,showNext,stillPrompt]);
 useEffect(()=>{
  if(!attempt||preview===null)return;
  const v=video.current;if(!v)return;
  const update=()=>{const frames=readThumbnails(v);setThumbnailFrames(old=>JSON.stringify(old)===JSON.stringify(frames)?old:frames);};
  update();const timer=window.setInterval(update,1000);return()=>window.clearInterval(timer);
 },[attempt?.serial,preview!==null]);
 const shownPosition=preview??position;
 const scrubFrame=preview===null?null:thumbnailAt(thumbnailFrames,preview);
 return <main className="player-page" onPointerMove={()=>{if(showNext||stillActive.current)return;if(!controlsShown)reveal();else if(Date.now()-pointerActivity.current>500){pointerActivity.current=Date.now();setActivity(x=>x+1);}}} onPointerDown={e=>{if(e.isTrusted)deliberate();setActivity(x=>x+1);}} onClickCapture={e=>{if(e.isTrusted)deliberate();}}>
  <div className="player-video">{attempt&&source?<video key={attempt.serial} ref={video} playsInline preload="auto" style={{objectFit:objectFit(prefs.fit)}}/>:<div className="player-empty"><h1>{intent.name}</h1><p>{status}</p></div>}</div>
  {caption&&!panel&&<div className="player-caption" aria-hidden="true" style={{bottom:controlsShown?'25vh':'6vh',fontSize:(2.2*prefs.size/100)+'vw',color:colors[prefs.color]}}><span style={{background:prefs.background?'rgba(0,0,0,.7)':'transparent'}}>{caption}</span></div>}
  {!controlsShown&&!stillPrompt&&!showNext&&<button id="player-reveal" data-focus type="button" className="player-reveal" aria-label="Show playback controls" onClick={reveal}/>}
  <section className="player-controls" style={{display:controlsShown&&!stillPrompt?undefined:'none'}}><div className="player-top"><h2>{intent.name}</h2><p aria-live="polite">{status}{source?' · '+source.provider:''}</p></div>
   <div className="player-progress">{preview!==null&&<ScrubThumbnail frame={scrubFrame} label={time(preview)} percent={duration>0?100*preview/duration:0}/>}<span>{time(shownPosition)}</span><button type="button" data-focus id="player-timeline" className="progress-rail" role="slider" aria-label="Playback timeline" aria-valuemin={0} aria-valuemax={Math.max(0,Math.floor(duration))} aria-valuenow={Math.max(0,Math.floor(shownPosition))} aria-valuetext={time(shownPosition)} disabled={!attempt||duration<=0} onClick={e=>{if(e.detail===0)return;const r=e.currentTarget.getBoundingClientRect();queueScrub(scrubTarget((e.clientX-r.left)/Math.max(1,r.width)*duration,duration,0));commitScrub();}}><span style={{width:(duration>0?Math.max(0,Math.min(100,100*shownPosition/duration)):0)+'%'}}/></button><span>{time(duration)}</span></div>
   <div className="controls">{button('player-back','‹ Back',exit)}{button('player-rewind','−10 sec',()=>seek(-10),!attempt)}{button('player-toggle',paused?'▶ Play':'Ⅱ Pause',toggle,!attempt)}{button('player-forward','+10 sec',()=>seek(10),!attempt)}{button('player-sources','Sources ('+sources.length+')',()=>openPanel('sources'))}{button('player-subs','Subtitles',()=>openPanel('subtitles'),!attempt)}{button('player-audio','Audio',()=>openPanel('audio'),!attempt)}{button('player-settings','Settings',()=>openPanel('settings'))}{button('player-fullscreen','Fullscreen',()=>{if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});else void document.querySelector('.player-page')?.requestFullscreen().catch(()=>{});})}{button('player-no-audio','No audio · Next source',()=>{if(attempt){const next=activeSources.current.findIndex((_,i)=>i!==attempt.index&&!attempted.current.has(i));if(next>=0)begin(next);else openPanel('sources');}},!attempt)}{button('player-retry','Retry sources',retry)}</div>
  </section>
  {showSkip&&candidate&&<button type="button" data-focus id="skip-intro" className={'player-skip'+(controlsShown?' with-controls':'')} onClick={skipCurrent}>{candidate.kind==='recap'?'Skip recap':'Skip intro'}</button>}
  {!stillPrompt&&playbackReady&&!hasNext&&!showNext&&!showSkip&&!panel&&creditsTarget!==null&&!endedPlayback&&<button type="button" data-focus id="skip-credits" className={'player-skip'+(controlsShown?' with-controls':'')} onClick={skipFinalCredits}>Skip credits</button>}
  {showNext&&nextEpisode&&<section className={'player-upnext'+(controlsShown?' with-controls':'')} role="region" aria-label="Next episode"><p className="eyebrow">UP NEXT</p><h2>{nextEpisode.name}</h2><p>{nextEpisode.season!==null?'S'+nextEpisode.season+' ':''}{nextEpisode.number!==null?'E'+nextEpisode.number:''}</p>{prefs.autoplay&&<p aria-live="polite">Playing next in {countdown??COUNTDOWN_SECONDS}s</p>}<div className="controls">{button('up-next-play','▶ Play next',()=>advance('manual'))}{button('up-next-dismiss',endedPlayback?'Stay here':'Watch credits',dismissUpNext)}</div></section>}
  {stillPrompt&&<section className="still-watching" role="dialog" aria-modal="true" aria-label="Are you still watching?"><div className="still-watching-content"><h1>Are you still watching?</h1><p>Three episodes have started automatically without any interaction.</p><p>{nextEpisode?'Next: '+nextEpisode.name:'Your next episode is ready when you are.'}</p><div className="still-actions">{button('still-continue','Keep watching',()=>confirmNext(false))}{button('still-suppress','Keep watching · Don’t ask again this session',()=>confirmNext(true))}{button('still-stop','Stop watching',stopWatching)}</div></div></section>}
  {panel&&!stillPrompt&&<section className="player-panel"><div className="player-panel-header"><h2>{panel==='sources'?'Sources':panel==='audio'?'Audio tracks':panel==='settings'?'Playback settings':'Subtitles'}</h2>{button('player-close-panel','Close',closePanel)}</div>
   {panel==='settings'?<><PlayerPreferences prefs={prefs} onChange={onPrefs} inPlayer/>{button('player-reset-track-choices','Forget remembered tracks for this title',()=>{choices.current={};saveChoices(account,titleChoiceKey,{});setSubtitleStatus('Remembered tracks cleared. Defaults apply on next source.');setStatus('Remembered tracks cleared; defaults apply on next source.');})}</>:panel==='sources'?<><p className="muted">Direct HTTP(S) sources only. Automatic playback tries up to three candidates.</p>{intent.type==='series'&&<div className="controls"><p className="muted">{preferredProvider?'Preferred series provider: '+(sources.find(s=>s.providerId===preferredProvider)?.provider||'currently unavailable'):'Choose a source manually to remember its provider for this series.'}</p>{preferredProvider&&button('forget-provider','Forget preferred provider',()=>{forgetProvider(account,intent.titleId);preferred.current=null;setPreferredProvider(null);})}</div>}{resolution&&<p className="muted">{resolution.providers} providers · {resolution.failures} failed · {resolution.excluded.torrent} torrent · {resolution.excluded.headers} header-dependent · {resolution.excluded.external} external · {resolution.excluded.other} other excluded</p>}
    <div className="player-list">{sources.map((s,i)=><button key={i} id={'source-'+i} data-focus type="button" className={attempt?.index===i?'filter-active':''} onClick={()=>begin(i,true,true)}><strong>{s.name}{preferredProvider===s.providerId?' · Preferred':''}</strong><small>{s.provider}{s.height?' · '+s.height+'p':''}{s.hevc?' · HEVC':''}{s.hdr?' · HDR/DV':''}{s.audioCodec&&s.audioCodec!=='unknown'?' · '+s.audioCodec.toUpperCase()+' (label)':''}{s.riskyAudio?' · audio compatibility uncertain':''}</small><small>{s.description}</small></button>)}</div>{!sources.length&&<p>No compatible direct sources to display.</p>}</>:panel==='audio'?<>{audio.length?audio.map(a=><button key={a.index} id={'audio-'+a.index} data-focus type="button" className={a.enabled?'filter-active':''} onClick={()=>selectAudio(a.index)}>{a.name}</button>):<p>This device does not expose selectable native audio tracks.</p>}</>:<><div className="player-list">{button('subtitle-off','Off',()=>{rememberSubtitle('off');setSubtitle(null);setCues([]);setCaption('');setEmbeddedChoice(null);setSubtitleStatus('Subtitles off.');})}{embedded.map(t=><button key={'embedded-'+t.index} id={'embedded-'+t.index} data-focus type="button" className={embeddedChoice===t.index?'filter-active':''} onClick={()=>{rememberSubtitle({lang:t.lang,label:t.label,provider:'embedded'});setSubtitle(null);setCues([]);setCaption('');setEmbeddedChoice(t.index);setSubtitleStatus('Native embedded subtitle selected.');}}>{t.label} · Embedded</button>)}{tracks.map((t,i)=><button key={i} id={'subtitle-'+i} data-focus type="button" className={subtitle?.url===t.url?'filter-active':''} onClick={()=>{rememberSubtitle({lang:t.lang,label:t.label,provider:t.provider,key:trackFingerprint(t.id||t.url)});setEmbeddedChoice(null);setCues([]);setCaption('');setSubtitle(previous=>previous?.url===t.url?{...t}:t);}}>{t.label} · {t.provider}</button>)}</div><p aria-live="polite">{subtitleStatus||(subtitleLoading?'Finding subtitles for this source…':!tracks.length&&!embedded.length?'No subtitle tracks available.':'External SRT/WebVTT rendered by Tarn. Embedded tracks depend on the device.')}</p></>}
  </section>}
 </main>;
}
