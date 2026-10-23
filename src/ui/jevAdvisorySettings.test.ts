import { test, expect } from 'bun:test';
import render from './agentMetaSection';
import { renderCtx, spy } from './testRender.entry';
const flags = ["jevEvidenceEnabled","jevFileRankingEnabled","jevResultReviewEnabled","jevRiskReviewEnabled"];
test('independent advisory controls disclose external sharing and explicit invocation only', async () => {
 const toggle=spy('ui.toggle', (_c:any,_s:any,o:any)=>'<input name="'+o.name+'">');
 const ctx=await renderCtx(toggle.override);
 const html=render(ctx,null,{section:'settings',agent:{id:'test'} as any});
 for(const name of flags) {
  const control=toggle.calls.find((x:any)=>x.name===name)!;
  expect(control.enabled).toBe(false);
  for(const phrase of ['explicit advisory call','task text','external configured Jev provider','no automatic actions']) expect(html).toContain(phrase);
  expect(html).toContain('name="'+name.replace('Enabled','Present')+'" value="1"');
 }
 for(const selected of flags) {
  toggle.calls.length=0;
  render(ctx,null,{section:'settings',agent:{id:'test',[selected]:true} as any});
  for(const name of flags) expect(toggle.calls.find((x:any)=>x.name===name)!.enabled).toBe(name===selected);
 }
});
