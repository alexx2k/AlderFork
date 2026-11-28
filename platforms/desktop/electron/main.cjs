const {app,BrowserWindow,Menu,protocol,net,session,shell,dialog}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {ORIGIN,assetPath,externalAllowed,isAppPage}=require('./policy.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'tarn',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
app.setName('Tarn Desktop');
app.setAppUserModelId('dev.tarn.desktop');
const root=path.join(__dirname,'..','dist');
let win;
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
 app.whenReady().then(async()=>{
  await protocol.handle('tarn',request=>{
   const file=assetPath(request.url,root);
   if(!file||request.method!=='GET')return new Response('Not found',{status:404});
   return net.fetch(pathToFileURL(file).href).catch(()=>new Response('Not found',{status:404}));
  });
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  win=new BrowserWindow({title:'Tarn Desktop',width:1440,height:900,minWidth:720,minHeight:500,show:false,backgroundColor:'#0b1624',icon:path.join(root,'assets','desktopIcon.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,spellcheck:false}});
  const wc=win.webContents;
  wc.setWindowOpenHandler(({url})=>{if(externalAllowed(url))void shell.openExternal(url).catch(()=>{});return {action:'deny'};});
  wc.on('will-navigate',(event,url)=>{if(!isAppPage(url))event.preventDefault();});
  wc.on('will-redirect',(event,url)=>{if(!isAppPage(url))event.preventDefault();});
  wc.on('will-attach-webview',event=>event.preventDefault());
  wc.on('render-process-gone',(_e,details)=>{if(details.reason!=='clean-exit'&&win&&!win.isDestroyed())dialog.showMessageBox(win,{type:'error',message:'Tarn renderer stopped. Restart the application.'}).catch(()=>{});});
  const fullscreen=()=>{if(win&&!win.isDestroyed())win.setFullScreen(!win.isFullScreen());};
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'Tarn',submenu:[{label:'GitHub releases',click:()=>void shell.openExternal('https://github.com/alexx2k/Tarn/releases').catch(()=>{})},{role:'quit'}]},
   {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
   {label:'View',submenu:[{label:'Fullscreen',accelerator:'F11',click:fullscreen},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]}
  ]));
  win.once('ready-to-show',()=>win?.show());
  win.on('closed',()=>{win=null;});
  await win.loadURL(ORIGIN+'/index.html');
 }).catch(()=>{dialog.showErrorBox('Tarn Desktop','Could not start the desktop client. Rebuild the app and try again.');app.quit();});
 app.on('window-all-closed',()=>app.quit());
}
