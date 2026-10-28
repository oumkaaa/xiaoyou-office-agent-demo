import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../frontend/src/core.js';
import {initCatalog} from '../frontend/src/catalog.js';
import {initWorkspace} from '../frontend/src/workspace.js';
import {initOffice,seedOfficeTask} from '../frontend/src/office-model.js';
import {initTeamSpace,visibleTeams} from '../frontend/src/team-model.js';
import {initTaskCenter,TASK_FILTERS,taskMatchesStatus} from '../frontend/src/task-center-model.js';
import {handleTaskCenter,renderTaskCenter} from '../frontend/src/task-center-ui.js';
import {navigationModule,rememberModuleRoute,moduleDestination,moduleCollapsed,captureModuleSidebar,restoreModuleSidebar,renderModuleSidebar,handleModuleNavigation} from '../frontend/src/module-navigation.js';

function setup(route='home'){
 const state=initialState();initCatalog(state);initWorkspace(state);initOffice(state);initTeamSpace(state);initTaskCenter(state);
 state.tasks=[];
 for(const phase of ['plan','running','ready','review','approved','paused','blocked','complete','rejected','cancelled']){
  const task=seedOfficeTask(newTask(phase+' 的任务'),'review');task.office.phase=phase;state.tasks.push(task);
 }
 const ui={route,tmTab:'tasks',tmRestored:true};
 const c={state,ui,save(){this.saved=true;},render(){this.rendered=true;},toast(){},go(route,_after,options){this.navigation={route,options};ui.route=route;}};
 return c;
}
test('primary modules own their pages, including nested routes and legacy aliases',()=>{
 const cases={home:'workspace','chat/a':'workspace','agent/personal':'workspace',personal:'workspace','local-agent/codex':'workspace','task-center':'tasks',schedules:'tasks',experts:'market',plugins:'market',skills:'market',mcp:'market','expert-config':'market','expert-share/a':'market',teams:'teams','team/product/members':'teams','team-task/a':'teams',knowledge:'knowledge',sites:'tools','site-task/a':'tools','settings/voice':'settings'};
 for(const [route,module] of Object.entries(cases))assert.equal(navigationModule(route),module,route);
});
test('module switches restore the prior workspace route and retain project and conversation drafts',()=>{
 const c=setup();c.state.sidebarLayout={composeProjectId:'project-a',projects:[{id:'project-a',open:true}]};c.state.homeDraft='尚未发送的项目要求';
 c.ui.route='chat/'+c.state.tasks[0].id;rememberModuleRoute(c.ui);
 handleModuleNavigation('module:open',{dataset:{module:'tasks'}},c);
 assert.equal(c.ui.route,'task-center');rememberModuleRoute(c.ui);
 handleModuleNavigation('module:open',{dataset:{module:'market'}},c);c.ui.route='skills';rememberModuleRoute(c.ui);
 handleModuleNavigation('module:open',{dataset:{module:'workspace'}},c);
 assert.equal(c.ui.route,'chat/'+c.state.tasks[0].id);assert.equal(c.navigation.options.restoreConversation,true);
 assert.equal(c.state.homeDraft,'尚未发送的项目要求');assert.equal(c.state.sidebarLayout.composeProjectId,'project-a');assert.equal(c.state.sidebarLayout.projects[0].open,true);
 handleModuleNavigation('module:open',{dataset:{module:'market'}},c);assert.equal(c.ui.route,'skills');
});
test('returning to a deleted conversation, missing Agent or inaccessible team uses a safe module entry',()=>{
 const c=setup();
 for(const route of ['chat/deleted','agent/deleted']){c.ui.moduleRoutes={workspace:route};assert.equal(moduleDestination(c.state,c.ui,'workspace'),'home');}
 c.ui.moduleRoutes={teams:'team/not-joined/resources'};assert.equal(moduleDestination(c.state,c.ui,'teams'),'teams');
 c.ui.moduleRoutes={market:'chat/foreign'};assert.equal(moduleDestination(c.state,c.ui,'market'),'experts');
});
test('sidebar scroll and collapse state are independent for each module',()=>{
 const c=setup(),side={dataset:{navigationModule:'workspace'},scrollTop:350},root={querySelector:()=>side};
 captureModuleSidebar(c.ui,root);side.dataset.navigationModule='tasks';side.scrollTop=0;restoreModuleSidebar(c.ui,root);assert.equal(side.scrollTop,0);
 side.scrollTop=80;captureModuleSidebar(c.ui,root);side.dataset.navigationModule='workspace';restoreModuleSidebar(c.ui,root);assert.equal(side.scrollTop,350);
 c.ui.navCollapsed=true;assert.equal(moduleCollapsed(c.ui),true);c.ui.route='task-center';assert.equal(moduleCollapsed(c.ui),false);
 handleModuleNavigation('module:collapse',{dataset:{}},c);assert.equal(moduleCollapsed(c.ui),true);
 c.ui.route='skills';assert.equal(moduleCollapsed(c.ui),false);c.ui.route='task-center';assert.equal(moduleCollapsed(c.ui),true);
});
test('task navigation and status counts use the same status predicate as the results',()=>{
 const c=setup('task-center'),expected={all:10,running:1,attention:3,paused:1,problem:1,complete:1},sidebar=renderModuleSidebar(c);
 assert.match(sidebar,/aria-label="任务中心导航"/);assert.match(sidebar,/data-tab="todos"/);assert.doesNotMatch(sidebar,/最近对话|我的助理|nav-project-group/);
 for(const id of Object.keys(TASK_FILTERS)){
  const count=c.state.tasks.filter(t=>taskMatchesStatus(t,id)).length;assert.equal(count,expected[id]);
  assert.ok(sidebar.includes(`data-id="${id}"`));
 }
 handleTaskCenter('tc:filter',{dataset:{id:'complete'}},c);
 const content=renderTaskCenter(c);assert.match(content,/tm-completed/);assert.match(content,/complete 的任务/);assert.doesNotMatch(content,/running 的任务|当前任务看板/);
 handleTaskCenter('tc:tab',{dataset:{tab:'automations'}},c);assert.match(renderModuleSidebar(c),/触发方式/);assert.doesNotMatch(renderModuleSidebar(c),/任务状态/);
 handleTaskCenter('tc:tab',{dataset:{tab:'todos'}},c);assert.doesNotMatch(renderModuleSidebar(c),/触发方式|任务状态/);
});
test('each non-conversation module replaces the conversation organizer with functional navigation',()=>{
 const c=setup();
 for(const [route,label] of [['skills','市场导航'],['teams','团队空间导航'],['knowledge','知识库导航'],['sites','更多功能导航']]){
  c.ui.route=route;const sidebar=renderModuleSidebar(c);assert.ok(sidebar.includes(label));assert.doesNotMatch(sidebar,/最近对话|我的助理|nav-project-group|nav-personal-agent/);
 }
 c.ui.route='home';assert.equal(renderModuleSidebar(c),'');c.ui.route='settings/appearance';assert.equal(renderModuleSidebar(c),'');
});
test('team resource navigation shares existing filters and rejects teams without membership',()=>{
 const c=setup('teams'),team=visibleTeams(c.state)[0];c.ui.teamSpace={query:'旧关键词'};
 handleModuleNavigation('module:team-resources',{dataset:{id:team.id,kind:'knowledge'}},c);
 assert.equal(c.ui.route,`team/${team.id}/resources`);assert.equal(c.ui.teamSpace.resourceType,'knowledge');assert.equal(c.ui.teamSpace.query,'');assert.equal(c.saved,true);
 assert.ok(renderModuleSidebar(c).includes('成员配置'));
 const before=JSON.stringify(c.state);handleModuleNavigation('module:team-resources',{dataset:{id:'not-joined',kind:'plugin'}},c);
 assert.equal(JSON.stringify(c.state),before);assert.equal(c.ui.route,`team/${team.id}/resources`);
});
test('resource names remain escaped in navigation and local/remote knowledge stays separate',()=>{
 const c=setup('knowledge');c.state.workspace.knowledge.local=[{id:'local',name:'<img src=x onerror=alert(1)>'}];
 let sidebar=renderModuleSidebar(c);assert.ok(sidebar.includes('&lt;img'));assert.ok(!sidebar.includes('<img src=x'));
 c.ui.workKnowledgeTab='remote';sidebar=renderModuleSidebar(c);assert.ok(!sidebar.includes('&lt;img'));assert.ok(sidebar.includes('创建示例库'));
});
