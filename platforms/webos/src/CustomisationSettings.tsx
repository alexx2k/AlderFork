import React,{useEffect,useState} from 'react';
import QRCode from 'qrcode';
import {HomePrefs,changeTab,visibleTabs,homeDefaults,APP_VERSION,APP_ID,RELEASES_URL} from './customisation.mjs';
import type {useReleaseUpdates} from './useReleaseUpdates.ts';
const btn=(id:string,label:string,click:()=>void,disabled=false,active=false)=><button type="button" data-focus id={id} disabled={disabled} aria-pressed={active} className={active?'filter-active':''} onClick={click}>{label}</button>;
export function HomePreferences({value,onChange}:{value:HomePrefs;onChange:(next:HomePrefs)=>void}){
 const patch=(p:Partial<HomePrefs>)=>onChange({...value,...p});
 return <section className="home-preferences">
 <h3>Startup tab</h3><div className="filter-strip">{visibleTabs(value).map((t,i)=><React.Fragment key={t}>{btn('home-start-'+i,t,()=>patch({start:t}),false,value.start===t)}</React.Fragment>)}</div>
 <h3>Home featured artwork</h3><div className="controls">{btn('home-featured',value.featured?'Featured artwork: On':'Featured artwork: Off',()=>patch({featured:!value.featured}),false,value.featured)}</div>
 <h3>Spoiler protection</h3><p className="muted">Blur unwatched episode thumbnails in series details. Text and poster artwork remain unchanged.</p><div className="controls">{btn('home-blur',value.blurThumbnails?'Blur episode thumbnails: On':'Blur episode thumbnails: Off',()=>patch({blurThumbnails:!value.blurThumbnails}),false,value.blurThumbnails)}</div>
 <h3>Navigation tabs</h3><p className="muted">Home is always visible. Hiding a tab does not disable its add-ons or remove saved titles.</p>
 {value.order.map((t,i)=><div className="home-tab-row" key={t}><strong>{t} · {value.hidden.includes(t)?'Hidden':'Visible'}</strong><div className="controls">{btn('home-tab-toggle-'+i,value.hidden.includes(t)?'Show':'Hide',()=>onChange(changeTab(value,t,'toggle')))}{btn('home-tab-up-'+i,'Move up',()=>onChange(changeTab(value,t,'move',-1)),i===0)}{btn('home-tab-down-'+i,'Move down',()=>onChange(changeTab(value,t,'move',1)),i===value.order.length-1)}</div></div>)}
 <p className="muted">Continue Watching remains the first Home content row. Catalogue ordering is under My add-ons.</p>
 <h3>Release notifications</h3><div className="controls">{btn('home-updates',value.updates?'Automatic update checks: On':'Automatic update checks: Off',()=>patch({updates:!value.updates}),false,value.updates)}{btn('home-reset','Reset Home preferences',()=>onChange(homeDefaults))}</div>
 </section>;
}
export function UpdatePanel({model}:{model:ReturnType<typeof useReleaseUpdates>}){
 const [qrOpen,setQrOpen]=useState(false),[qr,setQr]=useState('');
 const link=model.release?.page||RELEASES_URL;
 useEffect(()=>{if(!qrOpen)return;let active=true;setQr('');QRCode.toDataURL(link,{width:280,margin:3,errorCorrectionLevel:'M'}).then(data=>{if(active)setQr(data);}).catch(()=>{});return()=>{active=false;};},[qrOpen,link]);
 return <section><p>Tarn webOS {APP_VERSION} · Development build</p><p className="muted">Installed package: {APP_ID}</p><p role="status">{model.status}</p>
 {model.release&&<p>A newer compatible IPK is available: {model.release.version}. Download it on your computer and install using the LG Developer Mode tools.</p>}
 <div className="controls">{btn('update-check',model.busy?'Checking…':'Check for updates',()=>void model.check(),model.busy)}{btn('update-qr',qrOpen?'Hide release QR':'View releases on phone',()=>setQrOpen(!qrOpen))}</div>
 {qrOpen&&<div className="update-qr">{qr&&<img src={qr} alt="GitHub release page QR code"/>}<p>{link}</p></div>}
 <p className="muted">Only published, stable GitHub releases containing a newer IPK for this exact app ID qualify. Android APKs, development prereleases and other app IDs are ignored. Updates are installed manually; this app cannot install IPKs itself.</p></section>;
}
