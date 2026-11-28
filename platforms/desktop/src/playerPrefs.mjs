export const colors={white:'#ffffff',gray:'#cccccc',yellow:'#ffff00',cyan:'#00ffff',cream:'#fff2cc',warm_white:'#fff8e7'};
export const defaults={autoHide:true,autoplay:true,creditsFallback:5,quality:0,releaseType:'auto',hdrPreference:'auto',audioFallback:'off',audioMode:'auto',audioLanguage:'auto',subtitleLanguage:'off',size:100,color:'white',background:true,delay:0,fit:'fit'};
const options=(value,values,fallback)=>values.includes(value)?value:fallback;
const lang=value=>typeof value==='string'&&/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(value)?value.toLowerCase():'';
export function language(value){
 const raw=lang(value),base=raw.split('-')[0];
 return ({eng:'en',spa:'es',fre:'fr',fra:'fr',ger:'de',deu:'de',ita:'it',por:'pt',jpn:'ja',kor:'ko',chi:'zh',zho:'zh',rus:'ru',ara:'ar',hin:'hi',pol:'pl',dut:'nl',nld:'nl',tur:'tr',und:''})[base]??base;
}
export function cleanPrefs(raw){
 const p=raw&&typeof raw==='object'?raw:{};
 return {autoHide:typeof p.autoHide==='boolean'?p.autoHide:true,autoplay:typeof p.autoplay==='boolean'?p.autoplay:true,creditsFallback:options(p.creditsFallback,[5,10,15,20,30],5),quality:options(p.quality,[0,480,720,1080,2160],0),releaseType:options(p.releaseType,['auto','remux','encode','web'],'auto'),hdrPreference:options(p.hdrPreference,['auto','sdr','hdr10','dv'],'auto'),audioFallback:p.audioFallback==='off'?'off':language(p.audioFallback)||'off',audioMode:options(p.audioMode,['auto','compatible'], 'auto'),audioLanguage:language(p.audioLanguage)||'auto',subtitleLanguage:p.subtitleLanguage==='off'?'off':language(p.subtitleLanguage)||'off',size:options(p.size,[80,100,130,160],100),color:options(p.color,Object.keys(colors),'white'),background:typeof p.background==='boolean'?p.background:true,delay:typeof p.delay==='number'&&Number.isFinite(p.delay)?Math.max(-10,Math.min(10,Math.round(p.delay*4)/4)):0,fit:options(p.fit,['fit','zoom','stretch'],'fit')};
}
export function prefsKey(namespace){return 'tarn.playerprefs.v1:'+encodeURIComponent(namespace);}
export function trackKey(namespace,title){return prefsKey(namespace)+':track:'+encodeURIComponent(title);}
export function cleanChoice(raw){
 const r=raw&&typeof raw==='object'?raw:{},safe=x=>typeof x==='string'?x.slice(0,100):'';
 const track=x=>x&&typeof x==='object'?{lang:language(x.lang),label:safe(x.label),provider:safe(x.provider),key:/^[a-f0-9]{1,8}$/.test(x.key)?x.key:undefined}:undefined;
 return {audio:track(r.audio),subtitle:r.subtitle==='off'?'off':track(r.subtitle)};
}
export function trackFingerprint(value){let hash=2166136261;for(const c of String(value||''))hash=Math.imul(hash^c.charCodeAt(0),16777619);return (hash>>>0).toString(16);}
export function matchTrack(tracks,wanted){
 if(!wanted)return -1;
 const w=language(wanted.lang);
 if(wanted.key){const index=tracks.findIndex(t=>t.key===wanted.key&&(!wanted.provider||t.provider===wanted.provider));if(index>=0)return index;}
 const exact=tracks.findIndex(t=>((w&&language(t.lang)===w)||(!w&&!!wanted.label))&&(!wanted.label||t.label===wanted.label)&&(!wanted.provider||t.provider===wanted.provider));
 if(exact>=0)return exact;
 return w?tracks.findIndex(t=>language(t.lang)===w):-1;
}
export function audioCodec(label){
 const s=String(label||'').toLowerCase();
 if(/\be[ ._-]?ac[ ._-]?3\b|\bddp(?:\b|\d)|dd\+|dolby digital plus/.test(s))return 'eac3';
 if(/true[ ._-]?hd/.test(s))return 'truehd';
 if(/\bdts(?:[ ._-]?hd|[ ._-]?x)?\b/.test(s))return 'dts';
 if(/\bac[ ._-]?3\b|dolby digital|\bdd(?:\b|\d)/.test(s))return 'ac3';
 if(/\b(?:he[ ._-]?)?aac(?:\b|\d)/.test(s))return 'aac';
 if(/\bmp3\b/.test(s))return 'mp3';
 if(/\bopus\b/.test(s))return 'opus';
 return 'unknown';
}
export function audioScore(codec,support,mode){
 const result=support?.[codec];
 if(mode==='compatible'){if(codec==='aac'||codec==='mp3')return result===false?-25:45;if(codec==='unknown')return 0;return result===true?-8:-65;}
 if(codec==='unknown')return 0;
 if(result===true)return 12;
 if(result===false)return -45;
 return ['dts','truehd'].includes(codec)?-25:0;
}
export function qualityScore(height,target,deviceHeight){
 const max=target||deviceHeight;
 if(!height)return -5;
 return height>max?-35-(height-max)/100:height/100;
}
export function scrubTarget(position,duration,delta){
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(position)||!Number.isFinite(delta))return 0;
 return Math.max(0,Math.min(Math.max(0,duration-1),position+delta));
}
export function scrubStep(repeat){return repeat>=30?60:repeat>=10?30:10;}
export function captionTime(time,delay){return time-delay;}
export function objectFit(fit){return fit==='zoom'?'cover':fit==='stretch'?'fill':'contain';}

export function shouldAutoHide(enabled,paused,panel,preview,attempt,status){return enabled&&!paused&&!panel&&preview===null&&!!attempt&&status!=='Buffering…'&&status!=='Starting…';}

export function preferredTrack(tracks,wanted,fallback){const primary=matchTrack(tracks,wanted);return primary>=0?primary:fallback&&fallback!=='off'?matchTrack(tracks,{lang:fallback}):-1;}
