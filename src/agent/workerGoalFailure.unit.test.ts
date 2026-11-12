import { test, expect } from 'bun:test';
import worker from './workerLoop';

// Offline claim/finalize harness: no database, migration, provider, or live worker.
async function scenario(kind: string, retries = 0) {
    let claimed = false, token = '', inTx = false;
    let consumeAttempts = 0, modelRuns = 0; const parks: any[] = [], finalizes: any[] = [];
    const order: string[] = [], transitions: any[] = [];
    const agent: any = { id: 'goal-failure-test', currentJobId: null };
    const ctx: any = { state: { agent: { [agent.id]: agent }, agentRunRetries: { [agent.id]: retries } }, fns: {} };
    const noop = async () => {};
    const finish = () => { ctx.state.workerLoopRunning = false; ctx.state.workerWakePending = true; };
    ctx.fns = {
        goal: { delegationConsume: async () => {
                consumeAttempts++; expect(inTx).toBe(false);
                if(kind==='blocked')return {status:'blocked',reason:'missing reservation'};
                if(kind==='lock' && consumeAttempts===1)throw Object.assign(new Error('busy'),{code:'55P03'});
                if(kind==='lock-always')throw Object.assign(new Error('busy'),{code:'55P03'});
                if(kind==='lock-text')throw new Error('55P03 lock unavailable');
                if(kind==='descendant'||kind==='capture-blocked'||kind.startsWith('grant-'))return {status:'bound',authority:{sourceAgentId:agent.id,rootAgentId:'root',goalId:'g',sourceRunId:token,capabilityId:'cap',authorizedThroughIdx:0}};
                return { status: 'absent' };
            },
            delegationLock: async () => { expect(inTx).toBe(true); if(kind.startsWith('grant-'))order.push('root-source-lock'); },
            delegationSettle: async (o:any) => { expect(inTx).toBe(true); expect(o.sourceRunToken).toBe(token); expect(o.checkpointId).toBe('exact-final'); expect(o.sequence).toBe(9); order.push('settle-'+o.outcome); if(kind==='grant-rollback')throw new Error('settlement failed'); },
            enabled: async () => kind !== 'disabled',
            continuationValidateStart: async () => ({ action: 'run', humanPending: true, suppressIdxs: [], continuationIdxs: [] }),
            lifecycleFailure: async (opts: any) => { expect(inTx).toBe(true); order.push('failure'); transitions.push(opts); return { changed: true }; },
        },
        events: { emitAgentsChanged: noop }, settings: { getNumber: async () => 0 },
        session: { syncAgentState: noop, appendErrorEvent: noop },
        input: { expireDue: async () => 0 },
        procs: { env: { mode: () => 'test' }, log: { warn: noop }, db: {
            select: async ({ sql, params }: any) => {
                if (sql.startsWith('WITH stale')) return [];
                if (sql.includes('RETURNING id') && sql.includes("run_state       = 'running'")) {
                    if (claimed) return []; claimed = true; token = params[2]; return [{ id: agent.id }];
                }
                if(sql.startsWith('SELECT m.idx'))return [{idx:0,message_type:null}];
                if (sql.startsWith('SELECT run_token, run_state, stopped_at')) return [{ run_token: token, run_state: 'running', stopped_at: null }];
                if (sql.startsWith('SELECT COALESCE(MAX')) return [{ max_idx: 0 }];
                if (sql.startsWith('SELECT next_run_at FROM agents')) return [{next_run_at:kind==='grant-human'?12345:null}];
                if (sql.startsWith('SELECT LEAST')) { finish(); return [{ next: Date.now() }]; }
                return [];
            },
            run: async ({ sql, params }: any) => {
                if(sql.includes('last_error = ?, updated_at = ?')){parks.push({sql,params});return {changes:1,rows:[]};}
                if (sql.includes('RETURNING next_run_at')) { finalizes.push({sql,params}); order.push('revoke'); return { changes: kind === 'stale'||kind==='grant-stale' ? 0 : 1, rows: [] }; }
                if(sql.includes('last_processed_msg_idx = CASE WHEN ? THEN')) { order.push('cursor-schedule'); expect(params[1]).toBeLessThanOrEqual(0); }
                return { changes: 1, rows: [] };
            },
            transaction: async ({ fn }: any) => { inTx = true; try { const value = await fn(); order.push('commit'); return value; } catch (error) { order.push('rollback'); throw error; } finally { inTx = false; } },
        } },
        agent: { instanceId: () => 'test-instance',
            recoverOrphanedCompactions: noop, deliverWakes: noop, pollWatches: noop, pollTriggers: noop,
            wakeWorker: () => { ctx.state.workerWakePending = true; }, autoCompactIfNeeded: noop, parkOnUsageLimit: noop,
            run: async ({ onGoalBinding, onGoalFinalCheckpoint, goalAuthority }: any) => {
                modelRuns++;
                if(kind==='descendant'||kind==='capture-blocked')expect(Object.isFrozen(goalAuthority)).toBe(true);
                if(kind==='capture-blocked')return {goalAdmissionBlocked:true};
                if(kind.startsWith('grant-')) {
                    if(kind!=='grant-unknown')onGoalFinalCheckpoint(Object.freeze({sourceAgentId:agent.id,sourceRunToken:token,goalId:'g',capabilityId:'cap',checkpointId:'exact-final',sequence:9,drained:true}));
                    if(kind==='grant-retry'||kind==='grant-unknown')throw Object.assign(new Error('network'),{failure:{kind:'transient',retryable:true,message:'network'}});
                    return {consumedUserIdx:6};
                }
                if (!['absent', 'setup'].includes(kind)) onGoalBinding(Object.freeze({ goalId: 'captured-goal', runToken: kind === 'wrong-token' ? 'wrong' : token }));
                // A later callback cannot replace the claim's first immutable identity.
                if (kind === 'replacement') onGoalBinding({ goalId: 'replacement-goal', runToken: token });
                order.push('accounting');
                if (kind === 'success') return {};
                if (kind === 'abort') throw new DOMException('aborted', 'AbortError');
                const error: any = new Error('UsageLimitExceeded is merely text');
                error.failure = { kind: kind === 'quota' ? 'usage_limit' : kind === 'transient' ? 'transient' : 'fatal', retryable: kind === 'transient', message: error.message };
                throw Object.freeze(error);
            },
        },
        webPush: { recallStaleError: noop, recordFailure: async () => ({ recorded: false }), notifyError: noop },
    };
    await worker(ctx, null, {});
    return { transitions, order, token, consumeAttempts, modelRuns, parks, finalizes };
}
for (const kind of ['fatal', 'replacement', 'quota']) test(`terminal Goal finalization: ${kind}`, async () => {
    const r = await scenario(kind);
    expect(r.transitions).toEqual([{ agentId: 'goal-failure-test', expectedGoalId: 'captured-goal', expectedRunToken: r.token, reason: kind === 'quota' ? 'usage_limit' : 'terminal_error', terminal: true, codexPlanMode: false }]);
    expect(r.order).toEqual(['accounting', 'failure', 'revoke', 'commit']);
});
for (const kind of ['absent', 'setup', 'disabled', 'wrong-token', 'abort', 'success']) test(`no Goal failure transition: ${kind}`, async () => {
    const r = await scenario(kind); expect(r.transitions).toEqual([]); expect(r.order).toEqual(['accounting', 'revoke']);
});
// Model retries live in run(); a transient error reaching the worker is terminal.
test('transient failure escaping run transitions only after final accounting', async () => { const r = await scenario('transient'); expect(r.transitions).toHaveLength(1); expect(r.order).toEqual(['accounting', 'failure', 'revoke', 'commit']); });
test('lost finalization token rolls back the Goal transaction', async () => { const r = await scenario('stale'); expect(r.order).toEqual(['accounting', 'failure', 'revoke', 'rollback']); });

for(const kind of ['blocked','lock-always','lock-text'])test(`consume ${kind} parks without model or fallback`,async()=>{
 const r=await scenario(kind);expect(r.modelRuns).toBe(0);expect(r.transitions).toEqual([]);expect(r.parks).toHaveLength(1);
 expect(r.parks[0].sql).toContain('next_run_at = NULL');expect(r.parks[0].sql).not.toContain('last_processed_msg_idx');expect(r.parks[0].params.at(-1)).toBe(r.token);
 expect(r.consumeAttempts).toBe(kind==='lock-always'?2:1);
});
test('structured lock contention retries same claim once',async()=>{const r=await scenario('lock');expect(r.consumeAttempts).toBe(2);expect(r.modelRuns).toBe(1);});
test('descendant provider failure never transitions root',async()=>{const r=await scenario('descendant');expect(r.modelRuns).toBe(1);expect(r.transitions).toEqual([]);});
test('descendant nonbound capture cannot trigger root terminal callback',async()=>{const r=await scenario('capture-blocked');expect(r.transitions).toEqual([]);expect(r.order).toEqual(['cursor-schedule','revoke','commit']);expect(r.modelRuns).toBe(1);expect(r.finalizes[0].params[0]).toBeNull();expect(r.finalizes[0].sql).not.toContain('last_processed_msg_idx');});
test('task finalization locks root first, settles exact receipt before revoke and restores human schedule',async()=>{const r=await scenario('grant-human');expect(r.order).toEqual(['root-source-lock','cursor-schedule','settle-terminal','revoke','commit']);expect(r.finalizes[0].params[0]).toBe(12345);});
test('transient task failure never settles a retry grant; unknown usage never renews',async()=>{const r=await scenario('grant-retry');expect(r.order).toEqual(['root-source-lock','cursor-schedule','revoke','commit']);expect(r.finalizes[0].params[0]).toBeNull();const u=await scenario('grant-unknown');expect(u.order).toEqual(['root-source-lock','cursor-schedule','revoke','commit']);expect(u.finalizes[0].params[0]).toBeNull();});
for(const kind of ['grant-rollback','grant-stale'])test(`task finalization ${kind} rolls back whole settlement`,async()=>{const r=await scenario(kind);expect(r.order.at(-1)).toBe('rollback');expect(r.order).not.toContain('commit');});
