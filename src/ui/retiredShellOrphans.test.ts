import { expect, test } from 'bun:test';

const retired = [
 '../auth/page.ts', '../auth/meBadge.ts', './resourceMonitor.ts', '../agent/effortPicker.ts',
 '../agent/$script_chat.js', ...['chatSearch','hotkeys','dictation','resources','spin-sync','wake-timer','tool-timer','quotaTip','codeBlocks','codemirror'].map(name=>`./$script_${name}.js`),
 '../mentions/$dock_mentions.ts','../update/$dock_update.ts','../auth/$dock_online.ts',
 '../webPush/$hook_ui.agentSettings.ts','./$point_agentSettings.ts',
 '../../plugins/flow/src/flow/$dock_gaps.ts',
];
test('retired shell assets and registration chains have no source', async()=>{
 for(const path of retired) expect(await Bun.file(new URL(path,import.meta.url)).exists(),path).toBe(false);
});
test('standalone documents use explicit compatibility assets, not retired shell assets',async()=>{
 const layout=await Bun.file(new URL('./layout.ts',import.meta.url)).text();
 for(const script of ['chatSearch','hotkeys','dictation','resources','spin-sync','wake-timer','tool-timer','quotaTip','codeBlocks','codemirror']) expect(layout).not.toContain(`/ui/${script}.js`);
 expect(layout).not.toContain('/agent/chat.js');
 for(const script of ['/ui/control.js','/procs/events/client.js']) expect(layout).toContain(script);
});
test('live presence and notification compatibility routes retain their domain implementations',async()=>{
 for(const path of ['../auth/$route_online_GET.ts','./live.ts','../webPush/savePreferences.ts','../webPush/$route_subscribe_POST.ts','../webPush/$route_unsubscribe_POST.ts','../webPush/notifyInput.ts','../webPush/notifyError.ts']) expect(await Bun.file(new URL(path,import.meta.url)).exists(),path).toBe(true);
});
