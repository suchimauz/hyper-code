import { describe, test, expect, mock, spyOn, afterEach } from 'bun:test';
import readSelected from './readSelected';
import importSelected from './importSelected';

afterEach(()=>mock.restore());
const slot={instance:'another-host',account:'another_slot'};
const tokens={access:'access',refresh:'refresh',accountId:'id',expires:Date.now()+600000};
const session={user:{id:'owner',role:'owner'}} as any;

describe('selected credential import',()=>{
 test('reads explicit instance and passes account as Python argv without SSH',async()=>{
  const requireOwner=mock(async()=>{});const connection=mock(async()=>({bin:'ssh',args:[],host:'host'}));
  const spawn=spyOn(Bun,'spawn').mockImplementation((()=>({stdout:new Response(JSON.stringify(tokens)).body!,exited:Promise.resolve(0),kill:mock(()=>{})})) as any);
  const consume=mock(async()=>{});
  await readSelected({fns:{sshAccount:{requireOwner},sshInstance:{connection}}} as any,session,{...slot,consume});
  expect(requireOwner).toHaveBeenCalledTimes(1);expect(connection).toHaveBeenCalledWith({name:slot.instance});expect(consume).toHaveBeenCalledWith(tokens);
  const command=(spawn.mock.calls[0][0] as string[]).at(-1)!;
  expect(command).toContain('sys.argv[1]');expect(command.endsWith(" 'another_slot'")).toBe(true);
 });
 test('rejects traversal and shell syntax before connection lookup',async()=>{
  const connection=mock(async()=>{throw Error('unexpected connection')});
  const ctx={fns:{sshAccount:{requireOwner:async()=>{}},sshInstance:{connection}}} as any;
  for(const account of ['../test',"a';id",'-option','a/b','a'.repeat(41)]) await expect(readSelected(ctx,session,{...slot,account,consume:async()=>{}})).rejects.toThrow('Invalid Codex account');
  await expect(readSelected(ctx,session,{...slot,instance:'bad host',consume:async()=>{}})).rejects.toThrow('Invalid Codex account');expect(connection).not.toHaveBeenCalled();
 });
 test('keeps owner gate before reading credentials',async()=>{
  await expect(readSelected({fns:{sshAccount:{requireOwner:async()=>{throw Error('denied')}}}} as any,null,{...slot,consume:async()=>{}})).rejects.toThrow('denied');
 });
 test('passes selected slot through import and saves only after probe',async()=>{
  const events:string[]=[];const migrate=mock(async()=>{events.push('save')});const read=mock(async(opts:any)=>{await opts.consume(tokens)});const requireOwner=mock(async()=>{});
  const ctx={fns:{sshAccount:{requireOwner},codexAccount:{binding:async()=>({name:'key'})},codexTunnel:{scopedService:async()=>({exclusive:(fn:any)=>fn(),runtime:{migrate}}),encryptedStore:()=>({read:async()=>null}),readSelected:read,identity:()=>{},openProduction:async()=>({port:1,signal:undefined,close:async()=>{}})},codexSocksIsolated:{request:async()=>{events.push('probe');return new Response('{}')}}}} as any;
  expect(await importSelected(ctx,session,{...slot,confirmedUnused:true})).toEqual({ok:true,...slot,mode:'socks'});
  expect(read.mock.calls[0][0]).toMatchObject(slot);expect(requireOwner).toHaveBeenCalledTimes(1);expect(events).toEqual(['probe','save']);expect(migrate).toHaveBeenCalledWith({...slot,provider:'codex'},tokens);
 });
 test('import rejects missing owner, confirmation and invalid selection before services',async()=>{
  const ctx={fns:{sshAccount:{requireOwner:async()=>{}}}} as any;
  await expect(importSelected(ctx,null,{...slot,confirmedUnused:true})).rejects.toThrow('Authenticated owner required');
  await expect(importSelected(ctx,session,{...slot,confirmedUnused:false as any})).rejects.toThrow('Explicit unused-slot confirmation');
  await expect(importSelected(ctx,session,{...slot,account:'../x',confirmedUnused:true})).rejects.toThrow('Invalid Codex account');
 });
});
