import {esc as E,icon} from './core.js';
import {centerRoute,centerRuns,TASK_FILTERS,taskMatchesStatus,jobKind} from './task-center-model.js';
import {visibleTeams,teamRole,teamResources} from './team-model.js';

const defaults={workspace:'home',tasks:'task-center',market:'experts',teams:'teams',knowledge:'knowledge',tools:'sites',settings:'settings/appearance'};
const labels={workspace:'工作台',tasks:'任务中心',market:'市场',teams:'团队空间',knowledge:'知识库',tools:'更多功能',settings:'设置'};
const market=['experts','agents','plugins','skills','mcp','expert-config'];

export function navigationModule(route='home'){
 if(centerRoute(route))return 'tasks';
 if(market.includes(route)||route.startsWith('expert-share/'))return 'market';
 if(route==='teams'||route.startsWith('team/')||route.startsWith('team-task/'))return 'teams';
 if(route==='knowledge')return 'knowledge';
 if(route.startsWith('settings/'))return 'settings';
 if(['sites','remote','insights','ai-plan'].includes(route)||route.startsWith('site-task/'))return 'tools';
 return 'workspace';
}

export function rememberModuleRoute(ui){
 ui.moduleRoutes||={};ui.moduleRoutes[navigationModule(ui.route)]=ui.route;
}

export function moduleDestination(state,ui,module){
 const route=ui.moduleRoutes?.[module];
 if(!route||navigationModule(route)!==module)return defaults[module]||'home';
 if(route.startsWith('chat/')&&!state.tasks.some(t=>t.id===route.slice(5)))return 'home';
 if(route.startsWith('agent/')&&!state.office?.agents?.some(a=>a.id===route.slice(6)))return 'home';
 if(route.startsWith('team/')&&!teamRole(state,route.split('/')[1]))return 'teams';
 if(route.startsWith('team-task/')&&!state.tasks.some(t=>t.id===route.slice(10)))return 'teams';
 return route;
}

export function captureModuleSidebar(ui,root){
 const side=root.querySelector('.sidebar-scroll');if(!side)return;
 ui.moduleSidebarScroll||={};
 ui.moduleSidebarScroll[side.dataset?.navigationModule||navigationModule(ui.lastRoute)]=side.scrollTop||0;
}
export function restoreModuleSidebar(ui,root){
 const side=root.querySelector('.sidebar-scroll');if(side)side.scrollTop=ui.moduleSidebarScroll?.[side.dataset?.navigationModule||navigationModule(ui.route)]||0;
}
export function moduleCollapsed(ui){const module=navigationModule(ui.route);return module==='workspace'?!!ui.navCollapsed:module==='settings'?false:!!ui.moduleCollapsed?.[module];}

const row=(text,glyph,action,attrs='',selected=false,count)=>`<button type="button" class="module-nav-item ${selected?'active':''}" data-action="${action}" ${attrs} ${selected?'aria-current="page"':''}>${icon(glyph,18)}<span>${E(text)}</span>${count!==undefined?`<small>${E(count)}</small>`:''}</button>`;
const routeRow=(route,text,glyph,current)=>row(text,glyph,'app:go',`data-route="${route}"`,route===current);
const section=(title,body)=>`<section class="nav-section">${`<div class="nav-section-heading">${E(title)}</div>`}${body}</section>`;

function taskNavigation(c){
 const u=c.ui,runs=centerRuns(c.state),tab=u.tmTab||'tasks';
 let body=[['tasks','任务看板','panel'],['todos','飞书待办','checkCircle'],['automations','自动化任务','clock']].map(([id,text,glyph])=>row(text,glyph,'tc:tab',`data-tab="${id}"`,tab===id)).join('');
 if(tab==='tasks')body+=section('任务状态',Object.entries(TASK_FILTERS).map(([id,text])=>row(id==='all'?'全部任务':text,({all:'list',running:'activity',attention:'shield',paused:'pause',problem:'alert',complete:'checkCircle'})[id],'tc:filter',`data-id="${id}"`,(u.tmFilter||'all')===id,runs.filter(t=>taskMatchesStatus(t,id)).length)).join(''));
 if(tab==='automations')body+=section('触发方式',[['all','全部自动化'],['scheduled','定时任务'],['standing','常驻任务'],['event','事件任务']].map(([id,text])=>row(text,id==='event'?'bolt':'clock','tc:filter',`data-id="${id}"`,(u.tmKind||'all')===id,c.state.workspace.schedules.filter(s=>id==='all'||jobKind(s)===id).length)).join(''));
 body+=section('最近任务',runs.slice(0,3).map(t=>row(t.title,'chat','tc:open-run',`data-id="${E(t.id)}" title="${E(t.title)}"`)).join('')||'<p class="nav-section-empty">还没有任务</p>');
 return {create:row('新建任务','plus','tc:new-task'),body};
}
function marketNavigation(c){return {body:section('能力分类',[['experts','助理','expert'],['plugins','插件','plugin'],['skills','技能 / Skill','bolt'],['mcp','MCP','code']].map(([route,text,glyph])=>routeRow(route,text,glyph,c.ui.route==='agents'?'experts':c.ui.route)).join(''))+section('管理',routeRow('expert-config','我创建的助理','sliders',c.ui.route))};}
function teamNavigation(c){
 const teams=visibleTeams(c.state),parts=c.ui.route.split('/'),currentId=parts[0]==='team'?parts[1]:null,current=teams.find(t=>t.id===currentId),members=parts[2]==='members';
 let body=row('全部团队空间','teams','team:list','',c.ui.route==='teams',teams.length)+section('我的团队',teams.map(t=>row(t.name,'folder','team:open',`data-id="${E(t.id)}" title="${E(t.name)}"`,t.id===currentId)).join('')||'<p class="nav-section-empty">还没有加入团队空间</p>');
 if(current)body+=section(current.name,[['all','全部资源','layers'],['expert','助理','expert'],['plugin','插件','plugin'],['knowledge','知识库','book']].map(([kind,text,glyph])=>row(text,glyph,'module:team-resources',`data-id="${E(current.id)}" data-kind="${kind}"`,!members&&(c.ui.teamSpace?.resourceType||'all')===kind,teamResources(c.state,current.id,kind==='all'?undefined:kind).length)).join('')+row('成员配置','user','team:members',`data-id="${E(current.id)}"`,members));
 return {create:row('创建团队空间','plus','team:create'),body};
}
function knowledgeNavigation(c){
 const kb=c.state.workspace.knowledge,tab=c.ui.workKnowledgeTab||'local',items=kb[tab]||[];
 return {create:row(tab==='remote'?'创建示例库':'添加资料','plus',tab==='remote'?'work:knowledge-create':'work:knowledge-add-menu'),body:row('本地资料','folder','work:knowledge-tab','data-id="local"',tab==='local',kb.local.length)+row('远程知识库','book','work:knowledge-tab','data-id="remote"',tab==='remote',kb.remote.length)+section(tab==='remote'?'示例知识库':'已添加资料',items.slice(0,4).map(k=>row(k.name,'file','work:knowledge-detail',`data-id="${E(k.id)}" title="${E(k.name)}"`)).join('')||'<p class="nav-section-empty">添加工作资料后，会显示在这里</p>')};
}
function toolsNavigation(c){return {body:[['sites','站点','globe'],['remote','远程控制','remote'],['insights','工作洞察','sun'],['ai-plan','AI Plan 配置','sparkles']].map(([route,text,glyph])=>routeRow(route,text,glyph,c.ui.route)).join('')};}

export function renderModuleSidebar(c){
 const module=navigationModule(c.ui.route),renderers={tasks:taskNavigation,market:marketNavigation,teams:teamNavigation,knowledge:knowledgeNavigation,tools:toolsNavigation};
 if(!renderers[module])return '';
 const {create='',body}=renderers[module](c),label=labels[module],collapsed=moduleCollapsed(c.ui);
 return `<aside class="sidebar conversation-sidebar module-sidebar ${c.ui.sidebarOpen?'mobile-open':''}" data-navigation-module="${module}" aria-label="${label}导航"><header class="nav-workspace-head"><strong class="module-nav-title">${label}</strong><button class="nav-icon-button" data-action="module:collapse" aria-label="${collapsed?'展开':'收起'}${label}导航" title="${collapsed?'展开':'收起'}导航">${icon('sidebar',18)}</button></header>${create?`<div class="nav-quick-actions module-nav-create">${create}</div>`:''}<div class="sidebar-scroll nav-organizer module-nav-scroll" data-navigation-module="${module}">${body}</div></aside>`;
}

export function handleModuleNavigation(action,el,c){
 if(!action.startsWith('module:'))return false;
 if(action==='module:open'){
  const module=el.dataset.module;if(!defaults[module])return true;
  rememberModuleRoute(c.ui);c.go(moduleDestination(c.state,c.ui,module),undefined,{restoreConversation:true});return true;
 }
 if(action==='module:collapse'){const module=navigationModule(c.ui.route);c.ui.moduleCollapsed||={};c.ui.moduleCollapsed[module]=!c.ui.moduleCollapsed[module];c.render();return true;}
 if(action==='module:team-resources'){
  const {id,kind}=el.dataset;if(!teamRole(c.state,id)||!['all','expert','plugin','knowledge'].includes(kind))return true;
  c.ui.teamSpace||={};c.ui.teamSpace.resourceType=kind;c.ui.teamSpace.query='';c.state.teamSpace.currentTeamId=id;c.save();c.go(`team/${id}/resources`);return true;
 }
 return true;
}
