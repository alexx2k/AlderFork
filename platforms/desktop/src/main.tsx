import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {directionFor,isBack,nextFocus,routeFromHash,FocusRect,Route} from './navigation.ts';
import {createStore,initialState,FoundationState,StateStore} from './storage.ts';
import {capabilities,endpointForManifest,mediaSamples,probeJson,ProbeResult} from './diagnostics.ts';
import {useAddonCollection} from './useAddonCollection.ts';
import {AddonManager} from './AddonManager.tsx';
import {Layout,cleanLayout,layoutKey,orderCatalogues} from './addonManagement.mjs';
import {catalogues,loadShelves,loadDetails,titleKey,Title,Shelf,ContentCache,PlaybackIntent,playbackIntent} from './liveCatalogue.ts';
import {useDiscovery,DiscoverFilters,useRemoteSearch} from './Discovery.tsx';
import {TitleDetails} from './TitleDetails.tsx';
import {Player} from './Player.tsx';
import {ProfileGate,Portrait} from './ProfileGate.tsx';
import type {Profile} from './profiles.mjs';
import {useLibrary} from './useLibrary.ts';
import {ContinueWatching,MyList,rowIntent} from './LibraryRows.tsx';
import {continueRows,listRows,keyFor,Row,nextEpisode} from './library.mjs';
import {PlayerPreferences} from './PlayerPreferences.tsx';
import {readPrefs,savePrefs} from './playerSettings.ts';
import {Prefs,cleanPrefs} from './playerPrefs.mjs';
import type {Prepared} from './advancedPlayback.mjs';
import {newSession,ViewingSession} from './viewingExperience.mjs';
import {HomePrefs,cleanHome,homeKey,visibleTabs} from './customisation.mjs';
import {HomePreferences,UpdatePanel} from './CustomisationSettings.tsx';
import {useReleaseUpdates} from './useReleaseUpdates.ts';
import {LazyArtwork} from './LazyArtwork.tsx';
import './style.css';
import './desktop.css';

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
function SearchGlyph(){
 return <svg className="search-glyph" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>;
}
function Artwork({title,wide=false}:{title:Title;wide?:boolean}){
 const url=wide?(title.background||title.poster):title.poster;
 const [failed,setFailed]=useState(false);
 useEffect(()=>{setFailed(false);},[url]);
 return <div className={'art '+title.theme} aria-hidden="true">{url&&!failed?<LazyArtwork src={url} alt="" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<><span/><i/><b/></>}</div>;
}
function App({profile,token,namespace,onSwitch,onSignOut,onExpired,lenders}:{profile:Profile;token:string;namespace:string;onSwitch:()=>void;onSignOut:()=>void;onExpired:()=>void;lenders:string[]}){
 const [route,setRoute]=useState<Route>(()=>routeFromHash(location.hash));
 const [state,setState]=useState<FoundationState>(()=>initialState());
 const [storage,setStorage]=useState('Opening local storage…');
 const store=useRef<StateStore|null>(null);
 const auth=token;
 const [prefs,setPrefs]=useState(()=>readPrefs(namespace));
 const updatePrefs=(patch:Partial<Prefs>)=>setPrefs(old=>{const next=cleanPrefs({...old,...patch});savePrefs(namespace,next);return next;});
 const [confirmSignOut,setConfirmSignOut]=useState(false);
 const viewingSession=useRef<ViewingSession>(newSession(namespace));
 const [playing,setPlaying]=useState<{intent:PlaybackIntent;account:string;title:Title;startAt:number;prepared?:Prepared;origin?:'manual'|'autoplay'}|null>(null);
 const library=useLibrary(namespace,token,profile.mode==='stremio');
 const [continueMenu,setContinueMenu]=useState<Row|null>(null);
 const playbackFocus=useRef('title-play');
 const authRef=useRef<string|null>(token);
 
 const [rows,setRows]=useState<Shelf[]>([]);
 const [status,setStatus]=useState('');
 const [loading,setLoading]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const collection=useAddonCollection(token,profile.mode==='stremio',refresh,onExpired);
 const addons=collection.addons;
 const [layout,setLayout]=useState<Layout>(()=>{try{return cleanLayout(JSON.parse(localStorage.getItem(layoutKey(namespace))||'null'));}catch{return cleanLayout(null);}});
 const saveLayout=(next:Layout)=>{setLayout(next);try{localStorage.setItem(layoutKey(namespace),JSON.stringify(next));return true;}catch{return false;}};
 const catalogs=useMemo(()=>catalogues(addons),[addons]);
 const browsing=useMemo(()=>orderCatalogues(catalogs,layout),[catalogs,layout]);
 const [home,setHome]=useState<HomePrefs>(()=>{try{return cleanHome(JSON.parse(localStorage.getItem(homeKey(namespace))||'null'));}catch{return cleanHome(null);}});
 const [homeNote,setHomeNote]=useState('');
 const tabs=visibleTabs(home);
 const [shelf,setShelf]=useState(home.start);
 const updateHome=(next:HomePrefs)=>{const value=cleanHome(next);setHome(value);if(!visibleTabs(value).includes(shelf))setShelf('Home');try{localStorage.setItem(homeKey(namespace),JSON.stringify(value));setHomeNote('Saved for this profile.');}catch{setHomeNote('Changed for this session only; local storage unavailable.');}};
 const updates=useReleaseUpdates(home.updates);
 const [query,setQuery]=useState('');
 const [showSearch,setShowSearch]=useState(false);
 const [searchTerm,setSearchTerm]=useState('');
 const [keyboard,setKeyboard]=useState(false);
 const [searchLimit,setSearchLimit]=useState(30);
 const cache=useMemo(()=>new ContentCache(),[auth,refresh,addons]);
 const discovery=useDiscovery(addons,!!auth&&shelf==='Discover'&&!showSearch,cache,layout);
 const search=useRemoteSearch(addons,!!auth&&showSearch,searchTerm,cache);
 const openSearch=()=>{if(!auth)return;setContinueMenu(null);setShowSearch(true);setKeyboard(false);setPending('query');};
 const closeSearch=()=>{setShowSearch(false);setKeyboard(false);setPending('search');};
 const clearSearch=()=>{setQuery('');setSearchTerm('');setSearchLimit(30);setPending('query');};
 const submitSearch=()=>{if(!auth)return;const term=query.trim();setContinueMenu(null);setShowSearch(true);setKeyboard(false);setPending('search-submit');setSearchLimit(30);if(term===searchTerm)search.retry();else setSearchTerm(term);};
 const [rowLimit,setRowLimit]=useState(6);
 const [detail,setDetail]=useState<Title|null>(null);
 const [selectedTitle,setSelectedTitle]=useState<Title|null>(null);
 const [detailLoading,setDetailLoading]=useState(false);
 const restored=useRef<Record<string,string>>({});
 const lastHash=useRef(location.hash);
 const [pending,setPending]=useState<string|null>(null);
 const go=(hash:string)=>{restored.current[location.hash]=(document.activeElement as HTMLElement)?.id||'link-account';location.hash=hash;};
 const closePlayer=()=>{viewingSession.current=newSession(namespace);setPlaying(null);setPending(playbackFocus.current);};
 const startPlayer=(intent:PlaybackIntent,title:Title,startOver=false)=>{viewingSession.current=newSession(namespace);playbackFocus.current=continueMenu?'continue-'+Math.max(0,continueRows(library.data.rows).findIndex(r=>keyFor(r.title)===keyFor(title))):(document.activeElement as HTMLElement)?.id||'back';setContinueMenu(null);setPlaying({intent,account:namespace,title,startAt:startOver?0:library.position(title,intent)});setPending('player-back');};
 const back=()=>{if(continueMenu){setContinueMenu(null);setPending('continue-'+Math.max(0,continueRows(library.data.rows).findIndex(r=>keyFor(r.title)===keyFor(continueMenu.title))));return;}if(confirmSignOut){setConfirmSignOut(false);setPending('sign-out');return;}if(playing){closePlayer();return;}if(route.kind!=='home'){if(history.state?.tarnRoute)history.back();else location.hash='';}else if(showSearch){if(keyboard){setKeyboard(false);setPending('search-keyboard');}else{closeSearch();}}else if(shelf!=='Home'){setShelf('Home');setPending('nav-Home');}};
 useEffect(()=>{
  const handler=()=>{const r=routeFromHash(location.hash);const old=lastHash.current;lastHash.current=location.hash;
   if(location.hash&&r.kind!=='home')history.replaceState({tarnRoute:true},'');
   setRoute(r);setPending(old===location.hash?null:restored.current[location.hash]||(r.kind==='home'?'nav-Home':'back'));
  };
  window.addEventListener('hashchange',handler);return()=>window.removeEventListener('hashchange',handler);
 },[]);
 useEffect(()=>{
  let alive=true;authRef.current=token;
  (async()=>{try{
   const s=createStore(indexedDB);store.current=s;
   const previous=await s.load();const updated={...previous,visits:previous.visits+1,updatedAt:Date.now()};await s.save(updated);
   if(alive){setState(updated);setStorage('IndexedDB read/write passed');}
  }catch{if(alive)setStorage('Local storage unavailable; changes are temporary');}})();
  return()=>{alive=false;authRef.current=null;store.current?.close();store.current=null;};
 },[]);
 useEffect(()=>{
  if(!collection.loaded){setLoading(false);return;}
  const controller=new AbortController(),signal=controller.signal,key=auth;
  setRows([]);setLoading(true);setStatus('Loading catalogues…');
  (async()=>{
   try{
    const received=new Map<string,Shelf>();
    const result=await loadShelves(browsing,signal,undefined,(url,init,s)=>cache.request(url,init,s),row=>{
     if(signal.aborted||authRef.current!==key)return;
     received.set(row.key,row);
     setRows(browsing.map(c=>received.get(c.key)).filter((s):s is Shelf=>!!s&&s.titles.length>0));
    });
    if(signal.aborted||authRef.current!==key)return;
    setRows(result.shelves.filter(s=>s.titles.length));
    const count=result.shelves.filter(s=>s.titles.length).length;
    setStatus(count+' catalogue'+(count===1?'':'s')+' loaded from '+addons.length+' installed add-ons'+(result.failures?' · '+result.failures+' request(s) failed':'')+(result.truncated?' · first 24 catalogues':'')+'.');
   }catch{if(!signal.aborted)setStatus('Could not load catalogues. Select Refresh to retry.');}
   finally{if(!signal.aborted)setLoading(false);}
  })();
  return()=>controller.abort();
 },[auth,cache,browsing,collection.loaded]);
 const selected=route.kind==='details'&&auth?(selectedTitle&&titleKey(selectedTitle)===route.id?selectedTitle:rows.reduce<Title|undefined>((found,row)=>found||row.titles.find(t=>titleKey(t)===route.id),undefined)):undefined;
 useEffect(()=>{
  setDetail(selected||null);setDetailLoading(!!selected);
  if(!selected)return;
  const controller=new AbortController();
  loadDetails(addons,selected,controller.signal,(url,init,s)=>cache.request(url,init,s)).then(t=>{if(!controller.signal.aborted){setDetail(t);setDetailLoading(false);}}).catch(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
  return()=>controller.abort();
 },[selected,addons,cache]);
 useLayoutEffect(()=>{if(pending){focus(pending);setPending(null);}},[pending,route,showSearch]);
 useLayoutEffect(()=>{focus(route.kind==='home'?'nav-'+shelf:'back');},[]);
 useEffect(()=>{
  const handler=(e:KeyboardEvent)=>{
   if(e.defaultPrevented)return;
   if(auth&&!playing&&route.kind==='home'&&!continueMenu&&!confirmSignOut&&(e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();return;}
   const target=e.target as HTMLElement;
   const typing=target.tagName==='INPUT'||target.tagName==='TEXTAREA';
   if(typing){
    if(isBack(e.key,e.keyCode)){e.preventDefault();const id=target.id;focus(id==='addon-url'?'addon-inspect':id==='query'?'search':id==='name'?'save':'network');return;}
    if(e.key==='ArrowDown'||e.keyCode===40){e.preventDefault();focus(target.id==='addon-url'?'addon-inspect':target.id==='query'?'search-submit':target.id==='name'?'save':'network');}
    return;
   }
   if(isBack(e.key,e.keyCode)){if(!playing&&document.getElementById('episode-options-close')){e.preventDefault();document.getElementById('episode-options-close')?.click();return;}if(continueMenu||confirmSignOut||playing||route.kind!=='home'||showSearch||shelf!=='Home'){e.preventDefault();back();}return;}
   const dir=directionFor(e.key,e.keyCode);if(!dir)return;
   e.preventDefault();
   const modal=continueMenu?'.continue-menu':confirmSignOut?'.sign-out-confirm':playing&&document.querySelector('.player-panel')?'.player-panel':!playing&&document.querySelector('.episode-action-panel')?'.episode-action-panel':null;
   const items=modal?buttons().filter(x=>x.closest(modal)):buttons(),active=document.activeElement as HTMLElement;
   const dest=active&&items.includes(active)?nextFocus(rect(active),items.map(rect),dir):items[0]?.id;
   if(dest)focus(dest);
  };
  document.addEventListener('keydown',handler);return()=>document.removeEventListener('keydown',handler);
 },[auth,route,showSearch,shelf,keyboard,playing,confirmSignOut,continueMenu,library.data]);
 useEffect(()=>{library.enrich(rows.reduce<Title[]>((all,r)=>all.concat(r.titles),[]));},[rows]);
 useEffect(()=>{if(detail)library.enrich([detail]);},[detail]);
 // Hydrate imported history using the installed metadata providers, not invented title names.
 const hydrateKey=Object.values(library.data.rows).filter(r=>r.title.name===r.title.id||!r.title.background||r.title.type==='series'&&!r.title.episodes?.length).map(r=>keyFor(r.title)).sort().join('\u0001');
 useEffect(()=>{if(!addons.length||!hydrateKey)return;const c=new AbortController();const targets=Object.values(library.data.rows).filter(r=>r.title.name===r.title.id||!r.title.background||r.title.type==='series'&&!r.title.episodes?.length).slice(0,30);(async()=>{for(const row of targets){if(c.signal.aborted)return;const t=await loadDetails(addons,row.title,c.signal,(url,init,signal)=>cache.request(url,init,signal));if(!c.signal.aborted)library.enrich([t]);}})().catch(()=>{});return()=>c.abort();},[addons,hydrateKey,cache]);
 const visible:Shelf[]=showSearch?(search.items.length?[{key:'search-results',name:'Search results',addon:'Installed add-ons',type:'movie',titles:search.items.slice(0,searchLimit)}]:[]):shelf==='Discover'?(discovery.current&&discovery.items.length?[{key:'discover-results',name:discovery.current.name,addon:discovery.current.addon,type:discovery.current.type,titles:discovery.items}]:[]):rows.filter(r=>shelf==='Movies'?r.type==='movie':shelf==='Series'?r.type==='series':true).filter(r=>r.titles.length);
 const featured=visible.length&&(shelf!=='Home'||home.featured)?visible[0].titles[0]:null;
 const openTitle=(t:Title)=>{setSelectedTitle(t);go('#details/'+encodeURIComponent(titleKey(t)));};
 const activeDetail=detail&&selected&&titleKey(detail)===titleKey(selected)?detail:selected;
 // Direct resume cards may carry only a partial metadata snapshot. Enrich playback metadata without restarting the player.
 const playingTitleKey=playing?titleKey(playing.title):'';
 useEffect(()=>{
  if(!playing||playing.title.type!=='series'||!addons.length)return;
  const c=new AbortController(),title=playing.title,key=playingTitleKey;
  loadDetails(addons,title,c.signal,(url,init,signal)=>cache.request(url,init,signal)).then(t=>{
   if(c.signal.aborted)return;library.enrich([t]);
   setPlaying(p=>p&&titleKey(p.title)===key?{...p,title:t}:p);
  }).catch(()=>{});
  return()=>c.abort();
 },[playingTitleKey,addons,cache]);
 const upcomingEpisode=playing&&playing.title.type==='series'?nextEpisode(playing.title,playing.intent.videoId,(playing.title.episodes||[]).filter(e=>library.watched(playing.title,e.id)).map(e=>e.id)):null;
 const upcomingIntent=playing&&upcomingEpisode?playbackIntent(playing.title,upcomingEpisode):null;
 const searchForm= <form className="search-form" role="search" aria-label="Search movies and series" onSubmit={e=>{e.preventDefault();submitSearch();}}>
  <div className="search-field"><SearchGlyph/><input id="query" data-focus maxLength={120} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.keyCode===13){if(e.nativeEvent.isComposing)return;e.preventDefault();submitSearch();}}} placeholder="Search movies and series…" aria-label="Search movies and series" autoComplete="off"/></div>
  <button id="search-submit" type="submit" data-focus className="search-submit">{search.loading?'Search again':'Search'}</button>
  {(query||searchTerm)&&<Btn id="search-clear" className="search-clear" onClick={clearSearch}>Clear</Btn>}
  <span className="search-shortcut" aria-hidden="true">Ctrl + K</span>
 </form>;
 return <><div className="app" style={playing?{display:"none"}:undefined} onPointerDown={e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('button[data-focus]');if(b)b.focus();}}>
 <header><img className="brand" src="assets/lockup.svg" alt="Tarn"/><span className="dev">Desktop • 0.1.0-dev.3</span></header>
 {route.kind==='home'?<main>
  <nav aria-label="Main navigation">{auth&&<button id="search" type="button" data-focus className={'search-nav'+(showSearch?' selected':'')} aria-current={showSearch?'page':undefined} onClick={openSearch}><SearchGlyph/><span>Search</span></button>}
  {tabs.map(n=><Btn key={n} id={'nav-'+n} className={!showSearch&&shelf===n?'selected':''} onClick={()=>{setContinueMenu(null);setShelf(n);setShowSearch(false);setKeyboard(false);setRowLimit(6);}}>{n}</Btn>)}
  <Btn id="settings" onClick={()=>go('#settings')}>{home.updates&&updates.release?'Settings · Update available':'Settings'}</Btn><Btn id="diagnostics" onClick={()=>go('#diagnostics')}>Diagnostics</Btn>
  <button id="switch-profile" type="button" data-focus className="profile profile-switch" onClick={onSwitch}><Portrait profile={profile}/><span>{profile.name}</span></button></nav>
  {home.updates&&updates.release&&<section className="desktop-update-alert" role="status"><div><strong>New Tarn Desktop update available</strong><p>Version {updates.release.version} is ready to download.</p></div><a href={updates.release.page} target="_blank" rel="noreferrer">Download update ↗</a></section>}
  {auth&&<div className="desktop-search-bar">{searchForm}</div>}
  {!showSearch&&shelf==='Home'&&<ContinueWatching rows={continueRows(library.data.rows)} onResume={r=>startPlayer(rowIntent(r),r.title)} onOptions={r=>{setContinueMenu(r);setPending('continue-resume');}}/>}
  {continueMenu&&<section className="continue-menu" role="dialog" aria-label="Continue Watching options"><h2>{continueMenu.title.name}</h2><div className="controls"><Btn id="continue-resume" onClick={()=>startPlayer(rowIntent(continueMenu),continueMenu.title)}>Resume</Btn><Btn id="continue-restart" onClick={()=>startPlayer(rowIntent(continueMenu),continueMenu.title,true)}>Start over</Btn><Btn id="continue-details" onClick={()=>{openTitle(continueMenu.title);setContinueMenu(null);}}>View details</Btn><Btn id="continue-watched" onClick={()=>{library.act({kind:'watched',title:continueMenu.title,videoId:continueMenu.videoId});setContinueMenu(null);setPending('nav-Home');}}>Mark as watched</Btn><Btn id="continue-remove" onClick={()=>{library.act({kind:'hide',title:continueMenu.title,videoId:continueMenu.videoId});setContinueMenu(null);setPending('nav-Home');}}>Remove from Continue Watching</Btn><Btn id="continue-cancel" onClick={back}>Cancel</Btn></div></section>}
  {!showSearch&&shelf==='My List'?<><div className="catalog-status"><p role="status">{library.status}</p>{profile.mode==='stremio'&&<Btn id="library-sync" onClick={library.retry}>Sync now</Btn>}</div><MyList rows={listRows(library.data.rows)} onOpen={openTitle}/></>:<>
  {!showSearch&&<div className="catalog-status"><p aria-live="polite">{collection.busy||!collection.loaded?collection.status:status}</p><Btn id="refresh-catalogues" disabled={loading||collection.busy} onClick={()=>setRefresh(x=>x+1)}>{loading||collection.busy?'Loading…':'Refresh catalogues'}</Btn></div>}
  {showSearch?<section className="search search-page" aria-labelledby="search-title"><div className="search-page-heading"><div><p className="eyebrow">FIND SOMETHING TO WATCH</p><h1 id="search-title">Search</h1><p className="search-intro">Find movies and series across your installed add-ons.</p></div><Btn id="close-search" className="search-back" onClick={closeSearch}>‹ Back to {shelf}</Btn></div>
  
  <div className="controls search-tools"><Btn id="search-keyboard" onClick={()=>{setKeyboard(!keyboard);setPending(keyboard?'search-keyboard':'key-A');}}>{keyboard?'Hide keyboard':'On-screen keyboard'}</Btn></div>{keyboard&&<div className="search-keys" aria-label="On-screen search keyboard">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').map(k=><Btn key={k} id={'key-'+k} onClick={()=>setQuery(q=>(q+k).slice(0,120))}>{k}</Btn>)}<Btn id="key-space" onClick={()=>setQuery(q=>(q+' ').slice(0,120))}>Space</Btn><Btn id="key-delete" onClick={()=>setQuery(q=>q.slice(0,-1))}>Delete</Btn><Btn id="key-clear" onClick={()=>setQuery('')}>Clear</Btn><Btn id="key-search" onClick={submitSearch}>Search</Btn></div>}
  <div className="search-feedback" role="status" aria-live="polite" aria-atomic="true">{searchTerm&&<strong>{'Results for “'+searchTerm+'”'}</strong>}<p>{search.status||'Enter a movie or series title to get started.'}</p></div></section>:
  shelf==='Discover'?<DiscoverFilters model={discovery}/>:featured&&<section className="hero"><Artwork key={titleKey(featured)} title={featured} wide/><div className="hero-copy"><p className="eyebrow">FEATURED</p><h1>{featured.name}</h1><p>{[featured.year,featured.genre].filter(Boolean).join(' · ')}</p><p className="synopsis">{featured.description}</p><Btn id="featured" className="primary" onClick={()=>openTitle(featured)}>View details</Btn></div></section>}
  {!showSearch&&shelf!=='Discover'&&visible.length===0&&!loading&&<p>No catalogues available for this view. Try Refresh or check your installed add-ons.</p>}
  {visible.slice(0,rowLimit).map(r=><section className="shelf" key={r.key}><h2>{r.name} <small>· {r.addon}</small></h2><div className="cards live-cards">{r.titles.map((t,i)=><div className="poster-card" key={titleKey(t)}><Artwork title={t}/><span className="poster-title" aria-hidden="true">{t.name}</span><small aria-hidden="true">{t.year||t.genre||'\u00a0'}</small><button type="button" className="poster-hit" data-focus id={'card-'+r.key+'-'+i} aria-label={[t.name,t.year].filter(Boolean).join(', ')} onClick={()=>openTitle(t)}/></div>)}</div></section>)}
  {showSearch&&search.items.length>searchLimit&&<Btn id="more-search" onClick={()=>{setPending('card-search-results-'+searchLimit);setSearchLimit(x=>x+30);}}>Show more search results</Btn>}
  {!showSearch&&shelf==='Discover'&&discovery.next!==null&&<Btn id="more-discover" onClick={discovery.more}>{discovery.loading?'Loading…':'Load more titles'}</Btn>}
  {!showSearch&&shelf!=='Discover'&&visible.length>rowLimit&&<Btn id="more-rows" onClick={()=>setRowLimit(x=>x+6)}>Show more catalogues</Btn>}
  <footer>Tarn Desktop · Direct playback development build.</footer></>}
 </main>:<main className="page"><Btn id="back" onClick={back}>‹ Back</Btn>
 {route.kind==='diagnostics'?<Diagnostics/>:route.kind==='addons'?<AddonManager collection={collection} owner={profile.mode==='stremio'} catalogs={catalogs} layout={layout} onLayout={saveLayout}/>:route.kind==='settings'?<section><h1>Settings</h1><div className="profile-edit-preview"><Portrait profile={profile}/><div><h2>{profile.name}</h2><p>{profile.mode==='local'?'Local profile · shared streaming account':'Stremio profile · linked account'}</p></div></div><div className="controls"><Btn id="settings-profiles" onClick={onSwitch}>Switch or manage profiles</Btn>{profile.mode==='stremio'&&<Btn id="sign-out" onClick={()=>{setConfirmSignOut(true);setPending('cancel-sign-out');}}>Sign out of Stremio</Btn>}</div>
 {confirmSignOut&&<section className="playback-preview sign-out-confirm" role="dialog" aria-label="Confirm sign out"><h2>Sign out of this account?</h2><p>Your profile and local history will remain. Local profiles using this account will need it relinked.</p><Btn id="cancel-sign-out" onClick={()=>{setConfirmSignOut(false);setPending('sign-out');}}>Cancel</Btn><Btn id="confirm-sign-out" onClick={onSignOut}>Sign out</Btn></section>}
 <h2>Home and navigation</h2><HomePreferences value={home} onChange={updateHome}/>{homeNote&&<p role="status">{homeNote}</p>}<h2>Add-ons and catalogues</h2><p>Manage the linked account’s add-ons and this profile’s catalogue layout.</p><Btn id="settings-addons" onClick={()=>go('#addons')}>My add-ons</Btn><h2>Playback preferences</h2><PlayerPreferences prefs={prefs} onChange={updatePrefs}/><h2>About and updates</h2><UpdatePanel model={updates}/><h2>Local storage</h2><p>{storage}</p><p>Launch count: {state.visits}</p><p className="muted">Playback progress and source memory are separate for each profile. Stremio profiles sync their library; local profiles never send library changes to Stremio.</p></section>:activeDetail?<TitleDetails key={titleKey(activeDetail)} title={activeDetail} loading={detailLoading} blurThumbnails={home.blurThumbnails} onPlay={(intent,startOver)=>startPlayer(intent,activeDetail,startOver)} inList={!!library.row(activeDetail)?.list} onList={()=>library.act({kind:'list',title:activeDetail,on:!library.row(activeDetail)?.list})} isWatched={id=>library.watched(activeDetail,id)} onWatched={(id,on)=>library.act({kind:on?'watched':'unwatch',title:activeDetail,videoId:id})} resumeAt={intent=>library.position(activeDetail,intent)} preferredEpisodeId={(()=>{const r=library.row(activeDetail);return r&&!r.hidden&&(r.next||r.position>0)?r.videoId:undefined;})()}/>:<p>{loading?'Loading catalogues…':'Title not available. Return to Home and refresh.'}</p>}
 </main>}
 </div>{playing&&<Player viewingSession={viewingSession} key={playing.account+'|'+playing.intent.type+'|'+playing.intent.videoId} title={playing.title} nextIntent={upcomingIntent} nextEpisode={upcomingEpisode} prepared={playing.prepared} onAdvance={(next,prepared,origin)=>{setPlaying(p=>p&&p.intent.videoId===playing.intent.videoId?{intent:next,account:p.account,title:p.title,startAt:0,prepared,origin}:p);setPending('player-back');}} intent={playing.intent} addons={addons} lenders={lenders} account={playing.account} startAt={playing.startAt} prefs={prefs} onPrefs={updatePrefs} onProgress={(position,duration,played,ended)=>library.act({kind:'progress',title:playing.title,videoId:playing.intent.videoId,position,duration,played,ended})} onExit={closePlayer}/>}</>;
}
function Diagnostics(){
 const video=useRef<HTMLVideoElement>(null);
 const [results,setResults]=useState<ProbeResult[]>([]);
 const [running,setRunning]=useState(false);
 const [report,setReport]=useState<string[]>([]);
 const [media,setMedia]=useState('Select a public sample.');
 const [url,setUrl]=useState('https://v3-cinemeta.strem.io/manifest.json');
 const selected=useRef('');
 const alive=useRef(true),probe=useRef<AbortController|null>(null),mediaGeneration=useRef(0);
 useEffect(()=>{alive.current=true;const v=video.current;if(v)setReport(capabilities(v));return()=>{alive.current=false;probe.current?.abort();mediaGeneration.current++;if(v){v.pause();v.removeAttribute('src');v.load();}};},[]);
 const run=async()=>{
  setRunning(true);setResults([]);
  let endpoint:string;
  try{endpoint=endpointForManifest(url);}catch{setResults([{label:'Add-on manifest',ok:false,detail:'Enter a valid HTTP(S) manifest.json URL'}]);setRunning(false);return;}
  probe.current?.abort();const c=new AbortController();probe.current=c;
  const checks=await Promise.all([
   probeJson('Stremio public link API','https://link.stremio.com/api/v2/read?type=Read&code=000000',undefined,c.signal),
   probeJson('Stremio API POST','https://api.strem.io/api/addonCollectionGet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'AddonCollectionGet',authKey:'',update:false})},c.signal),
   probeJson('Add-on manifest',endpoint,undefined,c.signal),
   probeJson('Public Cinemeta catalogue','https://v3-cinemeta.strem.io/catalog/movie/top.json',undefined,c.signal)
  ]);
  if(alive.current&&!c.signal.aborted){setResults(checks);setRunning(false);if(document.activeElement===document.body)requestAnimationFrame(()=>focus('network'));}
 };
 const play=(name:string,url:string)=>{
  const v=video.current;if(!v)return;
  const gen=++mediaGeneration.current;selected.current=name;setMedia('Loading '+name+'…');v.src=url;v.load();
  const promise=v.play();if(promise)promise.catch(()=>{if(alive.current&&gen===mediaGeneration.current)setMedia('Playback could not start; inspect media error.');});
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
 <Btn id="stop" onClick={()=>{const v=video.current;if(v){mediaGeneration.current++;v.pause();v.removeAttribute('src');v.load();setMedia('Stopped');}}}>Stop</Btn></div>
 <p aria-live="polite">{media}</p><p className="muted">Browser results do not guarantee GPU or codec compatibility.</p>
 </div></div></section>;
}
createRoot(document.getElementById('root')!).render(<ProfileGate renderDiagnostics={()=><Diagnostics/>} renderApp={(profile,token,namespace,onSwitch,onSignOut,onExpired,lenders)=><App key={profile.id} profile={profile} token={token} namespace={namespace} onSwitch={onSwitch} onSignOut={onSignOut} onExpired={onExpired} lenders={lenders}/>}/>);
