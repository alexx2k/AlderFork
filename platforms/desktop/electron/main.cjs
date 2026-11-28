const {app,BrowserWindow,Menu,protocol,net,session,shell,dialog,ipcMain,screen}=require('electron');
const path=require('node:path');
const {createUpdater}=require('./update.cjs');
const {readWindowState,trackWindowState}=require('./windowState.cjs');
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
  const saved=readWindowState(app.getPath('userData'),screen.getAllDisplays());
  win=new BrowserWindow({title:'Tarn Desktop',width:1440,height:900,minWidth:720,minHeight:500,...(saved?.bounds||{}),show:false,backgroundColor:'#0b1624',icon:path.join(root,'assets','desktopIcon.png'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,spellcheck:false,enableBlinkFeatures:'AudioVideoTracks',preload:path.join(__dirname,'preload.cjs')}});
  const wc=win.webContents;
  wc.setWindowOpenHandler(({url})=>{if(externalAllowed(url))void shell.openExternal(url).catch(()=>{});return {action:'deny'};});
  wc.on('will-navigate',(event,url)=>{if(!isAppPage(url))event.preventDefault();});
  wc.on('will-redirect',(event,url)=>{if(!isAppPage(url))event.preventDefault();});
  wc.on('will-attach-webview',event=>event.preventDefault());
  wc.on('render-process-gone',(_e,details)=>{if(details.reason!=='clean-exit'&&win&&!win.isDestroyed())dialog.showMessageBox(win,{type:'error',message:'Tarn renderer stopped. Restart the application.'}).catch(()=>{});});
  const validSender=event=>win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&isAppPage(event.senderFrame.url);
  ipcMain.handle('tarn:fullscreen:get',event=>validSender(event)?win.isFullScreen():false);
  ipcMain.handle('tarn:fullscreen:set',(event,value)=>{
   if(!validSender(event)||typeof value!=='boolean')return false;
   win.setFullScreen(value);return win.isFullScreen();
  });
  const installUpdate=createUpdater({app,dialog,window:win,emit:data=>{if(win&&!win.isDestroyed())win.webContents.send('tarn:update:progress',data);}});
  ipcMain.handle('tarn:update:install',(event,version)=>validSender(event)&&typeof version==='string'?installUpdate(version):{ok:false,message:'Invalid update request.'});
  trackWindowState(win,app.getPath('userData'));
  const notifyFullscreen=()=>{if(win&&!win.isDestroyed())win.webContents.send('tarn:fullscreen:changed',win.isFullScreen());};
  win.on('enter-full-screen',notifyFullscreen);win.on('leave-full-screen',notifyFullscreen);
  const fullscreen=()=>{if(win&&!win.isDestroyed())win.setFullScreen(!win.isFullScreen());};
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:'Tarn',submenu:[{label:'GitHub releases',click:()=>void shell.openExternal('https://github.com/alexx2k/Tarn/releases').catch(()=>{})},{role:'quit'}]},
   {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
   {label:'View',submenu:[{label:'Fullscreen',accelerator:'F11',click:fullscreen},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]}
  ]));
  win.once('ready-to-show',()=>{if(saved?.maximized)win?.maximize();win?.show();});
  win.on('closed',()=>{win=null;});
  await win.loadURL(ORIGIN+'/index.html');
 }).catch(()=>{dialog.showErrorBox('Tarn Desktop','Could not start the desktop client. Rebuild the app and try again.');app.quit();});
 app.on('window-all-closed',()=>app.quit());
}
