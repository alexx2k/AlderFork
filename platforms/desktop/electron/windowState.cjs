const fs=require('node:fs'),path=require('node:path');
const valid=r=>r&&['x','y','width','height'].every(k=>Number.isSafeInteger(r[k]))&&r.width>=720&&r.height>=500&&r.width<=16000&&r.height<=16000;
function restoreBounds(saved,displays){
 if(!valid(saved)||!Array.isArray(displays))return null;
 const areas=displays.map(d=>d.workArea).filter(a=>a&&['x','y','width','height'].every(k=>Number.isFinite(a[k])));
 const overlap=a=>Math.max(0,Math.min(saved.x+saved.width,a.x+a.width)-Math.max(saved.x,a.x))*Math.max(0,Math.min(saved.y+saved.height,a.y+a.height)-Math.max(saved.y,a.y));
 const area=areas.sort((a,b)=>overlap(b)-overlap(a))[0];if(!area||overlap(area)<10000)return null;
 const width=Math.min(saved.width,Math.max(720,area.width)),height=Math.min(saved.height,Math.max(500,area.height));
 return {width,height,x:Math.round(Math.max(area.x,Math.min(saved.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(saved.y,area.y+area.height-height)))};
}
function readWindowState(dir,displays){try{const r=JSON.parse(fs.readFileSync(path.join(dir,'window-state.json'),'utf8'));const bounds=restoreBounds(r.bounds,displays);return bounds?{bounds,maximized:r.maximized===true}:null;}catch{return null;}}
function trackWindowState(win,dir){let timer,closed=false;
 const save=()=>{if(closed||win.isDestroyed()||win.isFullScreen()||win.isMinimized())return;try{const bounds=win.getNormalBounds();if(!valid(bounds))return;const target=path.join(dir,'window-state.json'),tmp=target+'.tmp';fs.writeFileSync(tmp,JSON.stringify({bounds,maximized:win.isMaximized()}));fs.renameSync(tmp,target);}catch{}};
 const queue=()=>{clearTimeout(timer);timer=setTimeout(save,300);};for(const e of ['resize','move','maximize','unmaximize','leave-full-screen'])win.on(e,queue);win.on('close',()=>{clearTimeout(timer);save();});win.on('closed',()=>{closed=true;clearTimeout(timer);});}
module.exports={restoreBounds,readWindowState,trackWindowState};
