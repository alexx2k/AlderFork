import React,{useEffect,useState,useRef} from 'react';
import {Episode,PlaybackIntent,playbackIntent,seasonsFor,Title} from './liveCatalogue.ts';

import {episodeAired,seasonStats,episodeTarget} from './viewingExperience.mjs';

function SafeImage({url,className}:{url?:string;className:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[url]);
 return url&&!failed?<img className={className} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className={className+' artwork-placeholder'} aria-hidden="true"/>;
}
export function TitleDetails({title,loading,onPlay,inList,onList,isWatched,onWatched,resumeAt,preferredEpisodeId}:{title:Title;loading:boolean;onPlay:(intent:PlaybackIntent,startOver?:boolean)=>void;inList:boolean;onList:()=>void;isWatched:(videoId:string)=>boolean;onWatched:(videoId:string,on:boolean)=>void;resumeAt:(intent:PlaybackIntent)=>number;preferredEpisodeId?:string}){
 const episodes=title.episodes||[];
 const seasons=seasonsFor(episodes);
 const [chosenSeason,setChosenSeason]=useState<number|null|undefined>(undefined);
 const episodesById=new Map(episodes.map(e=>[e.id,e]));
 const resumeCache=new Map<string,number>();
 const resumeEpisode=(id:string)=>{const cached=resumeCache.get(id);if(cached!==undefined)return cached;const e=episodesById.get(id);const intent=e?playbackIntent(title,e):null;const value=intent?resumeAt(intent):0;resumeCache.set(id,value);return value;};
 const target=episodeTarget(episodes,isWatched,resumeEpisode,Date.now(),preferredEpisodeId);
 const stats=seasonStats(episodes,isWatched);
 const season=chosenSeason!==undefined&&seasons.includes(chosenSeason)?chosenSeason:(target?target.season:(seasons.includes(1)?1:seasons[0]));
 const [episodeLimit,setEpisodeLimit]=useState(30);
 const pendingEpisode=useRef<string|null>(null);
 const seasonEpisodes=episodes.filter(e=>e.season===season);
 const prepare=(episode?:Episode,startOver=false)=>{const intent=playbackIntent(title,episode);if(intent)onPlay(intent,startOver);};
 const movieIntent=title.type==='movie'?playbackIntent(title):null;
 const movieResume=movieIntent?resumeAt(movieIntent):0;
 const [episodeOptions,setEpisodeOptions]=useState<Episode|null>(null);
 const focusEpisode=(e:Episode)=>{
  setChosenSeason(e.season);const index=episodes.filter(x=>x.season===e.season).findIndex(x=>x.id===e.id);
  setEpisodeLimit(Math.max(30,Math.ceil((index+1)/30)*30));pendingEpisode.current=e.id;
  requestAnimationFrame(()=>{const node=Array.from(document.querySelectorAll<HTMLElement>('[data-episode-id]')).find(x=>x.dataset.episodeId===e.id);if(node){node.focus();node.scrollIntoView({block:'nearest'});pendingEpisode.current=null;}});
 };
 useEffect(()=>{if(!pendingEpisode.current)return;const node=Array.from(document.querySelectorAll<HTMLElement>('[data-episode-id]')).find(x=>x.dataset.episodeId===pendingEpisode.current);if(node){node.focus();node.scrollIntoView({block:'nearest'});pendingEpisode.current=null;}},[season,episodeLimit,episodes]);
 const selectSeason=(s:number|null)=>{pendingEpisode.current=null;setChosenSeason(s);setEpisodeLimit(30);setEpisodeOptions(null);};
 const seasonIndex=seasons.indexOf(season);
 const closeEpisodeOptions=()=>{const e=episodeOptions;setEpisodeOptions(null);if(e)requestAnimationFrame(()=>Array.from(document.querySelectorAll<HTMLElement>('[data-episode-id]')).find(x=>x.dataset.episodeId===e.id)?.focus());};
 const facts=[title.year,title.genre,title.rating?'Rating '+title.rating:null,title.runtime].filter(Boolean).join(' · ');
 return <section className="title-page">
  <div className="title-hero">
   <SafeImage className="title-backdrop" url={title.background||title.poster}/>
   <div className="title-shade"/>
   <div className="title-copy"><p className="eyebrow">{title.type==='movie'?'MOVIE':'SERIES'}</p><h1>{title.name}</h1>
    {facts&&<p className="title-facts">{facts}</p>}
    <p className="title-description">{title.description||'No description available.'}</p>
    {!!title.cast?.length&&<p className="muted">Cast: {title.cast.join(', ')}</p>}
    {title.type==='movie'?<button type="button" data-focus id="title-play" className="primary" onClick={()=>prepare()}>{movieResume>0?'▶ Resume':'▶ Play'}</button>:<button type="button" data-focus id="title-episodes" className="primary" disabled={!seasonEpisodes.length} onClick={()=>{if(target)focusEpisode(target);else document.getElementById('episode-0')?.focus();}}>Browse episodes</button>}
    <div className="controls">{title.type==='series'&&target&&<button type="button" data-focus id="title-play-next" onClick={()=>prepare(target)}>{resumeEpisode(target.id)>0?'▶ Resume':'▶ Play'} · {target.season!==null?'S'+target.season+' ':''}{target.number!==null?'E'+target.number:target.name}</button>}<button type="button" data-focus id="title-list" onClick={onList}>{inList?'✓ My List · Remove':'+ My List'}</button>{movieResume>0&&<button type="button" data-focus id="title-restart" onClick={()=>prepare(undefined,true)}>Start over</button>}{title.type==='movie'&&<button type="button" data-focus id="title-watched" onClick={()=>onWatched(title.id,!isWatched(title.id))}>{isWatched(title.id)?'✓ Watched · Mark unwatched':'Mark watched'}</button>}</div>
    {loading&&<p aria-live="polite" className="muted">Loading title details…</p>}
   </div>
  </div>
  {title.type==='series'&&<section className="episode-section"><h2>Episodes</h2>
   {seasons.length>0?<><div className="filter-strip" aria-label="Seasons">{seasons.map((s,i)=><button type="button" data-focus id={'season-'+i} key={s===null?'other':s} className={season===s?'filter-active':''} aria-pressed={season===s} onClick={()=>selectSeason(s)}>{s===null?'Other episodes':s===0?'Specials':'Season '+s}{(stats.find(x=>x.season===s)?.total||0)>0&&<span className="season-count">{stats.find(x=>x.season===s)?.unwatched} left</span>}</button>)}</div>
   <div className="controls season-navigation"><button type="button" data-focus id="season-prev" disabled={seasonIndex<=0} onClick={()=>{const next=seasonIndex-1;selectSeason(seasons[next]);requestAnimationFrame(()=>document.getElementById('season-'+next)?.focus());}}>‹ Previous season</button><button type="button" data-focus id="season-first-unwatched" disabled={!seasonEpisodes.some(e=>episodeAired(e)&&!isWatched(e.id))} onClick={()=>{const e=seasonEpisodes.find(e=>episodeAired(e)&&!isWatched(e.id));if(e)focusEpisode(e);}}>First unwatched</button><button type="button" data-focus id="season-next" disabled={seasonIndex>=seasons.length-1} onClick={()=>{const next=seasonIndex+1;selectSeason(seasons[next]);requestAnimationFrame(()=>document.getElementById('season-'+next)?.focus());}}>Next season ›</button></div><div className="episode-list">{seasonEpisodes.slice(0,episodeLimit).map((e,i)=><div className="episode-card" key={e.id}>
    <SafeImage className="episode-thumb" url={e.thumbnail}/><div className="episode-copy"><h3>{e.number!==null?e.number+'. ':''}{e.name}{isWatched(e.id)?<span className="watched-label"> ✓ Watched</span>:!episodeAired(e)?<span className="episode-badge upcoming">Upcoming</span>:<span className="episode-badge">{resumeEpisode(e.id)>0?'In progress':'Unwatched'}</span>}</h3>{e.released&&<p className="muted">{e.released.slice(0,10)}</p>}<p>{e.description||'No episode description available.'}</p></div>
    <button type="button" data-focus id={'episode-'+i} className="episode-hit" data-episode-id={e.id} aria-label={(resumeEpisode(e.id)>0?'Resume ':'Play ')+e.name} onClick={()=>prepare(e)}/><button type="button" data-focus className="episode-options" id={'episode-options-'+i} aria-label={'Options for '+e.name} onClick={()=>{setEpisodeOptions(e);requestAnimationFrame(()=>document.getElementById('episode-resume')?.focus());}}>⋯</button>
   </div>)}</div>{seasonEpisodes.length>episodeLimit&&<button type="button" data-focus id="more-episodes" onClick={()=>setEpisodeLimit(x=>x+30)}>Show more episodes</button>}</>:<p>{loading?'Loading episodes…':'No episodes supplied by the installed metadata add-ons.'}</p>}
  {episodeOptions&&<section className="episode-action-panel"><h3>{episodeOptions.name}</h3><div className="controls"><button type="button" data-focus id="episode-resume" onClick={()=>{prepare(episodeOptions);setEpisodeOptions(null);}}>Resume / Play</button><button type="button" data-focus id="episode-start-over" onClick={()=>{prepare(episodeOptions,true);setEpisodeOptions(null);}}>Start over</button><button type="button" data-focus id="episode-mark" onClick={()=>{onWatched(episodeOptions.id,!isWatched(episodeOptions.id));closeEpisodeOptions();}}>{isWatched(episodeOptions.id)?'Mark unwatched':'Mark watched'}</button><button type="button" data-focus id="episode-options-close" onClick={closeEpisodeOptions}>Close</button></div></section>}
  </section>}
 </section>;
}
