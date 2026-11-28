const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tarnDesktop',{
 installUpdate:version=>ipcRenderer.invoke('tarn:update:install',version),
 onUpdateProgress:listener=>{if(typeof listener!=='function')return ()=>{};const handler=(_event,data)=>listener(data);ipcRenderer.on('tarn:update:progress',handler);return ()=>ipcRenderer.removeListener('tarn:update:progress',handler);},
 getFullscreen:()=>ipcRenderer.invoke('tarn:fullscreen:get'),
 setFullscreen:value=>ipcRenderer.invoke('tarn:fullscreen:set',value===true),
 onFullscreenChanged:listener=>{
  if(typeof listener!=='function')return ()=>{};
  const handler=(_event,value)=>listener(value===true);
  ipcRenderer.on('tarn:fullscreen:changed',handler);
  return ()=>ipcRenderer.removeListener('tarn:fullscreen:changed',handler);
 }
});
