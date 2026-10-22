/**
 * Render project navigation and restored chat tabs with shared Hyper buttons and theme tokens.
 * Includes a compact mobile project link and ordered open-chat chooser with each chat's selected model logo from the same personal tabs.
 * Uses authorized summaries only; mobile counters include other project chats even outside personal open tabs, excluding the selected chat. Does not load transcripts or change persisted tab state.
 * @param opts.projects Visible projects with optional running and unread conversation counts.
 * @param opts.projectId Currently selected project identifier.
 * @param opts.activeId Currently selected conversation identifier.
 * @param opts.chats Active conversation summaries for the selected project.
 * @param opts.tabIds Personal ordered open conversation identifiers.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Authorized project summaries with activity counts. */
    projects: Array<{id:string;title:string;dir:string;host:string;archived?:boolean;runningCount?:number;unreadCount?:number}>;
    /** Currently selected project identifier. */ projectId?: string;
    /** Currently selected conversation identifier. */ activeId?: string;
    /** Active conversation summaries with optional custom SVG icons and model fallback, without transcripts. */
    chats: Array<{id:string;title:string;model?:string;icon?:string|null;runState:string;hasUnread?:boolean}>;
    /** Personal ordered open conversation identifiers. */ tabIds: string[];
}): Promise<{sidebar:string;tabs:string}> {
    const esc = (text:string) => ctx.fns.procs.ui.escape({text});
    const href = (id:string) => '/projects/view?projectId='+encodeURIComponent(id);
    const icon = (name:string) => '<i class="ph ph-'+name+'" aria-hidden="true"></i>';
    const action = (name:string, label:string, glyph:string, extra:Record<string,string> = {}, className='project-icon-button') => ctx.fns.procs.ui.button({
        action:'project-'+name, appearance:'plain', html:icon(glyph), title:label, ariaLabel:label,
        class:className, attrs:{'data-project-action':name,...extra},
    });
    const nav = (url:string, html:string, className:string, title:string, active=false) => ctx.fns.procs.ui.button({
        appearance:'plain', href:url, get:url, target:'#main', html, class:className, title,
        attrs:{'hx-push-url':'true','aria-current':active?'page':undefined},
    });
    const sidebar = '<div class="project-heading text-muted"><span>Projects</span><div class="flex items-center gap-1">'+ctx.fns.ui.popup({method:'ui.newAgentPopup',params:{},html:icon('plus'),attrs:'class="project-icon-button" title="New agent" aria-label="New agent"'})+nav('/projects/archive',icon('archive'),'project-icon-button','Archived projects')+'</div></div><div class="project-list">'+opts.projects.filter(p=>!p.archived).map(p=>{
        const selected=p.id===opts.projectId;
        const running=p.runningCount??0, unread=p.unreadCount??0;
        const status=(running?'<span class="project-running text-primary" role="status" aria-label="'+running+' running chats" title="'+running+' running chats"><i class="ph ph-spinner-gap animate-spin" aria-hidden="true"></i></span>':'')+(unread?'<span class="project-unread bg-success text-success-content" aria-label="'+unread+' unread chats" title="'+unread+' unread chats">'+unread+'</span>':'');
        return nav(href(p.id),icon(selected?'folder-open':'folder')+'<span class="project-title">'+esc(p.title)+'</span><span class="project-indicators">'+status+'</span>','project-row text-muted'+(selected?' selected text-base-content':''),(p.host?p.host+':':'')+p.dir,selected);
    }).join('')+'</div>';
    const chats=new Map(opts.chats.map(c=>[c.id,c]));
    const selectedProject=opts.projects.find(p=>p.id===opts.projectId);
    const openIds=opts.tabIds.filter(id=>chats.has(id));
    const projectRunning=opts.chats.some(c=>Boolean(c.runState && c.runState!=='idle'));
    const runningMark='<i class="ph ph-spinner-gap project-activity-spin" aria-hidden="true" data-spin-sync></i>';
    const projectActivity=projectRunning?'<span class="project-mobile-activity text-primary" role="img" aria-label="В проекте работают агенты" title="В проекте работают агенты">'+runningMark+'</span>':'';
    const otherChats=opts.chats.filter(c=>c.id!==opts.activeId);
    const otherUnread=otherChats.filter(c=>c.hasUnread).length;
    const mobileCounts=otherUnread?'<span data-project-other-unread="'+otherUnread+'" class="project-unread-dot bg-success" role="img" aria-label="Другие чаты с непрочитанным ответом: '+otherUnread+'" title="Другие чаты с непрочитанным ответом: '+otherUnread+'"></span>':'';
    const mobile=opts.projectId?'<div class="project-mobile-bar" data-project-id="'+esc(opts.projectId)+'">'+nav(href(opts.projectId),icon('folder-open')+'<span class="project-title">'+esc(selectedProject?.title||opts.projectId)+'</span>'+projectActivity,'project-mobile-name',selectedProject?.title||opts.projectId)+'<details class="project-mobile-switcher"><summary class="project-mobile-toggle" aria-label="Открытые чаты: '+openIds.length+(otherUnread?'; другие чаты с непрочитанным ответом: '+otherUnread:'')+'">'+mobileCounts+icon('chats')+'<span>Чаты '+openIds.length+'</span>'+icon('caret-down')+'</summary><nav class="project-mobile-menu bg-base-100 border border-ui-border shadow-lg" aria-label="Открытые чаты проекта">'+(openIds.length?openIds.map(id=>{
        const c=chats.get(id)!;
        const running=Boolean(c.runState && c.runState!=='idle');
        const status=c.hasUnread?'<span class="project-mobile-unread project-unread-dot bg-success" role="img" aria-label="Непрочитанный ответ" title="Непрочитанный ответ"></span>':'';
        const modelMark='<span class="project-mobile-model inline-flex shrink-0" title="'+esc(c.model||'Model')+'">'+ctx.fns.chat.icon({model:c.model,active:running,size:'sm'})+'</span>';
        return nav('/agent/'+encodeURIComponent(id),modelMark+status+'<span class="project-title">'+esc(c.title||id)+'</span>','project-mobile-chat'+(id===opts.activeId?' selected':''),c.title||id,id===opts.activeId);
    }).join(''):'<p class="project-mobile-empty text-muted">Нет открытых чатов</p>')+'</nav></details></div>':'';
    const tabs=opts.projectId?'<div class="project-tabs" data-project-id="'+esc(opts.projectId)+'" aria-label="Project chats"><div class="project-tab-list">'+openIds.map(id=>{
        const c=chats.get(id)!, selected=id===opts.activeId;
        const running=Boolean(c.runState && c.runState!=='idle');
        const status=ctx.fns.chat.icon({icon:c.icon,model:c.model,active:running,size:'sm'})+(c.hasUnread?'<span class="project-unread-dot bg-success" aria-label="Unread messages" title="New reply"></span>':'');
        return '<div class="project-tab'+(selected?' selected':'')+'">'+nav('/agent/'+encodeURIComponent(id),status+'<span class="project-title">'+esc(c.title||id)+'</span>','project-tab-link',c.title||id,selected)+action('close','Close tab '+(c.title||id)+' (does not archive)','x',{'data-chat-id':id},'project-icon-button project-close')+'<details class="project-tab-menu">'+ctx.fns.procs.ui.button({element:'summary',appearance:'plain',html:icon('dots-three'),ariaLabel:'Chat actions',title:'Chat actions',class:'project-icon-button'})+'<div class="project-menu bg-base-100 border border-ui-border shadow-lg">'+ctx.fns.procs.ui.button({action:'project-archive',appearance:'plain',html:icon('archive')+'<span>Archive chat</span>',class:'project-menu-item',attrs:{'data-project-action':'archive','data-chat-id':id}})+'</div></details></div>';
    }).join('')+'</div><div class="project-tab-tools">'+ctx.fns.ui.popup({method:'ui.newAgentPopup',params:{projectId:opts.projectId},html:icon('plus'),attrs:'class="project-icon-button" title="New independent chat" aria-label="New independent chat"'})+nav(href(opts.projectId)+'&list=1',icon('chats'),'project-icon-button','All project chats')+action(selectedProject?.archived?'restore-project':'archive-project',selectedProject?.archived?'Разархивировать проект':'Архивировать проект',selectedProject?.archived?'arrow-u-up-left':'archive',{'data-project-id':opts.projectId,'data-project-title':selectedProject?.title||opts.projectId})+'</div></div>':'';
    // The phone strip loads the same read-only account overview as desktop; no model controls.
    const usage = opts.projectId ? '<button type="button" class="mobile-usage-strip" data-mobile-usage-open aria-haspopup="dialog" aria-expanded="false" aria-label="Аккаунты и лимиты"><span data-mobile-usage-items><span class="mobile-usage-placeholder">Загрузка…</span></span><span data-mobile-usage-count aria-hidden="true">…</span></button>' : '';
    return {sidebar,tabs:mobile+usage+tabs};
}
