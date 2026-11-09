import {describe,test,expect} from 'bun:test';
import rawGuard from './authorizeUi';
const authorize = (ctx: any, session: any, opts: any) => { ctx.fns.auth.currentUser = async () => ({required: true, user: session?.user ?? null}); return rawGuard(ctx, session, opts); };
import share from '../api/$route_v1_news_$id_share_POST';
import reader from './$route_reader_at_GET';
import rss from '../../../rss/src/rss/browserData';
const owner:any={user:{role:'owner'}};
const req=(body:object={})=>new Request('http://localhost/rss/add',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':'ok'},body:JSON.stringify(body)});
describe('native news and RSS boundaries',()=>{
 test('owner and cookie CSRF required before writes',async()=>{const ctx:any={fns:{auth:{verifyCsrf:async()=>false}}};expect((await authorize(ctx,null,{req:req()}))?.status).toBe(401);expect((await authorize(ctx,{user:{role:'viewer'}} as any,{req:req()}))?.status).toBe(403);expect((await authorize(ctx,owner,{req:req()}))?.status).toBe(403);});
 test('external share requires explicit confirmation; no dispatch otherwise',async()=>{let calls=0;const ctx:any={fns:{news:{authorizeUi:async()=>null,share:async()=>{calls++;return{};}}}};const r=await share(ctx,owner,{req:req({target:'telegram',destination:'123'}),params:{id:'a'}});expect(r.status).toBe(400);expect(calls).toBe(0);});
 test('RSS load never executes without confirmation',async()=>{let calls=0;const ctx:any={fns:{news:{authorizeUi:async()=>null},rss:{loadAll:async()=>{calls++;return[];}}}};expect((await rss(ctx,owner,{req:req({action:'load-all'})})).status).toBe(400);expect(calls).toBe(0);});
 test('reader bookmarks redirect without reading or mutating',async()=>{const r=await reader({} as any,null,{req:new Request('http://localhost/news/reader/at?id=a'),params:{}});expect(r.status).toBe(303);expect(r.headers.get('location')).toContain('extension%3Anews%2Foverview');expect(r.headers.get('location')).toContain('id=a');});
});
