import React,{useEffect,useRef,useState} from 'react';
import {Row,keyFor} from './library.mjs';
import {Title,PlaybackIntent} from './liveCatalogue.ts';
export function rowIntent(row:Row):PlaybackIntent{
 const episode=row.title.episodes?.find(e=>e.id===row.videoId);
 return {type:row.title.type,titleId:row.title.id,videoId:row.videoId,name:episode?row.title.name+' · '+episode.name:row.title.name};
}
function CardImage({row,landscape}:{row:Row;landscape:boolean}){
 const e=row.title.episodes?.find(e=>e.id===row.videoId),url=landscape?(e?.thumbnail||row.title.background||row.title.poster):row.title.poster;
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[url]);
 return <div className="library-art">{url&&!failed?<img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span>{row.title.name.slice(0,1)}</span>}</div>;
}
export function ContinueWatching({rows,onResume,onOptions}:{rows:Row[];onResume:(row:Row)=>void;onOptions:(row:Row)=>void}){
 if(!rows.length)return null;
 return <section className="shelf continue-shelf"><h2>Continue Watching</h2><div className="continue-cards">{rows.map((row,i)=><ContinueCard key={keyFor(row.title)} row={row} index={i} onResume={()=>onResume(row)} onOptions={()=>onOptions(row)}/>)}</div></section>;
}
function ContinueCard({row,index,onResume,onOptions}:{row:Row;index:number;onResume:()=>void;onOptions:()=>void}){
 const long=useRef(false),timer=useRef<number|undefined>(undefined),keyHandled=useRef(0);
 const clear=()=>{if(timer.current!==undefined)window.clearTimeout(timer.current);timer.current=undefined;};
 useEffect(()=>clear,[]);
 const episode=row.title.episodes?.find(e=>e.id===row.videoId),match=row.videoId.match(/:(\d+):(\d+)$/);
 const episodeLabel=row.title.type==='series'?(episode?.season!=null&&episode.number!=null?'S'+episode.season+' E'+episode.number:match?'S'+match[1]+' E'+match[2]:episode?.name||'Episode'):'';
 const remaining=row.duration>row.position?Math.ceil((row.duration-row.position)/60):0;
 const label=[episodeLabel,row.next?'Next episode':remaining?remaining+' min remaining':'Resume'].filter(Boolean).join(' · ');
 return <div className="continue-card"><CardImage row={row} landscape/><div className="continue-progress"><div style={{width:(row.duration>0&&!row.next?Math.min(100,100*row.position/row.duration):0)+'%'}}/></div><strong>{row.title.name}</strong><small>{label}</small>
 <button data-focus type="button" className="continue-hit" id={'continue-'+index} aria-label={'Resume '+row.title.name}
 onClick={()=>{if(!long.current&&Date.now()-keyHandled.current>300)onResume();long.current=false;}}
 onKeyDown={e=>{if(e.key==='Enter'||e.keyCode===13){if(e.repeat&&timer.current===undefined)return;if(!e.repeat){long.current=false;clear();timer.current=window.setTimeout(()=>{long.current=true;timer.current=undefined;onOptions();},650);}e.preventDefault();}else if(e.key==='ContextMenu'||e.keyCode===93){e.preventDefault();onOptions();}}}
 onKeyUp={e=>{if(e.key==='Enter'||e.keyCode===13){e.preventDefault();keyHandled.current=Date.now();const held=long.current;clear();if(!held)onResume();long.current=false;}}} onBlur={clear} onContextMenu={e=>{e.preventDefault();onOptions();}}/>
 <button data-focus type="button" className="continue-more" id={'continue-more-'+index} aria-label={'Options for '+row.title.name} onClick={onOptions}>⋯</button></div>;
}
export function MyList({rows,onOpen}:{rows:Row[];onOpen:(title:Title)=>void}){
 return <section className="shelf"><h1>My List</h1>{!rows.length?<p>No saved titles yet. Add movies or series from their details page.</p>:<div className="my-list-cards">{rows.map((r,i)=><div className="library-list-card" key={keyFor(r.title)}><CardImage row={r} landscape={false}/><strong>{r.title.name}</strong><button type="button" data-focus className="continue-hit" id={'library-'+i} aria-label={'View '+r.title.name} onClick={()=>onOpen(r.title)}/></div>)}</div>}</section>;
}
