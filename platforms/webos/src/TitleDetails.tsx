import React,{useEffect,useState} from 'react';
import {Episode,PlaybackIntent,playbackIntent,seasonsFor,Title} from './liveCatalogue.ts';

function SafeImage({url,className}:{url?:string;className:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[url]);
 return url&&!failed?<img className={className} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className={className+' artwork-placeholder'} aria-hidden="true"/>;
}
export function TitleDetails({title,loading,onPlay}:{title:Title;loading:boolean;onPlay:(intent:PlaybackIntent)=>void}){
 const episodes=title.episodes||[];
 const seasons=seasonsFor(episodes);
 const [chosenSeason,setChosenSeason]=useState<number|null|undefined>(undefined);
 const season=chosenSeason!==undefined&&seasons.includes(chosenSeason)?chosenSeason:(seasons.includes(1)?1:seasons[0]);
 const [episodeLimit,setEpisodeLimit]=useState(30);
 const seasonEpisodes=episodes.filter(e=>e.season===season);
 const prepare=(episode?:Episode)=>{const intent=playbackIntent(title,episode);if(intent)onPlay(intent);};
 const facts=[title.year,title.genre,title.rating?'Rating '+title.rating:null,title.runtime].filter(Boolean).join(' · ');
 return <section className="title-page">
  <div className="title-hero">
   <SafeImage className="title-backdrop" url={title.background||title.poster}/>
   <div className="title-shade"/>
   <div className="title-copy"><p className="eyebrow">{title.type==='movie'?'MOVIE':'SERIES'}</p><h1>{title.name}</h1>
    {facts&&<p className="title-facts">{facts}</p>}
    <p className="title-description">{title.description||'No description available.'}</p>
    {!!title.cast?.length&&<p className="muted">Cast: {title.cast.join(', ')}</p>}
    {title.type==='movie'?<button type="button" data-focus id="title-play" className="primary" onClick={()=>prepare()}>▶ Play</button>:<button type="button" data-focus id="title-episodes" className="primary" disabled={!seasonEpisodes.length} onClick={()=>document.getElementById('episode-0')?.focus()}>Browse episodes</button>}
    {loading&&<p aria-live="polite" className="muted">Loading title details…</p>}
   </div>
  </div>
  {title.type==='series'&&<section className="episode-section"><h2>Episodes</h2>
   {seasons.length>0?<><div className="filter-strip" aria-label="Seasons">{seasons.map((s,i)=><button type="button" data-focus id={'season-'+i} key={s===null?'other':s} className={season===s?'filter-active':''} aria-pressed={season===s} onClick={()=>{setChosenSeason(s);setEpisodeLimit(30);}}>{s===null?'Other episodes':s===0?'Specials':'Season '+s}</button>)}</div>
   <div className="episode-list">{seasonEpisodes.slice(0,episodeLimit).map((e,i)=><div className="episode-card" key={e.id}>
    <SafeImage className="episode-thumb" url={e.thumbnail}/><div className="episode-copy"><h3>{e.number!==null?e.number+'. ':''}{e.name}</h3>{e.released&&<p className="muted">{e.released.slice(0,10)}</p>}<p>{e.description||'No episode description available.'}</p></div>
    <button type="button" data-focus id={'episode-'+i} className="episode-hit" aria-label={'Play '+e.name} onClick={()=>prepare(e)}/>
   </div>)}</div>{seasonEpisodes.length>episodeLimit&&<button type="button" data-focus id="more-episodes" onClick={()=>setEpisodeLimit(x=>x+30)}>Show more episodes</button>}</>:<p>{loading?'Loading episodes…':'No episodes supplied by the installed metadata add-ons.'}</p>}
  </section>}
 </section>;
}
