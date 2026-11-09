import { useEffect, useState } from 'react';
import { Button, Panel, Stack, requestJson, type ExtensionViewProps, type UiExtension } from '@hyper/ui';

type Snapshot = { csrfToken: string; settings: { status_line: string; status_line_every: number; status_line_mode: 'global'|'custom'|'off'; auto_compact_window_percent: number|null; run_state: string }; plan: { title: string; pausedAt?: number; tasks: { id: string; title: string; instructions?: string; status: string }[] } | null };
type GoalSnapshot = { enabled: boolean; csrfToken?: string; owner?: {runToken: string|null; stoppedAt: number|null}; goal?: {goalId: string; revision: number; objective: string; status: string; tokenBudget: number|null; tokensUsed: number} | null };

function AgentMeta({context}: ExtensionViewProps) {
  // Remount all drafts on selection changes; never submit a previous agent's draft.
  return context.agentId ? <MetaEditor key={context.agentId} id={context.agentId} readOnly={context.readOnly}/> : <p>Select a chat to inspect its settings.</p>;
}
function MetaEditor({id,readOnly}: {id:string;readOnly:boolean}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [goal,setGoal]=useState<GoalSnapshot|null>(null);
  const [error,setError]=useState(''); const [notice,setNotice]=useState(''); const [busy,setBusy]=useState(false);
  const [mode,setMode]=useState('global'); const [text,setText]=useState(''); const [every,setEvery]=useState('1'); const [percent,setPercent]=useState('');
  const [objective,setObjective]=useState(''); const [budget,setBudget]=useState('');
  const path=`/agent/${encodeURIComponent(id)}`;
  function apply(s:Snapshot){setSnapshot(s);setMode(s.settings.status_line_mode??'global');setText(s.settings.status_line??'');setEvery(String(s.settings.status_line_every??1));setPercent(s.settings.auto_compact_window_percent==null?'':String(s.settings.auto_compact_window_percent));}
  function applyGoal(s:GoalSnapshot){setGoal(s);setObjective(s.goal?.objective??'');setBudget(s.goal?.tokenBudget==null?'':String(s.goal.tokenBudget));}
  useEffect(()=>{const abort=new AbortController(); requestJson<Snapshot>(`${path}/meta-settings`,{signal:abort.signal}).then(apply).catch(e=>{if(!abort.signal.aborted)setError(String(e.message??e));});requestJson<GoalSnapshot>(`${path}/persistent-goal`,{signal:abort.signal}).then(applyGoal).catch(e=>{if(!abort.signal.aborted)setError(String(e.message??e));});return()=>abort.abort();},[path]);
  async function save(body:object){if(readOnly||busy||!snapshot)return;setBusy(true);setError('');setNotice('');try{apply(await requestJson<Snapshot>(`${path}/meta-settings`,{method:'POST',csrfToken:snapshot.csrfToken,body}));setNotice('Settings saved.');}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function changeGoal(action:'create'|'edit'|'pause'|'resume'){
    if(readOnly||busy||!goal?.enabled||!goal.owner||!goal.csrfToken)return;
    if((action==='create'||action==='edit')&&(!objective.trim()||(budget!==''&&(!Number.isSafeInteger(Number(budget))||Number(budget)<=0)))){setError('Enter an objective and a positive integer token budget, or leave the budget empty.');return;}
    setBusy(true);setError('');setNotice('');try{
      await requestJson(`${path}/persistent-goal`,{method:'POST',csrfToken:goal.csrfToken,body:{action,expectedGoalId:goal.goal?.goalId??null,expectedRevision:goal.goal?.revision??null,expectedRunToken:goal.owner.runToken,csrfToken:goal.csrfToken,...(action==='create'||action==='edit'?{objective,tokenBudget:budget===''?null:Number(budget)}:{}),...(action==='resume'?{expectedStoppedAt:goal.owner.stoppedAt,resumeRequestId:crypto.randomUUID()}: {})}});
      applyGoal(await requestJson<GoalSnapshot>(`${path}/persistent-goal`));setNotice('Goal updated.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  const disabled=readOnly||busy;
  return <Stack gap={4}>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <Button disabled={busy} onClick={async()=>{setError('');try{apply(await requestJson<Snapshot>(`${path}/meta-settings`));applyGoal(await requestJson<GoalSnapshot>(`${path}/persistent-goal`));}catch(e){setError(e instanceof Error?e.message:String(e));}}}>Refresh</Button>
    {!snapshot?<p role="status">Loading settings…</p>:<>
      <Panel title="Status"><p>{snapshot.settings.run_state}</p>{readOnly&&<p>Read-only view</p>}</Panel>
      <Panel title="Goal">
        {!goal?<p>Goal unavailable</p>:!goal.enabled?<p>Persistent goals are disabled.</p>:<Stack gap={2}>
          {goal.goal&&<p>{goal.goal.status} · {goal.goal.tokensUsed.toLocaleString()} tokens used</p>}
          <label>Objective<textarea value={objective} disabled={disabled} onChange={e=>setObjective(e.target.value)} rows={3}/></label>
          <label>Token budget (optional)<input type="number" min="1" step="1" value={budget} disabled={disabled} onChange={e=>setBudget(e.target.value)}/></label>
          <Button disabled={disabled} onClick={()=>changeGoal(goal.goal?'edit':'create')}>{goal.goal?'Save objective':'Create paused goal'}</Button>
          {goal.goal&&<Button disabled={disabled} onClick={()=>changeGoal(goal.goal?.status==='active'?'pause':'resume')}>{goal.goal.status==='active'?'Pause goal':'Resume goal'}</Button>}
          <p>Resume starts work. Conflicts require refreshing and reviewing the current goal.</p>
        </Stack>}
      </Panel>
      <Panel title="Plan">{snapshot.plan?<><h3>{snapshot.plan.title}</h3>{snapshot.plan.pausedAt&&<p>Paused</p>}<ol>{snapshot.plan.tasks.map(t=><li key={t.id}><strong>{t.title}</strong> — {t.status}{t.instructions&&<details><summary>Instructions</summary><p style={{whiteSpace:'pre-wrap'}}>{t.instructions}</p></details>}</li>)}</ol><p>Ask the agent to update this plan in chat.</p></>:<p>No plan yet.</p>}</Panel>
      <Panel title="Prompt injection"><form onSubmit={e=>{e.preventDefault();void save({action:'status',mode,text,every:Number(every)});}}><fieldset disabled={disabled}><Stack gap={2}>
        <label>Mode<select value={mode} onChange={e=>setMode(e.target.value)}><option value="global">Inherit global</option><option value="custom">Custom</option><option value="off">Off</option></select></label>
        <label>Instruction<textarea maxLength={500} value={text} onChange={e=>setText(e.target.value)} rows={3}/></label>
        <label>Every N turns<input type="number" min="1" max="100" step="1" required value={every} onChange={e=>setEvery(e.target.value)}/></label><Button type="submit">Save prompt settings</Button>
      </Stack></fieldset></form></Panel>
      <Panel title="Context"><form onSubmit={e=>{e.preventDefault();void save({action:'context',percent:percent===''?null:Number(percent)});}}><fieldset disabled={disabled}><Stack gap={2}><label>Automatic compaction threshold (%)<input type="number" min="15" max="95" value={percent} onChange={e=>setPercent(e.target.value)}/></label><p>Leave empty to inherit the global threshold. Saving does not compact the conversation.</p><Button type="submit">Save context settings</Button></Stack></fieldset></form></Panel>
    </>}
  </Stack>;
}
export const agentMetaExtension: UiExtension = {id:'agent-meta',apiVersion:1,panels:[{id:'overview',title:'Overview',component:AgentMeta}]};
