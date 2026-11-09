/** Return the owner-only native cron task snapshot.
 * @param opts.req Incoming task list request.
 */
export default async function(ctx:Context,_session:Session|null,opts:{/** Incoming task list request. */ req:Request}):Promise<Response>{return ctx.fns.frontendBridge.cronTasks({req:opts.req});}
