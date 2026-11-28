const path=require('node:path');
const ORIGIN='tarn://app';
function assetPath(raw,root){
 let u;try{u=new URL(raw);}catch{return null;}
 if(u.protocol!=='tarn:'||u.hostname!=='app'||u.port||u.username||u.password)return null;
 let name;try{name=decodeURIComponent(u.pathname);}catch{return null;}
 if(name==='/'||name==='')name='/index.html';
 if(!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(name)||name.split('/').some(x=>x==='.'||x==='..'))return null;
 const target=path.resolve(root,'.'+name),relative=path.relative(root,target);
 return !relative||relative.startsWith('..')||path.isAbsolute(relative)?null:target;
}
function externalAllowed(raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='link.stremio.com'&&u.pathname==='/')||(u.hostname==='github.com'&&/^\/alexx2k\/Tarn\/releases(?:\/tag\/[-a-zA-Z0-9._]+)?\/?$/.test(u.pathname)));}catch{return false;}
}
function isAppPage(raw){try{const u=new URL(raw);return u.protocol==='tarn:'&&u.host==='app'&&!u.username&&!u.password&&['/','/index.html'].includes(u.pathname);}catch{return false;}}
module.exports={ORIGIN,assetPath,externalAllowed,isAppPage};
