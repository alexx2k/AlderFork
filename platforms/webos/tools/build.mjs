import { build, context } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PNG } from 'pngjs';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const android = path.resolve(root, '../../app/src/main');
const dist = path.join(root, 'dist');
await rm(dist, {recursive:true, force:true});
await cp('public', dist, {recursive:true});
await mkdir(path.join(dist,'assets'), {recursive:true});
await cp(path.join(android,'assets/fonts/inter.ttf'), path.join(dist,'assets/inter.ttf'));
// Keep the source font notice with the package; Android's font tree is the source of truth.
await cp('notices/Inter-OFL.txt', path.join(dist,'assets/Inter-OFL.txt'));
await cp('../../LICENSE', path.join(dist,'LICENSE'));
const icon = PNG.sync.read(await readFile(path.join(android,'res/drawable-nodpi/tarn_launcher_icon.png')));
for (const [size,name] of [[80,'icon.png'],[130,'largeIcon.png']]) {
  const out = new PNG({width:size,height:size});
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const i=(Math.min(icon.height-1,Math.floor((y+.5)*icon.height/size))*icon.width+Math.min(icon.width-1,Math.floor((x+.5)*icon.width/size)))*4;
    icon.data.copy(out.data,(y*size+x)*4,i,i+4);
  }
  await writeFile(path.join(dist,'assets',name),PNG.sync.write(out));
}
const manifest=JSON.parse(await readFile('public/appinfo.json','utf8'));
const pkg=JSON.parse(await readFile('package.json','utf8'));
if(manifest.version!==pkg.version) throw Error('Manifest and package versions differ');
const options={entryPoints:['src/main.tsx'],bundle:true,format:'iife',target:'chrome68',platform:'browser',outfile:'dist/app.js',define:{'process.env.NODE_ENV':'"production"'},minify:true,sourcemap:false,loader:{'.css':'css'},logLevel:'info'};
if(process.argv.includes('--serve')){
 const ctx=await context(options);
 await ctx.watch();
 const server=await ctx.serve({servedir:dist,host:'127.0.0.1',port:4173});
 console.log('Tarn preview: http://127.0.0.1:'+server.port);
} else await build(options);
