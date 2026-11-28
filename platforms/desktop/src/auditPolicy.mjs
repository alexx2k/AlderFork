// Pure policies for pre-release hardening; browser APIs are passed in explicitly.
export function cloudWriteAllowed(cloud,bound,verified){return cloud===true&&typeof bound==='string'&&bound.length>0&&verified===bound;}
export function withinSeekRange(ranges,target){if(!ranges||!Number.isFinite(target)||target<0)return false;try{for(let i=0;i<ranges.length;i++)if(target>=ranges.start(i)&&target<=ranges.end(i))return true;}catch{}return false;}
export function mediaSnapshot(position,duration){return Number.isFinite(position)&&Number.isFinite(duration)&&position>=0&&duration>0?{position:Math.min(position,duration),duration}:null;}
export function protectedFlag(v){return v===true||v==='true';}
export async function boundedBody(response,limit){
 const declared=Number(response.headers.get('content-length')||0);
 if(declared>limit)throw Error('Response too large');
 // ReadableStream is available on Chromium 68, but certain TV network stacks expose no body reader.
 const reader=response.body&&typeof response.body.getReader==='function'?response.body.getReader():null;
 if(!reader){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>limit)throw Error('Response too large');return bytes;}
 const parts=[];let size=0,done=false;
 try{for(;;){const chunk=await reader.read();if(chunk.done){done=true;break;}const bytes=chunk.value;if(!bytes)continue;size+=bytes.byteLength;if(size>limit)throw Error('Response too large');parts.push(bytes);}
 const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.byteLength;}return result;
 }finally{if(!done)try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}
}
