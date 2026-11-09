import { expect, test } from 'bun:test';
import appendUserMessage from './appendUserMessage';
import recordEvent from '../commands/recordEvent';
import markFunctionRag from '../agent/markFunctionRag';

function fixture() {
    const events: any[] = [];
    const messages: any[] = [];
    const ctx: any = { fns: {
        auth: { actorId: async () => 'user:owner' },
        agent: { renderEventHtml: async () => { throw new Error('ordinary events must not render legacy HTML'); } },
        session: {
            appendMessage: async ({message}: any) => { messages.push(message); return {idx: 7}; },
            appendEvent: async ({event}: any) => { events.push(event); },
            getEvents: async () => events,
            replaceEventAt: async ({event}: any) => { events[0] = event; return {updated: true}; },
            syncAgentState: async () => {},
        },
        procs: { events: { refresh: () => {} } },
    } };
    return { ctx, events, messages };
}

test('user event retains model content, author, attachments and structured peer metadata without a renderer', async () => {
    const {ctx, events, messages} = fixture();
    const extra = { attachments: [{id: 'upload'}], agentMessage: {from: 'peer', body: 'hello'} };
    await appendUserMessage(ctx, null, {id: 'a', text: 'hello', author: 'agent:peer', ts: 12, eventExtra: extra});
    expect(messages).toEqual([{role: 'user', content: 'hello', author: 'agent:peer'}]);
    expect(events).toEqual([{...extra, type: 'user', text: 'hello', actor: 'agent:peer', messageIdx: 7, ts: 12}]);
});

test('command events append structured display fields without model turns or generated HTML', async () => {
    const {ctx, events, messages} = fixture();
    await recordEvent(ctx, null, {agentId: 'a', type: 'command_result', commandName: 'plan', commandText: '/plan work', requestId: 'request', operationId: 'operation', status: 'completed', text: 'Plan ready', result: {ready: true}});
    expect(messages).toEqual([]);
    expect(events[0]).toMatchObject({type: 'command_result', argsText: 'work', text: 'Plan ready', status: 'completed', result: {ready: true}});
    expect(events[0].html ?? '').toBe('');
});

test('RAG metadata refresh preserves historical HTML rather than regenerating or deleting it', async () => {
    const {ctx, events} = fixture();
    events.push({idx: 3, type: 'user', messageIdx: 7, text: 'hello', html: '<p>historical content</p>'});
    await markFunctionRag(ctx, null, {agent: {id: 'a'} as any, messageIdx: 7, functions: [], injected: 'metadata'});
    expect(events[0].html).toBe('<p>historical content</p>');
    expect(events[0].functionRag.injected).toBe('metadata');
});
