import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {directionFor,isBack,nextFocus,routeFromHash,FocusRect,Route} from './navigation.ts';
import {createStore,initialState,FoundationState,StateStore} from './storage.ts';
import {capabilities,endpointForManifest,mediaSamples,probeJson,ProbeResult} from './diagnostics.ts';
import {titles,Title} from './catalogue.ts';
import './style.css';

function focus(id?:string){
 const el=id?document.getElementById(id):null;
 (el||document.querySelector<HTMLElement>('[data-focus]'))?.focus();
}
function buttons():HTMLElement[]{
 return Array.from(document.querySelectorAll<HTMLElement>('[data-focus]')).filter(e=>!e.hasAttribute('disabled')&&e.getClientRects().length>0);
}
function rect(e:HTMLElement):FocusRect{const r=e.getBoundingClientRect();return {id:e.id,left:r.left,top:r.top,right:r.right,bottom:r.bottom};}
function Btn({id,children,onClick,className='',disabled=false}:React.PropsWithChildren<{id:string;onClick:()=>void;className?:string;disabled?:boolean}>){
 return <button id={id} data-focus type="button" className={className} disabled={disabled} onClick={onClick}>{children}</button>;
}
function Artwork({title}: {title:Title}){
 return <div className={'art '+title.theme} aria-hidden="true"><span/><i/><b/></div>;
}
function App(){
 const [route,setRoute]=useState<Route>(()=>routeFromHash(location.hash));
 const [state,setState]=useState<FoundationState>(()=>initialState());
 const [storage,setStorage]=useState('Opening local storage…');
 const store=useRef<StateStore|null>(null);
 const restored=useRef<Record<string,string>>({});
 const lastHash=useRef(location.hash);
 const [pending,setPending]=useState<string|null>(null);
 const [shelf,setShelf]=useState('Home');
 const [query,setQuery]=useState('');
 const [showSearch,setShowSearch]=useState(false);
 const go=(hash:string)=>{restored.current[location.hash]=(document.activeElement as HTMLElement)?.id||'featured';location.hash=hash;};
 const back=()=>{if(route.kind!=='home'){if(history.state?.tarnRoute)history.back();else location.hash='';}else if(showSearch){setShowSearch(false);setPending('search');}};
 useEffect(()=>{
  const onHash=()=>{const r=routeFromHash(location.hash);const old=lastHash.current;lastHash.current=location.hash;setRoute(r);setPending(old===location.hash?null:restored.current[location.hash]||(r.kind==='home'?'featured':'back'));};
  // The TV's default Back handling uses browser history. Mark internal routes only.
  const mark=()=>{if(location.hash&&routeFromHash(location.hash).kind!=='home')history.replaceState({tarnRoute:true},'');};
  const handler=()=>{mark();onHash();};
  window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler);
 },[]);
 useEffect(()=>{
  let alive=true;
  (async()=>{try{
   const s=createStore(indexedDB);store.current=s;
   const previous=await s.load();const updated={...previous,visits:previous.visits+1,updatedAt:Date.now()};await s.save(updated);
   if(alive){setState(updated);setStorage('IndexedDB read/write passed');}
  }catch{if(alive)setStorage('Local storage unavailable; changes are temporary');}})();
  return()=>{alive=false;};
 },[]);
 useLayoutEffect(()=>{if(pending){focus(pending);setPending(null);}},[pending,route,showSearch]);
 useLayoutEffect(()=>{focus(route.kind==='home'?'featured':'back');},[]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   const target=e.target as HTMLElement;
   const typing=target.tagName==='INPUT'||target.tagName==='TEXTAREA';
   if(typing){
    if(isBack(e.key,e.keyCode)){e.preventDefault();const id=target.id;focus(id==='query'?'search':id==='name'?'save':'network');return;}
    if(e.key==='ArrowDown'||e.keyCode===40){e.preventDefault();focus(target.id==='query'?(document.querySelector<HTMLElement>('.poster')?.id||'close-search'):target.id==='name'?'save':'network');}
    return;
   }
   if(isBack(e.key,e.keyCode)){
    if(route.kind!=='home'||showSearch){e.preventDefault();back();}
    return;
   }
   const dir=directionFor(e.key,e.keyCode);if(!dir)return;
   e.preventDefault();
   const items=buttons(),active=document.activeElement as HTMLElement;
   const dest=active&&items.includes(active)?nextFocus(rect(active),items.map(rect),dir):items[0]?.id;
   if(dest)focus(dest);
  };
  document.addEventListener('keydown',handler);
  return()=>document.removeEventListener('keydown',handler);
 },[route,showSearch]);
 const save=async(name:string)=>{
  const next={...state,name:name.trim().slice(0,24)||'Viewer',updatedAt:Date.now()};setState(next);
  try{if(!store.current)throw Error();await store.current.save(next);setStorage('IndexedDB read/write passed');}
  catch{setStorage('Save failed; change is temporary');}
 };
 const shown=titles.filter(t=>!showSearch||t.name.toLowerCase().includes(query.toLowerCase()));
 const detail=route.kind==='details'?titles.find(t=>t.id===route.id):undefined;
 return <div className="app" onPointerDown={e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('button[data-focus]');if(b)b.focus();}}>
 <header><img className="brand" src="assets/lockup.svg" alt="Tarn"/><span className="dev">webOS • 0.1.0 • Development</span></header>
 {route.kind==='home'?<main>
  <nav>{['Home','Discover','Movies','Series'].map(n=><Btn key={n} id={'nav-'+n} className={shelf===n?'selected':''} onClick={()=>{setShelf(n);setShowSearch(false);}}>{n}</Btn>)}
  <Btn id="search" onClick={()=>{setShowSearch(!showSearch);if(!showSearch)setTimeout(()=>document.getElementById('query')?.focus(),0);}}>Search</Btn>
  <Btn id="settings" onClick={()=>go('#settings')}>Settings</Btn><Btn id="diagnostics" onClick={()=>go('#diagnostics')}>Diagnostics</Btn>
  <span className="profile">{state.name}</span></nav>
  {showSearch?<section className="search"><h1>Search sample titles</h1><input id="query" data-focus value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();focus(shown[0]?'card-'+shown[0].id:'search');}}} placeholder="Search…" aria-label="Search sample titles"/><Btn id="close-search" onClick={()=>{setShowSearch(false);setPending('search');}}>Close search</Btn></section>:
  <section className="hero"><Artwork title={titles[0]}/><div className="hero-copy"><p className="eyebrow">TARN • SAMPLE CATALOGUE</p><h1>Still Water</h1><p>2026 · Drama</p><p>{titles[0].description}</p><Btn id="featured" className="primary" onClick={()=>go('#details/still-water')}>View details</Btn></div></section>}
  <section className="shelf"><h2>{showSearch?'Search results':shelf==='Home'?'Featured titles':shelf+' · sample titles'}</h2>
  {shown.length===0?<p>No sample titles match.</p>:<div className="cards">{shown.map(t=><Btn key={t.id} id={'card-'+t.id} className="poster" onClick={()=>go('#details/'+t.id)}><Artwork title={t}/><span>{t.name}</span><small>{t.genre}</small></Btn>)}</div>}</section>
  <footer>Sample catalogue only · Remote arrows / OK / Back · No real content integration yet</footer>
 </main>:<main className="page"><Btn id="back" onClick={back}>‹ Back</Btn>
  {route.kind==='diagnostics'?<Diagnostics/>:route.kind==='settings'?<section><h1>Settings</h1><p>{storage}</p><p>Launch count: {state.visits}</p><p>Profile: {state.name}</p><label htmlFor="name">Local test profile name</label><input id="name" data-focus key={state.name} defaultValue={state.name} maxLength={24} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();focus('save');}}}/><Btn id="save" onClick={()=>save((document.getElementById('name') as HTMLInputElement).value)}>Save name</Btn><p className="muted">Foundation storage test only. Full profile management comes in Milestone 4.</p></section>:detail?<section className="detail"><Artwork title={detail}/><div><p className="eyebrow">SAMPLE TITLE</p><h1>{detail.name}</h1><p>{detail.year} · {detail.genre}</p><p>{detail.description}</p><Btn id="detail-diagnostics" onClick={()=>go('#diagnostics')}>Test playback in diagnostics</Btn></div></section>:<p>Sample title not found.</p>}
 </main>}
 </div>;
}
function Diagnostics(){
 const video=useRef<HTMLVideoElement>(null);
 const [results,setResults]=useState<ProbeResult[]>([]);
 const [running,setRunning]=useState(false);
 const [report,setReport]=useState<string[]>([]);
 const [media,setMedia]=useState('Select a public sample.');
 const [url,setUrl]=useState('https://v3-cinemeta.strem.io/manifest.json');
 const selected=useRef('');
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;if(video.current)setReport(capabilities(video.current));return()=>{alive.current=false;};},[]);
 const run=async()=>{
  setRunning(true);setResults([]);
  let endpoint:string;
  try{endpoint=endpointForManifest(url);}catch{setResults([{label:'Add-on manifest',ok:false,detail:'Enter a valid HTTP(S) manifest.json URL'}]);setRunning(false);return;}
  const checks=await Promise.all([
   probeJson('Stremio public link API','https://link.stremio.com/api/v2/read?type=Read&code=000000'),
   probeJson('Stremio API POST','https://api.strem.io/api/addonCollectionGet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'AddonCollectionGet',authKey:'',update:false})}),
   probeJson('Add-on manifest',endpoint),
   probeJson('Public Cinemeta catalogue','https://v3-cinemeta.strem.io/catalog/movie/top.json')
  ]);
  if(alive.current){setResults(checks);setRunning(false);focus('network');}
 };
 const play=(name:string,url:string)=>{
  const v=video.current;if(!v)return;
  selected.current=name;setMedia('Loading '+name+'…');v.src=url;v.load();
  const promise=v.play();if(promise)promise.catch(()=>setMedia('Playback could not start; inspect media error.'));
 };
 return <section className="diagnostics"><h1>Device diagnostics</h1><p>Public endpoints and media only. No credentials are sent. A JSON response proves connectivity, not sign-in.</p>
 <div className="diagnostic-grid"><div>
 <label htmlFor="manifest">Add-on manifest URL (public test only)</label><input id="manifest" data-focus value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();focus('network');}}}/>
 <Btn id="network" disabled={running} onClick={run}>{running?'Testing…':'Run networking checks'}</Btn>
 <div aria-live="polite">{results.map(r=><p key={r.label} className={r.ok?'ok':'warn'}>{r.label}: {r.detail}</p>)}</div>
 <h2>Device capabilities</h2>{report.map(s=><p key={s} className="small">{s}</p>)}
 </div><div><h2>Native video test</h2><video ref={video} playsInline preload="none" onPlaying={()=>setMedia('Playing: '+selected.current)} onWaiting={()=>setMedia('Buffering…')} onPause={()=>setMedia('Paused')} onEnded={()=>setMedia('Ended')} onError={()=>setMedia('Media error '+(video.current?.error?.code||'unknown'))}/>
 <div className="controls">{mediaSamples.map((s,i)=><Btn key={s.name} id={'sample-'+i} onClick={()=>play(s.name,s.url)}>{s.name}</Btn>)}
 <Btn id="pause" onClick={()=>{const v=video.current;if(v){if(v.paused)v.play()?.catch(()=>setMedia('Resume failed'));else v.pause();}}}>Play / pause</Btn>
 <Btn id="seek" onClick={()=>{const v=video.current;if(v&&Number.isFinite(v.duration))v.currentTime=Math.min(v.duration,v.currentTime+10);}}>+10 sec</Btn>
 <Btn id="stop" onClick={()=>{const v=video.current;if(v){v.pause();v.removeAttribute('src');v.load();setMedia('Stopped');}}}>Stop</Btn></div>
 <p aria-live="polite">{media}</p><p className="muted">Browser and simulator results do not guarantee TV decoder compatibility.</p>
 </div></div></section>;
}
createRoot(document.getElementById('root')!).render(<App/>);
