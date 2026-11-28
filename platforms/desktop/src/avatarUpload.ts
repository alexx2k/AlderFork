import {avatarCrop,MAX_AVATAR_BYTES,validLocalAvatar} from './customisation.mjs';
export async function prepareAvatar(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size<1||file.size>MAX_AVATAR_BYTES)throw Error('Choose a JPEG, PNG or WebP image up to 8 MB.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();
  await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error('This image could not be decoded.'));image.src=url;});
  const crop=avatarCrop(image.naturalWidth,image.naturalHeight),canvas=document.createElement('canvas');canvas.width=crop.size;canvas.height=crop.size;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image processing is unavailable.');
  ctx.fillStyle='#0b1624';ctx.fillRect(0,0,crop.size,crop.size);ctx.drawImage(image,crop.x,crop.y,crop.side,crop.side,0,0,crop.size,crop.size);
  const data=canvas.toDataURL('image/jpeg',.85);if(!validLocalAvatar(data))throw Error('Image could not be saved.');return data;
 }finally{URL.revokeObjectURL(url);}
}
