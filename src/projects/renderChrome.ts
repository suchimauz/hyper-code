/**
 * Render project navigation and restored chat tabs with shared Hyper buttons and theme tokens.
 * Keeps desktop tabs unchanged and separates project management from the mobile open-chat chooser.
 * Renders inert dialog templates consumed by projects/navigation.js, with authorized project actions and 44px phone controls.
 * Uses authorized summaries only; mobile counters include other project chats even outside personal open tabs, excluding the selected chat. Does not load transcripts or change persisted tab state.
 * @param opts.projects Visible projects with optional running and unread conversation counts.
 * @param opts.projectId Currently selected project identifier.
 * @param opts.activeId Currently selected conversation identifier.
 * @param opts.chats Active conversation summaries for the selected project.
 * @param opts.tabIds Personal ordered open conversation identifiers.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** Authorized project summaries with activity counts. */
    projects: Array<{id:string;title:string;dir:string;host:string;icon?:string|null;archived?:boolean;runningCount?:number;unreadCount?:number}>;
    /** Currently selected project identifier. */ projectId?: string;
    /** Currently selected conversation identifier. */ activeId?: string;
    /** Active conversation summaries with optional custom SVG icons and model fallback, without transcripts. */
    chats: Array<{id:string;title:string;model?:string;icon?:string|null;runState:string;teamRunningCount?:number;hasUnread?:boolean;canArchive?:boolean;archiveBlockedReason?:'busy'|'queued'|'scheduled'}>;
    /** Personal ordered open conversation identifiers. */ tabIds: string[];
}): Promise<{sidebar:string;tabs:string}> {
    const esc = (text:string) => ctx.fns.procs.ui.escape({text});
    const href = (id:string) => '/projects/view?projectId='+encodeURIComponent(id);
    const icon = (name:string) => '<i class="ph ph-'+name+'" aria-hidden="true"></i>';
    const projectLogo = (p:{icon?:string|null}|undefined, selected=false) => p?.icon ? '<img class="project-logo" width="20" height="20" alt="" src="data:image/svg+xml;base64,'+Buffer.from(p.icon).toString('base64')+'">' : icon(selected?'folder-open':'folder');
    const action = (name:string, label:string, glyph:string, extra:Record<string,string> = {}, className='project-icon-button') => ctx.fns.procs.ui.button({
        action:'project-'+name, appearance:'plain', html:icon(glyph), title:label, ariaLabel:label,
        class:className, attrs:{'data-project-action':name,...extra},
    });
    const nav = (url:string, html:string, className:string, title:string, active=false) => ctx.fns.procs.ui.button({
        appearance:'plain', href:url, get:url, target:'#main', html, class:className, title,
        attrs:{'hx-push-url':'true','aria-current':active?'page':undefined},
    });
    const sidebar = '<div class="project-heading text-muted"><span>Проекты</span><div class="flex items-center gap-1">'+nav('/projects/archive',icon('archive'),'project-icon-button','Архив проектов')+'</div></div><div class="project-list">'+opts.projects.filter(p=>!p.archived).map(p=>{
        const selected=p.id===opts.projectId;
        const running=p.runningCount??0, unread=p.unreadCount??0;
        const status=(running?'<span class="project-running text-primary" role="status" aria-label="'+running+' running chats" title="'+running+' running chats"><i class="ph ph-spinner-gap animate-spin" aria-hidden="true"></i></span>':'')+(unread?'<span class="project-unread project-unread-badge" aria-label="'+unread+' unread chats" title="'+unread+' unread chats">'+unread+'</span>':'');
        return nav(href(p.id),projectLogo(p,selected)+'<span class="project-copy"><span class="project-title">'+esc(p.title)+'</span><span class="project-host">'+esc(!p.host || p.host==='local'?'Локально':p.host)+'</span></span><span class="project-indicators">'+status+'</span>','project-row text-muted'+(selected?' selected text-base-content':''),(p.host?p.host+':':'')+p.dir,selected);
    }).join('')+'</div>';
    const chats=new Map(opts.chats.map(c=>[c.id,c]));
    const selectedProject=opts.projects.find(p=>p.id===opts.projectId);
    const openIds=opts.tabIds.filter(id=>chats.has(id));
    const isActive=(c:{runState:string;teamRunningCount?:number})=>Boolean(c.runState && c.runState!=='idle') || (c.teamRunningCount??0)>0;
    const teamBadge=(c:{teamRunningCount?:number})=>(c.teamRunningCount??0)>0?'<span class="text-xs text-muted" title="Working subagents: '+c.teamRunningCount+'" aria-label="Working subagents: '+c.teamRunningCount+'">'+c.teamRunningCount+'</span>':'';
    const activityTitle=(c:{title:string;id:string;teamRunningCount?:number})=>(c.title||c.id)+((c.teamRunningCount??0)>0?' — Working subagents: '+c.teamRunningCount:'');
    const projectRunning=opts.chats.some(isActive);
    const runningMark='<i class="ph ph-spinner-gap project-activity-spin" aria-hidden="true" data-spin-sync></i>';
    const projectActivity=projectRunning?'<span class="project-mobile-activity text-primary" role="img" aria-label="В проекте работают агенты" title="В проекте работают агенты">'+runningMark+'</span>':'';
    const otherChats=opts.chats.filter(c=>c.id!==opts.activeId);
    const otherUnread=otherChats.filter(c=>c.hasUnread).length;
    const mobileCounts=otherUnread?'<span data-project-other-unread="'+otherUnread+'" class="project-unread-dot bg-success" role="img" aria-label="Другие чаты с непрочитанным ответом: '+otherUnread+'" title="Другие чаты с непрочитанным ответом: '+otherUnread+'"></span>':'';
    const panelTrigger = (kind:string, label:string, html:string, className:string) => ctx.fns.procs.ui.button({appearance:'plain', html, title:label, ariaLabel:label, class:className, attrs:{'data-project-panel':kind,'aria-haspopup':'dialog','aria-expanded':'false'}});
    const manageTrigger = (phone=false) => panelTrigger('manage','Управление проектом',icon('sliders-horizontal')+(phone?'':'<span>Проект</span>'),phone?'project-mobile-manage':'project-manage-trigger');
    const mobile=opts.projectId?'<div class="project-mobile-bar" data-project-id="'+esc(opts.projectId)+'">'+nav(href(opts.projectId),projectLogo(selectedProject,true)+'<span class="project-title">'+esc(selectedProject?.title||opts.projectId)+'</span>'+projectActivity,'project-mobile-name',selectedProject?.title||opts.projectId)+panelTrigger('chats','Открытые чаты: '+openIds.length+(otherUnread?'; другие чаты с непрочитанным ответом: '+otherUnread:''),icon('chats')+'<span>'+openIds.length+'</span>'+mobileCounts,'project-mobile-toggle')+manageTrigger(true)+'</div>':'';
    const closePanel = '<button type="button" data-project-panel-close class="project-panel-close" aria-label="Закрыть меню" title="Закрыть меню">'+icon('x')+'</button>';
    const heading = (title:string, subtitle='') => '<header class="project-panel-heading"><button type="button" data-project-panel-close class="project-panel-back" aria-label="Назад на предыдущий экран">'+icon('arrow-left')+'<span>Назад</span></button><div><h2 id="project-panel-title">'+esc(title)+'</h2>'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+'</div>'+closePanel+'</header>';
    const newChat = (className:string, text=true) => ctx.fns.ui.popup({method:'ui.newAgentPopup',params:{projectId:opts.projectId},html:icon('plus')+(text?'<span>Новый чат</span>':''),attrs:'class="'+className+'" title="Новый независимый чат" aria-label="Новый независимый чат"'});
    const menu = opts.projectId ? '<template data-project-template="manage">'+heading(selectedProject?.title||opts.projectId,'Управление проектом')+'<div class="project-panel-workspace"><strong>Рабочая папка · '+esc(selectedProject?.host||'Локально')+'</strong><span>'+esc(selectedProject?.dir||'')+'</span></div><div class="project-panel-group">'+newChat('project-panel-item')+nav(href(opts.projectId)+'&list=1',icon('chats')+'<span>Чаты проекта</span><small>'+opts.chats.length+'</small>','project-panel-item','Чаты проекта')+nav(href(opts.projectId)+'&archive=1',icon('archive')+'<span>Архив чатов</span>','project-panel-item','Архив чатов')+'</div><div class="project-panel-group">'+ctx.fns.ui.popup({method:'projects.iconPopup',params:{projectId:opts.projectId},html:icon('image')+'<span>Изменить иконку</span>',attrs:'class="project-panel-item" title="Изменить иконку проекта" aria-label="Изменить иконку проекта"'})+'</div><div class="project-panel-group">'+ctx.fns.procs.ui.button({appearance:'plain',html:icon(selectedProject?.archived?'arrow-u-up-left':'archive')+'<span>'+(selectedProject?.archived?'Восстановить проект':'Архивировать проект')+'</span>',class:'project-panel-item'+(selectedProject?.archived?'':' project-panel-danger'),attrs:{'data-project-action':selectedProject?.archived?'restore-project':'archive-project','data-project-id':opts.projectId,'data-project-title':selectedProject?.title||opts.projectId}})+'<p class="project-panel-help">'+(selectedProject?.archived?'Вернуть проект в вашу навигацию.':'Скрыть только у себя. Чаты сохранятся, агенты продолжат работу.')+'</p></div><div class="project-panel-group">'+nav('/projects/archive',icon('folder')+'<span>Все архивные проекты</span>','project-panel-item','Архив проектов')+'</div></template>':'';
    const chooser = opts.projectId ? '<template data-project-template="chats">'+heading('Открытые чаты',selectedProject?.title||opts.projectId)+'<nav class="project-mobile-menu" aria-label="Открытые чаты проекта">'+(openIds.length?openIds.map(id=>{
        const c=chats.get(id)!;
        const status=c.hasUnread?'<span class="project-mobile-unread project-unread-dot bg-success" role="img" aria-label="Непрочитанный ответ" title="Непрочитанный ответ"></span>':'';
        const modelMark='<span class="project-mobile-model inline-flex shrink-0" title="'+esc(c.model||'Model')+'">'+ctx.fns.chat.icon({icon:c.icon,model:c.model,active:isActive(c),size:'sm'})+'</span>';
        return '<div class="project-mobile-chat-row">'+nav('/agent/'+encodeURIComponent(id),modelMark+teamBadge(c)+status+'<span class="project-title">'+esc(c.title||id)+'</span>','project-mobile-chat'+(id===opts.activeId?' selected':''),activityTitle(c),id===opts.activeId)+action('close','Закрыть вкладку '+(c.title||id)+' — не архивировать','x',{'data-chat-id':id},'project-mobile-close')+'</div>';
    }).join(''):'<p class="project-mobile-empty">Нет открытых чатов</p>')+'</nav><p class="project-panel-help">Закрытие вкладки не архивирует чат.</p><div class="project-panel-group">'+nav(href(opts.projectId)+'&list=1',icon('chats')+'<span>Все чаты проекта</span>','project-panel-item','Все чаты проекта')+newChat('project-panel-item')+'</div></template>':'';
    const tabs=opts.projectId?'<div class="project-tabs" data-project-id="'+esc(opts.projectId)+'" aria-label="Project chats"><div class="project-tab-list">'+openIds.map(id=>{
        const c=chats.get(id)!, selected=id===opts.activeId;
        const running=isActive(c);
        const status=ctx.fns.chat.icon({icon:c.icon,model:c.model,active:running,size:'sm'})+(c.hasUnread?'<span class="project-unread-dot bg-success" aria-label="Unread messages" title="New reply"></span>':'');
        return '<div class="project-tab'+(selected?' selected':'')+'">'+nav('/agent/'+encodeURIComponent(id),status+teamBadge(c)+'<span class="project-title">'+esc(c.title||id)+'</span>','project-tab-link',activityTitle(c),selected)+action('close','Close tab '+(c.title||id)+' (does not archive)','x',{'data-chat-id':id},'project-icon-button project-close')+'<details class="project-tab-menu">'+ctx.fns.procs.ui.button({element:'summary',appearance:'plain',html:icon('dots-three'),ariaLabel:'Действия с чатом',title:'Действия с чатом',class:'project-icon-button'})+'<div class="project-menu bg-base-100 border border-ui-border shadow-lg">'+ctx.fns.procs.ui.button({action:'project-archive',appearance:'plain',html:icon('archive')+'<span>Архивировать чат</span>',class:'project-menu-item',title:c.canArchive===false||running?'Нельзя архивировать работающий или запланированный чат':'Архивировать чат',disabled:c.canArchive===false||running,attrs:{'data-project-action':'archive','data-chat-id':id}})+'</div></details></div>';
    }).join('')+'</div><div class="project-tab-tools">'+newChat('project-icon-button project-new-chat',false)+manageTrigger()+'</div></div>':'';
    // The phone strip loads the same read-only account overview as desktop; no model controls.
    const usage = opts.projectId ? '<button type="button" class="mobile-usage-strip" data-mobile-usage-open aria-haspopup="dialog" aria-expanded="false" aria-label="Аккаунты и лимиты"><span data-mobile-usage-items><span class="mobile-usage-placeholder">Загрузка…</span></span><span data-mobile-usage-count aria-hidden="true">…</span></button>' : '';
    return {sidebar,tabs:mobile+usage+tabs+menu+chooser};
}
