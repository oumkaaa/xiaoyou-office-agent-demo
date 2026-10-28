import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {capturePageView,restorePageView,restorePageConversation} from '../frontend/src/page-view-state.js';
import {initialState,newTask,uid} from '../frontend/src/core.js';
import {initCatalog} from '../frontend/src/catalog.js';
import {initOffice,seedOfficeTask,detectScenario} from '../frontend/src/office-model.js';
import {syncAgentThreads,focusAgentTask,selectedAgentTask,agentThread} from '../frontend/src/agent-conversations.js';
import {initSidebarLayout,addNavigationProject,draftProject,assignDraftProject,handleSidebar} from '../frontend/src/sidebar-layout.js';
import {registerSkillOffer} from '../frontend/src/skill-discovery-model.js';
import {createTaskIntakeMessage} from '../frontend/src/task-intake.js';
import {sendMessage} from '../frontend/src/chat.js';

function root(entries={},cv=null){return {querySelectorAll:s=>entries[s]||[],querySelector:()=>cv};}
test('returning to a task-center tab restores its reading position',()=>{
 const old={scrollTop:450,scrollLeft:0,dataset:{tcMainKey:'automations:all'}};
 const saved=capturePageView(root({'.tc-main-scroll':[old]}));const next={scrollTop:0,scrollLeft:0,dataset:{tcMainKey:'automations:all'}};
 restorePageView(root({'.tc-main-scroll':[next]}),saved);assert.equal(next.scrollTop,450);
});
test('a different task-center filter does not inherit a stale scroll offset',()=>{
 const saved=capturePageView(root({'.tc-main-scroll':[{scrollTop:450,dataset:{tcMainKey:'a'}}]}));
 const next={scrollTop:0,dataset:{tcMainKey:'b'}};restorePageView(root({'.tc-main-scroll':[next]}),saved);assert.equal(next.scrollTop,0);
});
test('conversation and result panels retain independent scroll positions',()=>{
 const saved=capturePageView(root({'.cv-chat-scroll':[{scrollTop:130}],'.cv-panel-scroll':[{scrollTop:75}]}));
 const chat={scrollTop:0},panel={scrollTop:0};restorePageView(root({'.cv-chat-scroll':[chat],'.cv-panel-scroll':[panel]}),saved);
 assert.equal(chat.scrollTop,130);assert.equal(panel.scrollTop,75);
});
test('market horizontal and vertical offsets survive navigation',()=>{
 const saved=capturePageView(root({'.nav-market-body':[{scrollTop:600,scrollLeft:35}]}));
 const next={scrollTop:0,scrollLeft:0};restorePageView(root({'.nav-market-body':[next]}),saved);assert.equal(next.scrollTop,600);assert.equal(next.scrollLeft,35);
});

function conversations(){
 const state=initialState();initCatalog(state);initOffice(state);
 const tasks=['a','b','c'].map(id=>{const t=seedOfficeTask(newTask(id+' 的经营周报'),'review',{agentId:'personal',conversationId:'conversation-'+id});state.tasks.push(t);return t;});
 syncAgentThreads(state);
 for(const t of tasks)state.office.threads[t.office.conversationId].draft=t.title+' 尚未发送的要求';
 return {state,tasks};
}
function conversationRoot(id,top=0){const cv={dataset:{agentConversation:'personal',conversationId:id},classList:{contains:()=>false}},scroll={scrollTop:top,scrollLeft:0};return {cv,scroll,...root({'.cv-chat-scroll':[scroll]},cv)};}

test('conversation identity blocks stale offsets and task routes reject another thread snapshot',()=>{
 const {state,tasks:[a,b]}=conversations(),saved=capturePageView(conversationRoot(a.office.conversationId,480));
 assert.equal(saved.conversationId,a.office.conversationId);
 assert.equal(restorePageConversation(state,'chat/'+b.id,saved,{activate:true}),false);
 const other=conversationRoot(b.office.conversationId,25);restorePageView(other,saved);
 assert.equal(other.scroll.scrollTop,25);
 const own=conversationRoot(a.office.conversationId);restorePageView(own,saved);assert.equal(own.scroll.scrollTop,480);
});

test('tab identity restoration preserves live drafts and refuses missing or foreign threads',()=>{
 const {state,tasks:[a,b]}=conversations(),snapshot=capturePageView(conversationRoot(a.office.conversationId));
 focusAgentTask(state,b);const before=JSON.stringify(state.office.threads);
 assert.equal(restorePageConversation(state,'agent/personal',snapshot),false,'an explicit new selection is not replaced by an older tab snapshot');
 assert.equal(selectedAgentTask(state,'personal'),b);
 assert.equal(restorePageConversation(state,'agent/personal',snapshot,{activate:true}),true);
 assert.equal(selectedAgentTask(state,'personal'),a);
 assert.equal(JSON.stringify(state.office.threads),before);
 const invalid=[{...snapshot,conversationId:'deleted-thread'},{...snapshot,agentId:'bi'},{...snapshot,agentId:'missing-agent'}];
 for(const saved of invalid){assert.equal(restorePageConversation(state,'agent/personal',saved,{activate:true}),false);assert.equal(selectedAgentTask(state,'personal'),a);}
 assert.equal(state.office.threads['deleted-thread'],undefined);
});

test('app render restores separate Agent-tab and task-tab conversations without moving their drafts',()=>{
 const {state,tasks:[a,b,c]}=conversations();focusAgentTask(state,a);
 const ui={route:'agent/personal',lastRoute:'agent/personal',pageTabs:['agent/personal','chat/'+b.id],cvPanelOwner:'personal',cvPanelMode:'summary',conversationPanelOpen:true};
 let dom;
 function view(id,top=0){
  const cv={dataset:{agentConversation:'personal',conversationId:id},classList:{contains:name=>name==='cv-work-active'?ui.cvPanelMode==='work':name==='cv-panel-hidden'?!ui.conversationPanelOpen:false}};
  const chat={scrollTop:top,scrollLeft:0,scrollHeight:1200,clientHeight:400};
  const panel={scrollTop:0,scrollLeft:0},workpanel={dataset:{officeView:'summary'}};
  return {cv,chat,panel,querySelector(selector){return ({'[data-agent-conversation]':cv,'.cv-chat-scroll':chat,'.cv-panel-scroll':panel,'.cv-workpanel':workpanel,'[data-office-view]':workpanel})[selector]||null;},querySelectorAll(selector){return selector==='.cv-chat-scroll'?[chat]:selector==='.cv-panel-scroll'?[panel]:[];}};
 }
 dom=view(a.office.conversationId,480);
 const document={documentElement:{dataset:{}},activeElement:null,querySelector:s=>dom.querySelector(s),querySelectorAll:s=>dom.querySelectorAll(s)};
 const app={set innerHTML(value){dom=view(agentThread(state,'personal').id);}};
 const blank=()=>'',noop=()=>{};
 const scope={state,ui,document,app,ctx:{},capturePageView,restorePageView,restorePageConversation,captureForms:()=>[],restoreForms:noop,
  visitPageTab:tabs=>tabs,storePageTabs:noop,syncAgentThreads,reconcileConversation:()=>false,applyTheme:noop,
  renderLocalAgentWorkspace:blank,renderTaskCenter:blank,renderMarketPage:blank,renderExperts:blank,
  renderAgentConversation(){if(ui.route.startsWith('chat/'))focusAgentTask(state,state.tasks.find(t=>t.id===ui.route.slice(5)));return 'conversation';},
  renderFunctionRail:blank,sidebar:blank,renderPageTabs:blank,draftProject:()=>null,icon:blank,readVisiblePersonalResults:noop,refreshVoiceUI:noop,scrollChat:noop};
 const source=readFileSync(new URL('../frontend/src/app.js',import.meta.url),'utf8');
 vm.runInNewContext(source.slice(source.indexOf('function render(){'),source.indexOf('function searchResults('))+'\nthis.render=render;',scope);
 focusAgentTask(state,b);ui.route='chat/'+b.id;scope.render();dom.chat.scrollTop=215;
 ui.route='agent/personal';ui.restorePageIdentity=ui.route;scope.render();
 assert.equal(dom.cv.dataset.conversationId,a.office.conversationId);assert.equal(dom.chat.scrollTop,480);
 assert.equal(selectedAgentTask(state,'personal'),a);
 ui.route='chat/'+b.id;ui.restorePageIdentity=ui.route;scope.render();
 assert.equal(dom.cv.dataset.conversationId,b.office.conversationId);assert.equal(dom.chat.scrollTop,215);
 // An explicit new-conversation selection must win over the old generic-tab snapshot.
 focusAgentTask(state,c);ui.route='agent/personal';ui.restorePageIdentity=null;scope.render();
 assert.equal(dom.cv.dataset.conversationId,c.office.conversationId);
 for(const t of [a,b,c])assert.equal(state.office.threads[t.office.conversationId].draft,t.title+' 尚未发送的要求');
});

function projectDraftHarness(route='home',{saveResult=true}={}){
 const {state}=conversations();initSidebarLayout(state);
 const {project}=addNavigationProject(state,'项目 A','项目 A 的约定：只引用已确认的订单口径。');
 state.sidebarLayout.composeProjectId=project.id;state.homeDraft='分析本周经营变化，整理经营周报';state.homeContext=[];
 const ui={route},location={hash:'#'+route},persisted=[];
 const save=()=>{if(!saveResult)return false;syncAgentThreads(state);persisted.push(structuredClone(state));return true;};
 const scope={state,ui,location,structuredClone,newTask,uid,seedOfficeTask,detectScenario,focusAgentTask,registerSkillOffer,createTaskIntakeMessage,draftProject,assignDraftProject,
  validateTeamTask:()=>'',validateSiteTask:()=>'',collectMemorySnapshot:()=>[],save,toast(){},render(){},normalizeTeamRoute:(_state,value)=>value,normalizePersonalRoute:value=>value};
 const source=readFileSync(new URL('../frontend/src/app.js',import.meta.url),'utf8');
 const goSource=source.slice(source.indexOf('function go('),source.indexOf('\nfunction modal('));
 const taskSource=source.slice(source.indexOf('function startTask('),source.indexOf('\nfunction continueTask('));
 vm.runInNewContext(goSource+'\n'+taskSource+'\nthis.go=go;this.startTask=startTask;',scope);
 const c={state,ui,save,go:scope.go,render(){},toast(){},currentTask:()=>null,startTask:scope.startTask};
 return {state,ui,project,scope,c,persisted};
}

test('a home project draft survives other tabs and sends with its project instructions and assignment',()=>{
 const {state,ui,project,scope,c,persisted}=projectDraftHarness();
 const prompt=state.homeDraft;
 scope.go('experts',undefined,{restoreConversation:true});ui.route='experts';
 assert.equal(state.sidebarLayout.composeProjectId,project.id);assert.equal(state.homeDraft,prompt);
 scope.go('home',undefined,{restoreConversation:true});ui.route='home';
 sendMessage(c);
 const task=state.tasks[0];
 assert.equal(task.prompt,prompt);assert.equal(state.sidebarLayout.assignments[task.id],project.id);
 assert.ok(task.customInstructions.includes(project.instructions));
 assert.equal(state.homeDraft,'');assert.equal(state.sidebarLayout.composeProjectId,'');
 assert.equal(persisted[0].sidebarLayout.assignments[task.id],project.id);
 assert.equal(persisted[0].sidebarLayout.composeProjectId,'');
});

test('non-home Agent tasks neither inherit nor clear the separate home project draft',()=>{
 const {state,project,scope}=projectDraftHarness('agent/personal');
 const prompt=state.homeDraft,id=scope.startTask('核对另一个会话的经营变化',{agentId:'personal'}),task=state.tasks.find(t=>t.id===id);
 assert.ok(task);assert.equal(state.sidebarLayout.assignments[id],undefined);
 assert.ok(!task.customInstructions.includes(project.instructions));
 assert.equal(state.sidebarLayout.composeProjectId,project.id);assert.equal(state.homeDraft,prompt);
});

test('a failed task save preserves the home draft and its project without orphan assignment',()=>{
 const {state,project,c}=projectDraftHarness('home',{saveResult:false}),before=state.tasks.length,prompt=state.homeDraft,assignments=JSON.stringify(state.sidebarLayout.assignments);
 sendMessage(c);
 assert.equal(state.tasks.length,before);assert.equal(state.homeDraft,prompt);
 assert.equal(state.sidebarLayout.composeProjectId,project.id);
 assert.equal(JSON.stringify(state.sidebarLayout.assignments),assignments);
});

test('explicit new ordinary conversation still clears the home project association',()=>{
 const {state,c}=projectDraftHarness();
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:()=>null}});
 try{assert.equal(handleSidebar('nav:new-task',{dataset:{}},c),true);assert.equal(state.sidebarLayout.composeProjectId,'');}
 finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
});
