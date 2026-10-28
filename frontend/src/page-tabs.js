import {normalizePersonalRoute} from './personal.js';
import {esc,icon} from './core.js';

const entries={personal:['小悠','sparkles'],home:['新建任务','new'],teams:['团队空间','teams'],plugins:['插件','plugin'],skills:['技能','bolt'],mcp:['MCP','code'],experts:['助理','expert'],'expert-config':['助理管理','sliders'],'task-center':['任务中心','list'],schedules:['任务中心','list'],remote:['远程控制','remote'],sites:['站点','globe'],knowledge:['知识库','book'],insights:['工作洞察','sun'],'ai-plan':['AI Plan 配置','sparkles']};
const storageKey='xiaoyou-page-tabs-v1';
export function pageTabKey(route){if(route.startsWith('personal/'))return 'personal';if(['experts','expert-config','plugins','skills','mcp'].includes(route))return 'market';if(route==='schedules')return 'task-center';if(route.startsWith('settings/'))return 'settings';if(route.startsWith('team/'))return route.split('/').slice(0,2).join('/');return route;}
export function pageTabInfo(state,route){
 if(entries[route])return {label:entries[route][0],icon:entries[route][1]};
 const [kind,id]=route.split('/');
 if(kind==='personal')return {label:'小悠 · '+({capabilities:'能力',diary:'日记',context:'上下文',settings:'设置',secretary:'工作秘书',welcome:'认识小悠',guide:'使用指南'}[id]||'个人助理'),icon:'sparkles'};
 if(kind==='chat')return {label:state.tasks?.find(t=>t.id===id)?.title||'对话',icon:'chat'};
 if(kind==='agent')return {label:state.office?.agents?.find(a=>a.id===id)?.name||'助理对话',icon:'expert'};
 if(kind==='team')return {label:state.teamSpace?.teams?.find(t=>t.id===id)?.name||'团队空间',icon:'teams'};
 if(kind==='team-task')return {label:'团队资源对话',icon:'chat'};
 if(kind==='site-task')return {label:'创建站点',icon:'globe'};
 if(kind==='local-agent')return {label:'本机助理',icon:'monitor'};
 if(kind==='settings')return {label:'设置',icon:'settings'};
 return {label:'工作页面',icon:'folder'};
}
export function visitPageTab(tabs,route){const key=pageTabKey(route),existing=tabs.find(t=>pageTabKey(t)===key);return existing?tabs.map(t=>pageTabKey(t)===key?route:t):[...tabs,route];}
export function closePageTab(tabs,route,active){const index=tabs.indexOf(route),remaining=tabs.filter(t=>t!==route);return {tabs:remaining,route:active!==route?active:remaining[Math.min(index,remaining.length-1)]||'home'};}
export function loadPageTabs(){try{const value=JSON.parse(sessionStorage.getItem(storageKey));return Array.isArray(value)?value.filter(r=>typeof r==='string'&&(entries[r]||/^(chat|agent|team|team-task|site-task|local-agent|settings|personal)\/[\w/%.-]+$/.test(r))).reduce((tabs,r)=>visitPageTab(tabs,normalizePersonalRoute(r)),[]):[];}catch{return [];}}
export function storePageTabs(tabs){try{sessionStorage.setItem(storageKey,JSON.stringify(tabs));}catch{}}
export function renderPageTabs(state,tabs,active){return `<nav class="workspace-tabs" aria-label="打开的页面"><div class="workspace-tab-list" role="tablist" aria-label="页面标签">${tabs.map(route=>{const info=pageTabInfo(state,route),selected=route===active;return `<div class="workspace-tab ${selected?'is-active':''}" role="presentation"><button class="workspace-tab-select" role="tab" aria-selected="${selected}" aria-controls="workspace-page" tabindex="${selected?0:-1}" data-action="app:page-tab" data-route="${esc(route)}" title="${esc(info.label)}">${icon(info.icon,16)}<span>${esc(info.label)}</span></button><button class="workspace-tab-close" data-action="app:close-page-tab" data-route="${esc(route)}" aria-label="关闭标签：${esc(info.label)}" title="关闭标签">${icon('close',14)}</button></div>`;}).join('')}</div><button class="workspace-tab-add" data-action="app:go" data-route="home" aria-label="打开新建任务" title="新建任务">${icon('plus',19)}</button></nav>`;}
