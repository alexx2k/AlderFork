import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedBody,cloudWriteAllowed,withinSeekRange,mediaSnapshot,protectedFlag} from '../src/auditPolicy.mjs';
test('native Response stream accepted at exact limit',async()=>{const r=new Response(new Uint8Array([1,2,3])); assert.deepEqual([...await boundedBody(r,3)],[1,2,3]); assert.equal(r.body.locked,false);});
test('native ReadableStream cancels when over budget',async()=>{let cancelled=false;const s=new ReadableStream({pull(c){c.enqueue(new Uint8Array([1,2]));},cancel(){cancelled=true;}});const r=new Response(s);await assert.rejects(()=>boundedBody(r,3),/Response too large/);assert.equal(cancelled,true);assert.equal(r.body.locked,false);});
test('native Response declares oversized body',async()=>{const r=new Response('test',{headers:{'content-length':'100'}});await assert.rejects(()=>boundedBody(r,2));assert.equal(r.bodyUsed,false);});
test('account verification and media snapshot',()=>{assert.equal(cloudWriteAllowed(true,'a',''),false);assert.equal(cloudWriteAllowed(true,'a','b'),false);assert.equal(cloudWriteAllowed(true,'a','a'),true);assert.deepEqual(mediaSnapshot(101,100),{position:100,duration:100});assert.equal(mediaSnapshot(1,Infinity),null);assert.equal(protectedFlag('true'),true);assert.equal(withinSeekRange({length:1,start:()=>10,end:()=>20},9),false);});
