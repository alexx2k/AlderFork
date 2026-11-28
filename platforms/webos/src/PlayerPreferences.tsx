import React from 'react';
import {Prefs,colors} from './playerPrefs.mjs';
const languages=[['auto','Automatic'],['en','English'],['es','Spanish'],['fr','French'],['de','German'],['it','Italian'],['pt','Portuguese'],['ja','Japanese'],['ko','Korean'],['zh','Chinese'],['ru','Russian'],['ar','Arabic'],['hi','Hindi'],['pl','Polish'],['nl','Dutch'],['tr','Turkish']];
export function PlayerPreferences({prefs,onChange,inPlayer=false}:{prefs:Prefs;onChange:(patch:Partial<Prefs>)=>void;inPlayer?:boolean}){
 const row=(name:string,label:string,options:[string|number|boolean,string][],current:string|number|boolean,change:(v:any)=>void)=><div className="pref-row"><h3>{label}</h3><div className="filter-strip">{options.map(([v,t],i)=><button key={String(v)} id={'pref-'+name+'-'+i} data-focus type="button" className={v===current?'filter-active':''} aria-pressed={v===current} onClick={()=>change(v)}>{t}</button>)}</div></div>;
 return <section className="player-preferences">
 {row('hide','Hide controls after 5 seconds',[[true,'On'],[false,'Off']],prefs.autoHide,v=>onChange({autoHide:v}))}
 {row('quality','Preferred maximum quality',[[0,'Auto'],[480,'480p'],[720,'720p'],[1080,'1080p'],[2160,'4K']],prefs.quality,v=>onChange({quality:v}))}
 {row('compat','Audio compatibility',[['auto','Automatic'],['compatible','Prefer AAC / MP3']],prefs.audioMode,v=>onChange({audioMode:v}))}
 <p className="muted">Quality and audio compatibility affect the next source resolution. Resuming a saved source still takes priority.</p>
 {row('audio','Preferred audio language',languages as [string,string][],prefs.audioLanguage,v=>onChange({audioLanguage:v}))}
 {row('subs','Preferred subtitle language',[['off','Off'],...languages.slice(1)] as [string,string][],prefs.subtitleLanguage,v=>onChange({subtitleLanguage:v}))}
 {inPlayer&&<p className="muted">Explicit audio/subtitle selections for this title take precedence over these defaults. Language changes apply on the next source.</p>}
 {row('size','Subtitle size',[[80,'Small'],[100,'Medium'],[130,'Large'],[160,'Extra large']],prefs.size,v=>onChange({size:v}))}
 {row('color','Subtitle colour',Object.keys(colors).map(c=>[c,c.replace('_',' ')]),prefs.color,v=>onChange({color:v}))}
 {row('background','Subtitle background',[[true,'On'],[false,'Off']],prefs.background,v=>onChange({background:v}))}
 <h3>Subtitle timing: {prefs.delay>0?'+':''}{prefs.delay.toFixed(2)} s</h3><div className="controls">{[['Earlier',-.25],['Later',.25],['Reset',0]].map(([label,delta],i)=><button type="button" data-focus key={i} id={'pref-delay-'+i} onClick={()=>onChange({delay:delta===0?0:Math.max(-10,Math.min(10,prefs.delay+Number(delta)))})}>{label}</button>)}</div>
 <p className="muted">Appearance and timing apply to Tarn-rendered external subtitles. Native embedded tracks depend on the TV.</p>
 {row('fit','Picture fit',[['fit','Fit'],['zoom','Zoom'],['stretch','Stretch']],prefs.fit,v=>onChange({fit:v}))}
 </section>;
}
