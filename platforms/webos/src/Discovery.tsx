import React,{useEffect,useMemo,useRef,useState} from 'react';
import {appendPage,browseCatalogs,catalogues,ContentCache,ContentType,loadPage,loadShelves,Title,uniqueTitles} from './liveCatalogue.ts';

export function useDiscovery(addons:unknown[],active:boolean,cache:ContentCache){
 const catalogs=useMemo(()=>browseCatalogs(catalogues(addons)),[addons]);
 const [type,setType]=useState<ContentType>('movie');
 const options=catalogs.filter(c=>c.type===type);
 const [key,setKey]=useState('');
 const current=options.find(c=>c.key===key)||options[0];
 const [genre,setGenre]=useState('');
 const genres=current?current.genres:[]; 
 const effectiveGenre=current&&genres.includes(genre)?genre:(current?.required.genre||'');
 const [items,setItems]=useState<Title[]>([]);
 const [next,setNext]=useState<number|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const [offset,setOffset]=useState(0);
 const scope=useRef('');
 const requestKey=current?current.key+'|'+current.base+'|'+effectiveGenre:'';
 // One request at a time; switching filters resets offset, results and outstanding requests.
 useEffect(()=>{
  if(!active||!current){setLoading(false);return;}
  const changed=scope.current!==requestKey;
  if(changed){scope.current=requestKey;setItems([]);setNext(null);if(offset!==0){setOffset(0);return;}}
  const controller=new AbortController(),signal=controller.signal;
  setLoading(true);setError('');
  loadPage(current,effectiveGenre,offset,signal,(url,init,s)=>cache.request(url,init,s)).then(page=>{
   if(signal.aborted)return;
   if(offset===0){setItems(page.titles);setNext(page.next);}
   else{setItems(previous=>{const result=appendPage(previous,page);setNext(result.next);return result.titles;});}
  }).catch(()=>{if(!signal.aborted)setError('Could not load this catalogue. Try again.');}).finally(()=>{if(!signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[active,requestKey,offset,revision,cache]);
 const chooseType=(value:ContentType)=>{setType(value);setKey('');setGenre('');setOffset(0);setItems([]);setNext(null);};
 const chooseCatalog=(value:string)=>{if(value===current?.key)return;setKey(value);setGenre('');setOffset(0);setItems([]);setNext(null);};
 const chooseGenre=(value:string)=>{if(value===effectiveGenre)return;setGenre(value);setOffset(0);setItems([]);setNext(null);};
 return {type,options,current,genres,effectiveGenre,items,next,loading,error,chooseType,chooseCatalog,chooseGenre,
  more:()=>{if(!loading&&next!==null)setOffset(next);},retry:()=>setRevision(x=>x+1)};
}
export type DiscoveryModel=ReturnType<typeof useDiscovery>;
export function DiscoverFilters({model:m}:{model:DiscoveryModel}){
 return <section className="discovery-filters">
  <h1>Discover</h1><div className="filter-strip" aria-label="Content type">
   {(['movie','series'] as const).map(t=><button type="button" data-focus id={'discover-'+t} key={t} className={m.type===t?'filter-active':''} aria-pressed={m.type===t} onClick={()=>m.chooseType(t)}>{t==='movie'?'Movies':'Series'}</button>)}
  </div>
  <h2>Catalogue</h2>
  {m.options.length?<div className="filter-strip">{m.options.map(c=><button type="button" data-focus id={'discover-catalog-'+c.key} key={c.key} className={m.current?.key===c.key?'filter-active':''} aria-pressed={m.current?.key===c.key} onClick={()=>m.chooseCatalog(c.key)}>{c.name} · {c.addon}</button>)}</div>:<p>No browseable catalogues for this type.</p>}
  {m.genres.length>0&&<><h2>Genre</h2><div className="filter-strip">
   {!m.current?.required.genre&&<button type="button" data-focus id="genre-all" className={!m.effectiveGenre?'filter-active':''} aria-pressed={!m.effectiveGenre} onClick={()=>m.chooseGenre('')}>All genres</button>}
   {m.genres.map((g,i)=><button type="button" data-focus id={'genre-'+i} key={g} className={m.effectiveGenre===g?'filter-active':''} aria-pressed={m.effectiveGenre===g} onClick={()=>m.chooseGenre(g)}>{g.toLowerCase()==='none'?'All genres':g}</button>)}
  </div></>}
  <p aria-live="polite">{m.loading?'Loading catalogue…':m.error||(!m.items.length&&m.current?'No titles found.':m.items.length?m.items.length+' titles loaded':'')}</p>
  {m.error&&<button type="button" data-focus id="discover-retry" onClick={m.retry}>Retry catalogue</button>}
 </section>;
}
export function useRemoteSearch(addons:unknown[],active:boolean,term:string,cache:ContentCache){
 const [items,setItems]=useState<Title[]>([]);
 const [status,setStatus]=useState('');
 const [loading,setLoading]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(!active){setLoading(false);return;}
  if(!term.trim()){setItems([]);setStatus('Enter a title to search your installed add-ons.');setLoading(false);return;}
  const controller=new AbortController(),signal=controller.signal;
  setItems([]);setLoading(true);setStatus('Searching installed add-ons…');
  const catalogs=catalogues(addons);
  loadShelves(catalogs,signal,term.trim(),(url,init,s)=>cache.request(url,init,s)).then(result=>{
   if(signal.aborted)return;
   const titles=uniqueTitles(result.shelves.flatMap(s=>s.titles));
   setItems(titles);
   setStatus(!result.total?'No installed add-on advertises compatible search.':titles.length+' unique result'+(titles.length===1?'':'s')+' from '+result.total+' searchable catalogues'+(result.failures?' · '+result.failures+' failed':'')+'.');
  }).catch(()=>{if(!signal.aborted)setStatus('Search failed. Try again.');}).finally(()=>{if(!signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[addons,active,term,cache,retry]);
 return {items,status,loading,retry:()=>setRetry(x=>x+1)};
}
