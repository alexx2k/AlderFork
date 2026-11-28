const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tarnDesktop',{
 getFullscreen:()=>ipcRenderer.invoke('tarn:fullscreen:get'),
 setFullscreen:value=>ipcRenderer.invoke('tarn:fullscreen:set',value===true),
 onFullscreenChanged:listener=>{
  if(typeof listener!=='function')return ()=>{};
  const handler=(_event,value)=>listener(value===true);
  ipcRenderer.on('tarn:fullscreen:changed',handler);
  return ()=>ipcRenderer.removeListener('tarn:fullscreen:changed',handler);
 }
});
