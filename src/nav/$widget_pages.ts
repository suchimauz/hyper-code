// Core widget: the pages the core declares (`$app_`). Which pages and in what order comes from the setting
// nav.pages (ids of $app_ files, usually fixed for the instance in ~/.hyper/settings/$settings_nav.json); without
// it every core page shows by its declared order, System pages other than Search in an "Administration" section.
// Pages declared by plugins are on the Plugins tab (plugin-pages widget).
export default {
    title: "Быстрый доступ",
    icon: "ph-browsers",
    description: "Pages of the core; which and in what order is the nav.pages setting",
    sizes: ["tall", "L", "M", "wide"],
    async render(ctx: Context, _session?: Session | null, opts?: { size: types.nav.Size; config: Record<string, unknown> }): Promise<types.nav.WidgetOutput> {
        const section = opts?.config.section;
        const labels: Record<string, string> = { "/search": "Поиск по чатам", "/files": "Файлы", "/llms": "Модели и подключения", "/settings": "Настройки", "/settings/declared": "Параметры системы", "/auth/people": "Пользователи", "/cron": "Расписание", "/update": "Обновления", "/functions": "Функции", "/autotext": "Шаблоны текста" };
        const all = (await ctx.fns.nav.items({ includeAgents: false, limit: 500 }))
            .filter(item => !["Chats", "Shared Agents", ...(section === "daily" ? [] : ["Projects & files"])].includes(String(item.group)))
            .map(item => ({ ...item, label: labels[item.href] ?? item.label, hint: undefined, icon: item.icon || "ph-gear", pin: `page:${item.href}` }));
        const chosen = await ctx.fns.settings.get({ module: "nav", scopeType: "global", key: "pages" });
        const isAdmin = (item: types.nav.Item) => (item.group ?? "System") === "System" && item.href !== "/search";
        const filterSection = (items: types.nav.Item[]) => section === "management" ? items.filter(isAdmin) : section === "daily" ? items.filter(item => !isAdmin(item)) : items;
        if (Array.isArray(chosen)) {
            const byId = new Map(all.map(item => [String(item.id ?? "").replace(/^app:/, ""), item]));
            return { items: filterSection(chosen.map(id => byId.get(String(id))).filter((item): item is NonNullable<typeof item> => !!item)) };
        }
        const items = all.filter(item => !item.plugin);
        if (section === "daily" || section === "management") return { items: filterSection(items) };
        const admin = items.filter(isAdmin);
        return {
            items: items.filter(item => !isAdmin(item)),
            sections: admin.length ? [{ title: "Administration", items: admin, count: admin.length }] : [],
        };
    },
} satisfies types.nav.Widget;
