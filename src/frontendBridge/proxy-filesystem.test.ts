import {test, expect} from 'bun:test';
import {resolve} from 'node:path';
import {mkdtemp, symlink, rm} from 'node:fs/promises';
import proxy from './proxy';

const root = resolve(import.meta.dir, '../..');
const session = {user:{id:'fixture'}} as any;
const request = (path:string) => proxy({fns:{procs:{project:{projectRoot:()=>root}}}} as any, session, {req:new Request('http://local/ui-lab/@fs/'+path.replace(/^\/+/, ''))});

test('filesystem proxy rejects project secrets, sibling prefixes, encoded paths and missing files', async()=>{
 for(const path of [root+'/.env', root+'/node_modules-other/file.js', root+'/node_modules/%2e%2e/.env', root+'/node_modules/nonexistent-file.js']) {
  expect((await request(path))?.status).toBe(403);
 }
});

test('filesystem proxy rejects dependency symlinks escaping node_modules',async()=>{
 const dir=await mkdtemp(root+'/node_modules/bridge-guard-test-');
 try {
  await symlink(root+'/package.json', dir+'/outside.json');
  expect((await request(dir+'/outside.json'))?.status).toBe(403);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('live filesystem proxy serves only canonical Vite dependency modules without cookies',async()=>{
 const response=await request(root+'/node_modules/vite/dist/client/env.mjs');
 expect(response?.status).toBe(200);
 expect(response?.headers.get('set-cookie')).toBeNull();
 expect(await response!.text()).toContain('globalThis');
});
