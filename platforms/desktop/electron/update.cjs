const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const ROOT='https://github.com/alexx2k/Tarn/releases',API='https://api.github.com/repos/alexx2k/Tarn/releases/tags/',MAX=512*1024*1024;
function parts(v){if(typeof v!=='string'||!/^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-dev\.\d{1,6})?$/.test(v))return null;const [core,dev]=v.split('-dev.');return [...core.split('.').map(Number),dev===undefined?Infinity:Number(dev)];}
function newer(v,current){const a=parts(v),b=parts(current);if(!a||!b||(!current.includes('-dev.')&&v.includes('-dev.')))return false;for(let i=0;i<4;i++)if(a[i]!==b[i])return a[i]>b[i];return false;}
function releaseAssets(r,v){
 const tag='desktop-v'+v,name='Tarn-Desktop-'+v+'-win-x64.exe',base=ROOT+'/download/'+tag+'/';
 if(!parts(v)||r?.tag_name!==tag||r.draft!==false||r.prerelease!==v.includes('-dev.')||!Array.isArray(r.assets))throw Error('Not a published desktop release.');
 const find=n=>r.assets.find(a=>a?.name===n&&a.state==='uploaded'&&a.browser_download_url===base+n&&Number.isSafeInteger(a.size)&&a.size>0);
 const installer=find(name),checksum=find('SHA256SUMS.txt');if(!installer||installer.size>MAX||!checksum||checksum.size>16384)throw Error('Installer or checksum missing.');return {installer,checksum};
}
function downloadHost(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','github-releases.githubusercontent.com'].includes(u.hostname);}catch{return false;}}
function expectedHash(text,name){const rows=String(text).split(/\r?\n/).map(l=>/^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(l.trim())).filter(x=>x&&x[2]===name);if(rows.length!==1)throw Error('Invalid installer checksum.');return rows[0][1].toLowerCase();}
async function request(url,signal,api=false){
 for(let i=0;i<6;i++){
  if(api?!url.startsWith(API):!downloadHost(url))throw Error('Untrusted update address.');
  const response=await fetch(url,{redirect:'manual',signal,headers:{'User-Agent':'Tarn-Desktop-Updater',...(api?{Accept:'application/vnd.github+json'}:{})}});
  if(response.status>=300&&response.status<400){const target=response.headers.get('location');await response.body?.cancel();if(api||!target)throw Error('Unexpected update redirect.');url=new URL(target,url).href;continue;}
  if(!response.ok||!response.body){await response.body?.cancel();throw Error('GitHub returned HTTP '+response.status);}return response;
 }throw Error('Too many update redirects.');
}
async function bounded(response,max){const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('Update response exceeded limit.');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks).toString('utf8');}
function createUpdater({app,dialog,window,emit}){
 let active=false;
 return async function install(version){
  if(active)return {ok:false,message:'An update is already in progress.'};
  if(process.platform!=='win32'||!app.isPackaged||!newer(version,app.getVersion()))return {ok:false,message:'Not a newer supported Windows update.'};
  active=true;let folder,launched=false;const progress=(stage,percent,message)=>emit({stage,percent,message});
  try{
   progress('checking',0,'Checking official desktop release…');const signal=AbortSignal.timeout(15*60*1000);
   const release=JSON.parse(await bounded(await request(API+encodeURIComponent('desktop-v'+version),signal,true),2*1024*1024));
   const {installer,checksum}=releaseAssets(release,version),name=installer.name;
   const expected=expectedHash(await bounded(await request(checksum.browser_download_url,signal),16384),name);
   if(typeof installer.digest==='string'&&installer.digest!=='sha256:'+expected)throw Error('Published checksums do not match.');
   folder=await fs.mkdtemp(path.join(os.tmpdir(),'tarn-update-'));const file=path.join(folder,name),handle=await fs.open(file,'wx');
   const hash=crypto.createHash('sha256');let received=0,last=-1;
   try{const response=await request(installer.browser_download_url,signal);for await(const chunk of response.body){
    received+=chunk.length;if(received>installer.size||received>MAX)throw Error('Installer exceeded published size.');
    hash.update(chunk);let offset=0;while(offset<chunk.length){const w=await handle.write(chunk,offset,chunk.length-offset);if(!w.bytesWritten)throw Error('Could not write installer.');offset+=w.bytesWritten;}
    const percent=Math.floor(received/installer.size*100);if(percent!==last){last=percent;progress('downloading',percent,'Downloading Tarn Desktop '+version+'…');}
   }}finally{await handle.close();}
   if(received!==installer.size||hash.digest('hex')!==expected)throw Error('Installer integrity verification failed.');
   progress('ready',100,'Download verified. Confirm installation.');
   const result=await dialog.showMessageBox(window,{type:'question',title:'Install Tarn Desktop update?',message:'Tarn Desktop '+version+' is ready to install.',detail:'The SHA-256 checksum matches the official release. The installer is unsigned. Tarn will close and the normal installer wizard will open.',buttons:['Install and close Tarn','Not now'],defaultId:1,cancelId:1,noLink:true});
   if(result.response!==0){progress('idle',0,'Installation cancelled.');return {ok:false,message:'Installation cancelled.'};}
   const final=crypto.createHash('sha256');for await(const chunk of require('node:fs').createReadStream(file))final.update(chunk);if(final.digest('hex')!==expected)throw Error('Installer changed after verification.');
   const child=spawn(file,[],{detached:true,stdio:'ignore',shell:false,windowsHide:false});
   await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
   child.unref();launched=true;progress('installing',100,'Opening installer…');app.quit();return {ok:true,message:'Installer opened.'};
  }catch(e){const message=e instanceof Error?e.message:'Update failed.';progress('error',0,message);return {ok:false,message};}
  finally{active=false;if(folder&&!launched)await fs.rm(folder,{recursive:true,force:true}).catch(()=>{});}
 };
}
module.exports={parts,newer,releaseAssets,downloadHost,expectedHash,createUpdater};
