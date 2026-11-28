import {Unzlib,zlibSync} from 'fflate';
export function inflateWatched(value:string):Uint8Array{
 const input=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 if(input.length>100000)throw Error('Watched field too large');
 const pieces:Uint8Array[]=[];let size=0;
 const decoder=new Unzlib((chunk)=>{size+=chunk.length;if(size>12500)throw Error('Watched field too large');pieces.push(chunk);});
 for(let i=0;i<input.length;i+=256)decoder.push(input.subarray(i,i+256),i+256>=input.length);
 const bytes=new Uint8Array(size);let offset=0;for(const piece of pieces){bytes.set(piece,offset);offset+=piece.length;}return bytes;
}
export function deflateWatched(bytes:Uint8Array):string{return btoa(Array.from(zlibSync(bytes),b=>String.fromCharCode(b)).join(''));}
