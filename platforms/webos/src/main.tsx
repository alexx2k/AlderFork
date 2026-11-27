import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {directionFor,isBack,nextFocus,routeFromHash,FocusRect,Route} from './navigation.ts';
import {createStore,initialState,FoundationState,StateStore} from './storage.ts';
import {capabilities,endpointForManifest,mediaSamples,probeJson,ProbeResult} from './diagnostics.ts';
import {createSessionStore,SessionStore} from './session.ts';
import {ApiError,installedAddons,revokeSession,getUserId} from './stremio.ts';
import {catalogues,loadShelves,loadDetails,titleKey,Title,Shelf,ContentCache,PlaybackIntent} from './liveCatalogue.ts';
import {SignIn} from './SignIn.tsx';
import {useDiscovery,DiscoverFilters,useRemoteSearch} from './Discovery.tsx';
import {TitleDetails} from './TitleDetails.tsx';
import {Player} from './Player.tsx';
import {clearSessionProgress} from './progress.ts';
import './style.css';

function focus(id?:string){
 const el=id?document.getElementById(id):null;
 const fallback=buttons()[0];
 (el&&!el.hasAttribute('disabled')&&el.getClientRects().length?el:fallback)?.focus();
}
function buttons():HTMLElement[]{
 return Array.from(document.querySelectorAll<HTMLElement>('[data-focus]')).filter(e=>!e.hasAttribute('disabled')&&e.getClientRects().length>0);
}
function rect(e:HTMLElement):FocusRect{const r=e.getBoundingClientRect();return {id:e.id,left:r.left,top:r.top,right:r.right,bottom:r.bottom};}
function Btn({id,children,onClick,className='',disabled=false}:React.PropsWithChildren<{id:string;onClick:()=>void;className?:string;disabled?:boolean}>){
 return <button id={id} data-focus type="button" className={className} disabled={disabled} onClick={onClick}>{children}</button>;
}
function Artwork({title,wide=false}:{title:Title;wide?:boolean}){
 const url=wide?(title.background||title.poster):title.poster;
 const [failed,setFailed]=useState(false);
 useEffect(()=>{setFailed(false);},[url]);
 return <div className={'art '+title.theme} aria-hidden="true">{url&&!failed?<img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={()=>setFailed(true)}/>:<><span/><i/><b/></>}</div>;
}
function App(){
 const [route,setRoute]=useState<Route>(()=>routeFromHash(location.hash));
 const [state,setState]=useState<FoundationState>(()=>initialState());
 const [storage,setStorage]=useState('Opening local storage…');
 const store=useRef<StateStore|null>(null);
 const sessionStore=useRef<SessionStore|null>(null);
 const [auth,setAuth]=useState<string|null>(null);
 const [accountId,setAccountId]=useState('');
 const [playing,setPlaying]=useState<{intent:PlaybackIntent;account:string}|null>(null);
 const playbackFocus=useRef('title-play');
 const authRef=useRef<string|null>(null);
 const [accountReady,setAccountReady]=useState(false);
 const [accountStatus,setAccountStatus]=useState('');
 const [rows,setRows]=useState<Shelf[]>([]);
 const [addons,setAddons]=useState<unknown[]>([]);
 const [status,setStatus]=useState('');
 const [loading,setLoading]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const [shelf,setShelf]=useState('Home');
 const [query,setQuery]=useState('');
 const [showSearch,setShowSearch]=useState(false);
 const [searchTerm,setSearchTerm]=useState('');
 const [keyboard,setKeyboard]=useState(false);
 const [searchLimit,setSearchLimit]=useState(30);
 const cache=useMemo(()=>new ContentCache(),[auth,refresh]);
 const discovery=useDiscovery(addons,!!auth&&shelf==='Discover'&&!showSearch,cache);
 const search=useRemoteSearch(addons,!!auth&&showSearch,searchTerm,cache);
 const submitSearch=()=>{const term=query.trim();setKeyboard(false);setPending('search-submit');setSearchLimit(30);if(term===searchTerm)search.retry();else setSearchTerm(term);};
 const [rowLimit,setRowLimit]=useState(6);
 const [detail,setDetail]=useState<Title|null>(null);
 const [selectedTitle,setSelectedTitle]=useState<Title|null>(null);
 const [detailLoading,setDetailLoading]=useState(false);
 const restored=useRef<Record<string,string>>({});
 const lastHash=useRef(location.hash);
 const [pending,setPending]=useState<string|null>(null);
 const go=(hash:string)=>{restored.current[location.hash]=(document.activeElement as HTMLElement)?.id||'link-account';location.hash=hash;};
 const closePlayer=()=>{setPlaying(null);setPending(playbackFocus.current);};
 const startPlayer=(intent:PlaybackIntent)=>{playbackFocus.current=(document.activeElement as HTMLElement)?.id||'back';setPlaying({intent,account:accountId});setPending('player-back');};
 const back=()=>{if(playing){closePlayer();return;}if(route.kind!=='home'){if(history.state?.tarnRoute)history.back();else location.hash='';}else if(showSearch){if(keyboard){setKeyboard(false);setPending('search-keyboard');}else{setShowSearch(false);setPending('search');}}else if(shelf==='Discover'){setShelf('Home');setPending('nav-Home');}};
 useEffect(()=>{
  const handler=()=>{const r=routeFromHash(location.hash);const old=lastHash.current;lastHash.current=location.hash;
   if(location.hash&&r.kind!=='home')history.replaceState({tarnRoute:true},'');
   setRoute(r);setPending(old===location.hash?null:restored.current[location.hash]||(r.kind==='home'?'link-account':'back'));
  };
  window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler);
 },[]);
 useEffect(()=>{
  let alive=true;
  (async()=>{try{
   const s=createStore(indexedDB);store.current=s;
   const previous=await s.load();const updated={...previous,visits:previous.visits+1,updatedAt:Date.now()};await s.save(updated);
   if(alive){setState(updated);setStorage('IndexedDB read/write passed');}
  }catch{if(alive)setStorage('Local storage unavailable; changes are temporary');}})();
  (async()=>{try{
   const s=createSessionStore(indexedDB);sessionStore.current=s;
   const key=await s.load();if(alive){authRef.current=key;setAuth(key);}
  }catch{if(alive)setAccountStatus('Account storage unavailable. Linking will last only for this session.');}
  finally{if(alive)setAccountReady(true);}})();
  return()=>{alive=false;};
 },[]);
 const linked=async(key:string)=>{
  authRef.current=key;setAuth(key);setAccountStatus('');
  try{if(!sessionStore.current)throw Error();await sessionStore.current.save(key);}
  catch{setAccountStatus('Account linked for this session only; storage failed.');}
  if(authRef.current===key){history.replaceState(null,'',location.pathname+location.search);lastHash.current='';setRoute({kind:'home'});setPending('nav-Home');}
 };
 const signOut=async()=>{
  const key=authRef.current;
  try{if(sessionStore.current)await sessionStore.current.save(null);}
  catch{setAccountStatus('Could not clear account storage. Retry sign-out.');return;}
  authRef.current=null;setAuth(null);setRows([]);setAddons([]);setDetail(null);setSelectedTitle(null);setQuery('');setSearchTerm('');setKeyboard(false);setShowSearch(false);setAccountStatus('Signed out on this device.');setPending('link-account');
  if(key)revokeSession(key).catch(()=>{});
 };
 useEffect(()=>{
  clearSessionProgress();setAccountId('');setPlaying(null);
  if(!auth)return;
  const c=new AbortController();getUserId(auth,c.signal).then(id=>{if(!c.signal.aborted)setAccountId(id);}).catch(()=>{});
  return()=>c.abort();
 },[auth]);
 useEffect(()=>{
  if(!auth){setRows([]);setAddons([]);setStatus('');setLoading(false);setSelectedTitle(null);setDetail(null);setQuery('');setSearchTerm('');setShowSearch(false);return;}
  const controller=new AbortController(),signal=controller.signal,key=auth;
  setLoading(true);setStatus('Loading installed add-ons…');
  (async()=>{
   try{
    const descriptors=await installedAddons(key,signal);
    if(signal.aborted||authRef.current!==key)return;
    setAddons(descriptors);
    const catalogs=catalogues(descriptors);
    setStatus('Loading catalogues…');
    const received=new Map<string,Shelf>();
    const result=await loadShelves(catalogs,signal,undefined,(url,init,s)=>cache.request(url,init,s),row=>{
     if(signal.aborted||authRef.current!==key)return;
     received.set(row.key,row);
     setRows(catalogs.map(c=>received.get(c.key)).filter((s):s is Shelf=>!!s&&s.titles.length>0));
    });
    if(signal.aborted||authRef.current!==key)return;
    setRows(result.shelves.filter(s=>s.titles.length));
    const count=result.shelves.filter(s=>s.titles.length).length;
    setStatus(count+' catalogue'+(count===1?'':'s')+' loaded from '+descriptors.length+' installed add-ons'+(result.failures?' · '+result.failures+' request(s) failed':'')+(result.truncated?' · first 24 catalogues':'')+'.');
   }catch(error){
    if(signal.aborted||authRef.current!==key)return;
    if(error instanceof ApiError&&error.code===1){
     try{if(sessionStore.current)await sessionStore.current.save(null);}
     catch{setAccountStatus('Session expired; stored token could not be removed.');}
     if(signal.aborted||authRef.current!==key)return;
     authRef.current=null;setAuth(null);setRows([]);setAddons([]);setAccountStatus('Session expired. Link your account again.');
    }else setStatus('Could not load your account or catalogues. Check the connection and select Refresh.');
   }finally{if(!signal.aborted&&authRef.current===key)setLoading(false);}
  })();
  return()=>controller.abort();
 },[auth,refresh,cache]);
 const selected=route.kind==='details'&&auth?(selectedTitle&&titleKey(selectedTitle)===route.id?selectedTitle:rows.reduce<Title|undefined>((found,row)=>found||row.titles.find(t=>titleKey(t)===route.id),undefined)):undefined;
 useEffect(()=>{
  setDetail(selected||null);setDetailLoading(!!selected);
  if(!selected)return;
  const controller=new AbortController();
  loadDetails(addons,selected,controller.signal,(url,init,s)=>cache.request(url,init,s)).then(t=>{if(!controller.signal.aborted){setDetail(t);setDetailLoading(false);}}).catch(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
  return()=>controller.abort();
 },[selected,addons,cache]);
 useLayoutEffect(()=>{if(pending){focus(pending);setPending(null);}},[pending,route,showSearch]);
 useLayoutEffect(()=>{focus(route.kind==='home'?'link-account':'back');},[]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   const target=e.target as HTMLElement;
   const typing=target.tagName==='INPUT'||target.tagName==='TEXTAREA';
   if(typing){
    if(isBack(e.key,e.keyCode)){e.preventDefault();const id=target.id;focus(id==='query'?'search':id==='name'?'save':'network');return;}
    if(e.key==='ArrowDown'||e.keyCode===40){e.preventDefault();focus(target.id==='query'?'search-submit':target.id==='name'?'save':'network');}
    return;
   }
   if(isBack(e.key,e.keyCode)){if(playing||route.kind!=='home'||showSearch||shelf==='Discover'){e.preventDefault();back();}return;}
   const dir=directionFor(e.key,e.keyCode);if(!dir)return;
   e.preventDefault();
   const items=buttons(),active=document.activeElement as HTMLElement;
   const dest=active&&items.includes(active)?nextFocus(rect(active),items.map(rect),dir):items[0]?.id;
   if(dest)focus(dest);
  };
  document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler);
 },[route,showSearch,shelf,keyboard,playing]);
 const save=async(name:string)=>{
  const next={...state,name:name.trim().slice(0,24)||'Viewer',updatedAt:Date.now()};setState(next);
  try{if(!store.current)throw Error();await store.current.save(next);setStorage('IndexedDB read/write passed');}
  catch{setStorage('Save failed; change is temporary');}
 };
 const visible:Shelf[]=showSearch?(search.items.length?[{key:'search-results',name:'Search results',addon:'Installed add-ons',type:'movie',titles:search.items.slice(0,searchLimit)}]:[]):shelf==='Discover'?(discovery.current&&discovery.items.length?[{key:'discover-results',name:discovery.current.name,addon:discovery.current.addon,type:discovery.current.type,titles:discovery.items}]:[]):rows.filter(r=>shelf==='Movies'?r.type==='movie':shelf==='Series'?r.type==='series':true).filter(r=>r.titles.length);
 const featured=visible.length?visible[0].titles[0]:null;
 const openTitle=(t:Title)=>{setSelectedTitle(t);go('#details/'+encodeURIComponent(titleKey(t)));};
 const activeDetail=detail&&selected&&titleKey(detail)===titleKey(selected)?detail:selected;
 return <><div className="app" style={playing?{display:"none"}:undefined} onPointerDown={e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('button[data-focus]');if(b)b.focus();}}>
 <header><img className="brand" src="assets/lockup.svg" alt="Tarn"/><span className="dev">webOS • 0.3.0-dev.1 • Development</span></header>
 {route.kind==='home'?<main>
  <nav>{['Home','Discover','Movies','Series'].map(n=><Btn key={n} id={'nav-'+n} className={shelf===n?'selected':''} onClick={()=>{setShelf(n);setShowSearch(false);setKeyboard(false);setRowLimit(6);}}>{n}</Btn>)}
  {auth&&<Btn id="search" onClick={()=>{setShowSearch(!showSearch);setKeyboard(false);if(!showSearch)setTimeout(()=>document.getElementById('query')?.focus(),0);}}>Search</Btn>}
  <Btn id="settings" onClick={()=>go('#settings')}>Settings</Btn><Btn id="diagnostics" onClick={()=>go('#diagnostics')}>Diagnostics</Btn>
  <span className="profile">{state.name}</span></nav>
  {accountStatus&&<p className="warn" aria-live="polite">{accountStatus}</p>}
  {!accountReady?<p>Opening account storage…</p>:!auth?<section className="welcome"><p className="eyebrow">TARN</p><h1>Your living room, your library.</h1><p>Link your Stremio account to browse the catalogues from your installed add-ons.</p><Btn id="link-account" className="primary" onClick={()=>go('#signin')}>Link Stremio account</Btn></section>:<>
  <div className="catalog-status"><p aria-live="polite">{status}</p><Btn id="refresh-catalogues" disabled={loading} onClick={()=>setRefresh(x=>x+1)}>{loading?'Loading…':'Refresh catalogues'}</Btn></div>
  {showSearch?<section className="search"><h1>Search</h1><input id="query" data-focus maxLength={120} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.keyCode===13){e.preventDefault();submitSearch();focus('search-submit');}}} placeholder="Search movies and series…" aria-label="Search installed add-ons"/><div className="controls"><Btn id="search-submit" className="primary" onClick={submitSearch}>{search.loading?'Search again':'Search'}</Btn><Btn id="search-keyboard" onClick={()=>{setKeyboard(!keyboard);if(!keyboard)setPending('key-A');}}>{keyboard?'Hide keyboard':'On-screen keyboard'}</Btn><Btn id="close-search" onClick={()=>{setShowSearch(false);setKeyboard(false);setPending('search');}}>Close search</Btn></div>{keyboard&&<div className="search-keys" aria-label="On-screen search keyboard">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').map(k=><Btn key={k} id={'key-'+k} onClick={()=>setQuery(q=>(q+k).slice(0,120))}>{k}</Btn>)}<Btn id="key-space" onClick={()=>setQuery(q=>(q+' ').slice(0,120))}>Space</Btn><Btn id="key-delete" onClick={()=>setQuery(q=>q.slice(0,-1))}>Delete</Btn><Btn id="key-clear" onClick={()=>setQuery('')}>Clear</Btn><Btn id="key-search" onClick={submitSearch}>Search</Btn></div>}<p aria-live="polite">{search.status}</p></section>:
  shelf==='Discover'?<DiscoverFilters model={discovery}/>:featured&&<section className="hero"><Artwork key={titleKey(featured)} title={featured} wide/><div className="hero-copy"><p className="eyebrow">FEATURED</p><h1>{featured.name}</h1><p>{[featured.year,featured.genre].filter(Boolean).join(' · ')}</p><p className="synopsis">{featured.description}</p><Btn id="featured" className="primary" onClick={()=>openTitle(featured)}>View details</Btn></div></section>}
  {!showSearch&&shelf!=='Discover'&&visible.length===0&&!loading&&<p>No catalogues available for this view. Try Refresh or check your installed add-ons.</p>}
  {visible.slice(0,rowLimit).map(r=><section className="shelf" key={r.key}><h2>{r.name} <small>· {r.addon}</small></h2><div className="cards live-cards">{r.titles.map((t,i)=><div className="poster-card" key={titleKey(t)}><Artwork title={t}/><span className="poster-title" aria-hidden="true">{t.name}</span><small aria-hidden="true">{t.year||t.genre||'\u00a0'}</small><button type="button" className="poster-hit" data-focus id={'card-'+r.key+'-'+i} aria-label={[t.name,t.year].filter(Boolean).join(', ')} onClick={()=>openTitle(t)}/></div>)}</div></section>)}
  {showSearch&&search.items.length>searchLimit&&<Btn id="more-search" onClick={()=>{setPending('card-search-results-'+searchLimit);setSearchLimit(x=>x+30);}}>Show more search results</Btn>}
  {!showSearch&&shelf==='Discover'&&discovery.next!==null&&<Btn id="more-discover" onClick={discovery.more}>{discovery.loading?'Loading…':'Load more titles'}</Btn>}
  {!showSearch&&shelf!=='Discover'&&visible.length>rowLimit&&<Btn id="more-rows" onClick={()=>setRowLimit(x=>x+6)}>Show more catalogues</Btn>}
  <footer>Tarn webOS · Direct playback development build.</footer>
  </>}
 </main>:<main className="page"><Btn id="back" onClick={back}>‹ Back</Btn>
 {route.kind==='signin'?auth?<p>Account linked. Return to Home.</p>:<SignIn onLinked={linked} onCancel={back}/>:route.kind==='diagnostics'?<Diagnostics/>:route.kind==='settings'?<section><h1>Settings</h1><h2>Stremio account</h2><p>{auth?'Account linked':'Not linked'}</p>{accountStatus&&<p className="warn">{accountStatus}</p>}{auth?<Btn id="sign-out" onClick={signOut}>Sign out of Stremio</Btn>:<Btn id="link-settings" disabled={!accountReady} onClick={()=>go('#signin')}>Link account</Btn>}
 <h2>Local storage</h2><p>{storage}</p><p>Launch count: {state.visits}</p><p>Profile: {state.name}</p><label htmlFor="name">Local test profile name</label><input id="name" data-focus key={state.name} defaultValue={state.name} maxLength={24} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();focus('save');}}}/><Btn id="save" onClick={()=>save((document.getElementById('name') as HTMLInputElement).value)}>Save name</Btn><p className="muted">Single account for now. Full profile management comes in Milestone 4.</p></section>:activeDetail?<TitleDetails key={titleKey(activeDetail)} title={activeDetail} loading={detailLoading} onPlay={startPlayer}/>:<p>{loading?'Loading catalogues…':'Title not available. Return to Home and refresh.'}</p>}
 </main>}
 </div>{playing&&<Player intent={playing.intent} addons={addons} account={playing.account} onExit={closePlayer}/>}</>;
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
  if(alive.current){setResults(checks);setRunning(false);if(document.activeElement===document.body)requestAnimationFrame(()=>focus('network'));}
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
