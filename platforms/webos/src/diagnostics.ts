export type ProbeResult={label:string;ok:boolean;detail:string};
export function endpointForManifest(raw:string):string{
 const u=new URL(raw);
 if(u.protocol!=='https:'&&u.protocol!=='http:')throw Error('Use HTTP or HTTPS');
 if(u.username||u.password)throw Error('Credentials in URLs are not supported');
 if(!u.pathname.endsWith('/manifest.json'))throw Error('Use an add-on manifest.json URL');
 return u.href;
}
export async function probeJson(label:string,url:string,init?:RequestInit):Promise<ProbeResult>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{...init,signal:controller.signal,credentials:'omit',cache:'no-store'});
  const payload=await response.json();
  if(!response.ok)return {label,ok:true,detail:'HTTP '+response.status+' · JSON reachable (request rejected)'};
  return {label,ok:true,detail:'HTTP '+response.status+' · JSON '+(Array.isArray(payload)?'array':typeof payload)};
 }catch(e){return {label,ok:false,detail:controller.signal.aborted?'Timed out':'Network, TLS, CORS or JSON failure'};}
 finally{clearTimeout(timer);}
}
export const mediaSamples=[
 {name:'MP4 / H.264',url:'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'},
 {name:'HLS',url:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'}
];
export function capabilities(video:HTMLVideoElement):string[]{
 return [
  'User agent: '+navigator.userAgent,
  'Origin: '+location.origin,
  'Screen: '+screen.width+' × '+screen.height,
  'IndexedDB: '+(typeof indexedDB!=='undefined'),
  'MediaSource: '+(typeof MediaSource!=='undefined'),
  'H.264/AAC: '+(video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')||'not reported'),
  'HEVC: '+(video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')||'not reported'),
  'HLS: '+(video.canPlayType('application/vnd.apple.mpegurl')||'not reported')
 ];
}
