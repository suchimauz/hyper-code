---
name: flow
description: Compute current attention gaps from source facts, review them at /gaps, and explicitly apply one revision-bound action with a durable verification receipt.
---
# Gaps / flow

Canonical declarations are **`$gap_<name>.ts`**, plain async functions anywhere in mounted `src/` or `.hyper/` roots. Namespace `flow` is the generic runner, not a workflow engine. Open **/gaps** (global navigation: **Gaps**) to see all current needs, source rules, actions and isolated check errors. GET calls preview only. Full-page GET and POST use Hyper's shared `{title, main}` layout contract with its global navigation/styles; no standalone shell. POST submits one flow/id/revision, rediscovers before apply, verifies afterwards and displays a receipt. No gaps table, private scheduler, notifications, medication schedule, task waits or automatic actions exist here.

Use `flow.list({})` for the aggregated list, `flow.reconcile({flow,mode:'preview'})`, or `mode:'explain', target:{id,revision}` for the current rationale. Apply requires an explicit target and current revision. A disappeared target or changed revision is `stale` without an action. Successful verification is `closed` only when the selected need disappeared; an effect such as a reminder can succeed while status remains `remains`. `verified` distinguishes actual verification from failures, `converged` means no remaining gaps following discovery. Apply errors and an initial pending attempt are stored in `flow.receipts`; a crash or failed receipt update leaves an indeterminate attempt, never a proven success.

## Cached left-navigation count

The shared **left quick-access rail** links to `/gaps` with a circular count only when positive. Layout and `/ui/gap-count` read `ctx.state.flow.countCache` only: no discovery during shared rendering. `flow.refreshCount({})` coalesces concurrent read-only `flow.list` previews with a five-minute attempt TTL; `{force:true}` bypasses TTL. Existing cron declaration `flow-count` refreshes every **5m** (immediate on first registration); the boot hook initializes the in-memory cache after restart. No new worker or scheduler is introduced. Form submit and apply routes refresh after an attempt; the shared SSE `flow.count` event redraws only the badge, with a five-minute cache-only browser poll as fallback. Source changes outside these routes appear on the next cron preview.

Only aggregate count/timestamps/freshness are retained, never gap payloads. Any isolated rule failure makes the whole aggregate incomplete: preserve the last complete count and mark its tooltip stale rather than publish a partial lower bound as a total. First failure leaves the badge hidden/unknown, not zero. Successful zero hides it. Overdue checks also carry a stale tooltip. The cache is process-local, resets on restart, and is optional when Flow is unloaded; declaration rescans preserve it. Cron must be enabled for unattended refresh (`CRON_WORKER=off` disables it). Private declarations remain outside this plugin and must keep preview read-only.

## Author a trusted declaration

Put private rules in `.hyper/myRules/$gap_intake.ts` (small project-local procedure) or a user plugin's `src/myRules/$gap_intake.ts` (substantial integration). Do not put personal health information into this official plugin. After adding/changing declarations, run `procs.dev.genTypes({})` and **`plugins.reload({})`**; `repl.load({name:'flow'})` reloads ordinary functions only, not custom declaration loaders. `flow.list` and apply also call `flow.refresh` to rescan declarations, including clearing removed last rules (the core boot skips loaders with zero entries). Import/invalid-export errors become isolated rule errors. The scanner loads src before .hyper, and later declarations override the same name. `$flow_` object/step declarations are deliberately not supported.

Template only — replace the fact/action procedures with your own trusted integration; this is not installed or auto-running:

```ts
// .hyper/myRules/$gap_intake.ts
export default async function(ctx:Context, session:Session|null, opts:types.flow.FlowRequest):Promise<types.flow.FlowOutput> {
  const fact = await ctx.fns.myFacts.readIntake({now:opts.now});
  const gaps:types.flow.Gap[] = fact.complete ? [] : [{
    id:`intake:${fact.id}`, revision:fact.revision,
    summary:'Intake is incomplete', will:'Open intake request',
  }];
  if(opts.mode==='preview') return {gaps};
  const gap=gaps.find(g=>g.id===opts.target.id && g.revision===opts.target.revision);
  if(!gap) throw new Error('Target changed');
  if(opts.mode==='explain') return {explanation:gap.summary};
  // This action must atomically recheck facts and use a unique business key.
  const effect=await ctx.fns.myFacts.openIntake({id:fact.id, revision:gap.revision, idempotencyKey:gap.id});
  return {effects:[{reference:effect.id}]};
}
```

The runner does not accept arbitrary action input. `id` and `revision` are nonempty bounded strings, and preview IDs must be unique within a rule. IDs describe stable business needs; revisions change when relevant facts/action semantics change. Single-action `will` is optional: absent means informational only. Preview/explain purity is a trusted-code contract, **not sandbox enforcement**. Explain uses the fresh preview rationale without invoking declaration explain. Apply is not a transaction spanning facts, external effects and receipts: the declaration/action owns atomic rechecks, authorization and idempotency under concurrent/repeated submissions. Never infer adherence or medical completion from a notification receipt. Discovery has no timeout sandbox; slow trusted rules delay the page. Receipts contain gap summaries: keep sensitive data minimal and use the host's access controls.

## Declaration-owned forms and structured receipts

A gap may return `form: {id, label, fields}` instead of legacy `will`. Supported fields are `datetime-local` (trusted IANA timezone, optional value and min) and optional bounded `text`. Defaults require explicit user submission and are not recorded facts. Preserve entered values on pre-claim validation errors. No client function name, executable code or source schema is accepted.

The native React Gaps surface renders declaration data. POST /gaps/submit accepts JSON, requires owner authorization, CSRF and explicit confirmation, and returns structured JSON. Invalid and ambiguous/nonexistent DST timestamps are rejected without effects. Ambiguous times require an explicit-offset recording path, not a guessed offset.

flow.submit refreshes declarations, rediscovers the exact target/revision/form schema, validates allowlisted fields and reserves a durable UUID-bound receipt before invoking the trusted declaration with {mode:'submit', now, target, action, values, submissionId}. Declarations return FlowOutput.receipt with status, message and optional errors/values. The declaration owns actual effects, atomic source rechecks, source-level idempotency and independent verification of closure. Do not infer medical completion from notifications or generic effect success.

Only runner validation before reservation unlocks correction with the same identity. Handler validation after claim is conservatively unconfirmed and never retryable. Completed identical-payload retries replay saved receipts; pending/interrupted and different-payload attempts never blindly rerun actions. Native feedback survives list refresh/card removal in-page; server receipts remain durable. Tests must use synthetic data and mocked effects, never live personal writes.

Compatibility residual: FlowOutput.html and historical stored HTML receipts remain supported as opaque compatibility data. Native UI extracts text only and labels these outcomes legacy; it never infers success or validation from markup. Source HTML renderer helpers were removed after auditing mounted roots, the runtime registry, dynamic declarations, tests and tool exposure; no production callers remained. Workspace .hyper/myhealthGaps/submitMedication emits structured receipts. No external capability implementation is changed or invoked by this cleanup.
