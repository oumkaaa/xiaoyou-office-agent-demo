import {createTaskIntakeMessage} from './task-intake.js';
import {capturePageView,restorePageView,restorePageConversation} from './page-view-state.js';
import {initSidebarLayout,pinDefaultSkillExample,renderFunctionRail,renderConversationSidebar,renderPersonalAgentEntry,renderMarketPage,handleSidebar,submitSidebar,draftProject,assignDraftProject} from './sidebar-layout.js';
import {initConversation as initPersonalConversation,reconcileConversation,handleConversation as handlePersonalConversation,submitConversation as submitPersonalConversation,inputConversation as inputPersonalConversation,conversationEnter} from './personal-conversation.js';
import {handlePersonalWelcome} from './personal-welcome.js';
import {handlePersonalContext,submitPersonalContext} from './personal-context.js';
import {initPersonalHub,renderPersonalHub,handlePersonalHub,submitPersonalHub,handlePersonalSchedule} from './personal-hub.js';
import {handleDiary,submitDiary} from './personal-diary.js';
import {initSecretary} from './secretary-state.js';
import {handleSecretary,submitSecretary} from './secretary.js';
import {loadPageTabs,storePageTabs,visitPageTab,closePageTab,renderPageTabs} from './page-tabs.js';
import {normalizeComposerModels} from './composer-settings.js';
import {handleVoice,keyVoice,refreshVoiceUI} from './voice-input.js';
import {handleFollowup,keyFollowup} from './followup-suggestions.js';
import {initTaskEvents} from './task-event-model.js';
import {initSkillDiscovery,registerSkillOffer} from './skill-discovery-model.js';
import {ensureSkillDistillationDemo} from './skill-distillation-demo.js';
import {handleSkillDiscovery,submitSkillDiscovery} from './skill-discovery-ui.js';
import {initLocalAgents,renderLocalAgentWorkspace,handleLocalAgents,submitLocalAgents,inputLocalAgents} from './local-agents.js';
import {handleContextShortcut} from './context-shortcuts.js';
import {renderTaskCenter,handleTaskCenter,submitTaskCenter,inputTaskCenter} from './task-center-ui.js';
import {initTaskCenter,centerRoute} from './task-center-model.js';
import {renderExperts,handleExperts,submitExperts,inputExperts} from './experts-ui.js';
import {agentThread,syncAgentThreads,focusAgentTask,selectedAgentTask} from './agent-conversations.js';
import {renderAgentConversation,renderAgentPins,handleConversation,submitConversation,inputConversation,initConversationInteractions} from './conversation-ui.js';
import {initOffice,seedOfficeTask,detectScenario} from './office-model.js';
import {renderOffice,renderOfficeBar,handleOffice,submitOffice,inputOffice,tickOffice,initOfficeInteractions} from './office-ui.js';
import {esc,icon,uid,loadState,saveState,initialState,newTask,download,STORAGE_KEY} from './core.js';
import {renderHome,renderChat,handleChat,submitChat,inputChat,tickTasks,sendMessage} from './chat.js';
import {initCatalog,renderCatalog,handleCatalog,submitCatalog,inputCatalog} from './catalog.js';
import {initWorkspace,renderWorkspace,handleWorkspace,submitWorkspace,inputWorkspace} from './workspace.js';
import {initTaskFiles,handleViewer,submitViewer,initViewerInteractions} from './viewer.js';
import {initPersonal,renderPersonalDock,renderPersonalHome,handlePersonal,collectMemorySnapshot,markPersonalRead,normalizePersonalRoute} from './personal.js';

import {initTeamSpace,validateTeamTask} from './team-model.js';
import {renderTeamSpace,renderTeamHome,handleTeamSpace,submitTeamSpace,inputTeamSpace} from './team-space.js';
import {getTeamComposer,openTeamTask,renderTeamTask,resetTeamDraft,requestTeamAuthorization,handleTeamContext,normalizeTeamRoute} from './team-context.js';

import {initSites} from './site-model.js';
import {renderSites,renderSiteTaskCard,handleSites,submitSites,inputSites} from './sites.js';
import {getSiteComposer,prepareSiteTask,resetSiteComposer,renderSiteTask,validateSiteTask} from './site-context.js';

let savedSitesBaseline,savedTasksBaseline=new Map();try{const stored=JSON.parse(localStorage.getItem(STORAGE_KEY));savedSitesBaseline=JSON.stringify(stored?.workspace?.sites);savedTasksBaseline=new Map((stored?.tasks||[]).map(task=>[task.id,JSON.stringify(task)]));}catch{}
const state=loadState();initCatalog(state);initWorkspace(state);initPersonal(state);initSecretary(state);initPersonalHub(state);initPersonalConversation(state);initTeamSpace(state);initSites(state);initLocalAgents(state);initSkillDiscovery(state);initOffice(state);initTaskCenter(state);initTaskEvents(state);normalizeComposerModels(state);syncAgentThreads(state);initSidebarLayout(state);
const defaultSkillExample=ensureSkillDistillationDemo(state);pinDefaultSkillExample(state,defaultSkillExample.task);
for(const c of [state.composer,...state.tasks]){if(c.permission==='需要审批')c.permission='请求批准';if(c.permission==='仅规划'){c.permission='请求批准';c.mode='计划模式';}}
for(const t of state.tasks){if(t.status==='running')t.status='paused';if(t.status==='complete'&&!t.personalNote&&!t.files.length&&!t.scheduleDraft&&!t.siteRequest&&t.mode!=='计划模式')initTaskFiles(t,t.kind);}
const ui={route:location.hash.slice(1)||'home',modal:null,popover:null,scenario:'',stepsOpen:false,collapsed:false,sidebarOpen:false,lastRoute:'',modalSequence:0};
if(normalizeTeamRoute(state,normalizePersonalRoute(ui.route))!==ui.route){ui.route=normalizeTeamRoute(state,normalizePersonalRoute(ui.route));history.replaceState(null,'','#'+ui.route);}
ui.pageTabs=loadPageTabs();
const app=document.querySelector('#app');let toastTimer;
function currentTask(){return ui.route.startsWith('chat/')?state.tasks.find(t=>t.id===ui.route.split('/')[1]):ui.route.startsWith('agent/')?selectedAgentTask(state,ui.route.slice(6)):null;}
function mergeTaskChanges(latestTasks){
 if(!Array.isArray(latestTasks))return {tasks:state.tasks};
 const local=new Map(state.tasks.map(task=>[task.id,task])),remote=new Map(latestTasks.map(task=>[task.id,task])),merged=new Map();
 for(const id of new Set([...local.keys(),...remote.keys(),...savedTasksBaseline.keys()])){
  const here=local.get(id),there=remote.get(id),base=savedTasksBaseline.get(id),hereText=here?JSON.stringify(here):undefined,thereText=there?JSON.stringify(there):undefined;
  if(hereText===thereText){if(here)merged.set(id,here);continue;}
  if(hereText===base){if(there)merged.set(id,there);continue;}
  if(thereText===base){if(here)merged.set(id,here);continue;}
  // A fresh browser can seed the same built-in examples before another tab's
  // first save. They are independent of site editing and keep their local copy.
  if(base===undefined&&here&&there&&!here.siteRequest&&!there.siteRequest){merged.set(id,here);continue;}
  if(!there)return {error:'这段对话已在其他页面删除，当前输入仍保留。请复制输入后刷新页面。'};
  if(!here)return {error:'这段对话已在其他页面更新，本次删除未保存。请刷新页面后再确认。'};
  return {error:'这段对话已在其他页面修改，当前输入和网页草稿仍保留。请复制输入后刷新页面，避免覆盖新内容。'};
 }
 // Retain the current page's ordering and append conversations it has not seen.
 return {tasks:[...local.keys(),...remote.keys()].filter((id,index,ids)=>ids.indexOf(id)===index&&merged.has(id)).map(id=>merged.get(id))};
}
function refreshSites(){
 ui.saveError='';
 try{
  const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)),latest=stored?.workspace?.sites,merged=mergeTaskChanges(stored?.tasks);
  if(merged.error){ui.saveError=merged.error;toast(merged.error);return false;}
  state.tasks=merged.tasks;if(Array.isArray(stored?.tasks))savedTasksBaseline=new Map(stored.tasks.map(task=>[task.id,JSON.stringify(task)]));
  if(Array.isArray(latest)){savedSitesBaseline=JSON.stringify(latest);state.workspace.sites=latest;initSites(state);}return true;
 }catch{ui.saveError='暂时无法读取站点，请稍后刷新';toast(ui.saveError);return false;}
}
function save(){
 ui.saveError='';
 const previousTasks=state.tasks,previousSites=state.workspace.sites;
 try{
  const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)),latest=stored?.workspace?.sites,serialized=JSON.stringify(latest),merged=mergeTaskChanges(stored?.tasks);
  if(merged.error){ui.saveError=merged.error;toast(merged.error);return false;}
  if(Array.isArray(latest)&&serialized!==savedSitesBaseline){
   if(JSON.stringify(state.workspace.sites)!==savedSitesBaseline){ui.saveError='站点已在其他页面更新，请刷新后重试；当前草稿仍保留';toast(ui.saveError);return false;}
   state.workspace.sites=latest;initSites(state);
  }
  state.tasks=merged.tasks;if(state.office)syncAgentThreads(state);
  if(reconcileConversation(state))ui.pendingPersonalRender=true;
  saveState(state);refreshPersonalNav();savedSitesBaseline=JSON.stringify(state.workspace.sites);savedTasksBaseline=new Map(state.tasks.map(task=>[task.id,JSON.stringify(task)]));return true;
 }catch{state.tasks=previousTasks;state.workspace.sites=previousSites;ui.saveError='本地存储空间不足，本次修改尚未持久保存';toast(ui.saveError);return false;}
}
function refreshPersonalNav(){const node=document.querySelector('.personal-nav');if(node)node.outerHTML=node.closest('.conversation-sidebar')?renderPersonalAgentEntry(ctx):renderPersonalDock(ctx);}
function readVisiblePersonalResults(){const talk=document.querySelector('.talk-scroll');if(ui.route!=='personal'||document.hidden||ui.modal||ui.popover||!talk||talk.scrollHeight-talk.scrollTop-talk.clientHeight>70)return;if(markPersonalRead(state))save();}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),2800);}
function go(route,afterNavigate,{restoreConversation=false}={}){route=normalizeTeamRoute(state,normalizePersonalRoute(route));ui.modal=null;delete ui.teamPendingSend;ui.popover=null;ui.sidebarOpen=false;ui.restorePageIdentity=restoreConversation?route:null;ui.afterNavigate=afterNavigate?{route,run:afterNavigate}:null;state.composer.project='';if(ui.route===route){ui.afterNavigate=null;render();afterNavigate?.();return;}ui.navigationTarget=route;location.hash=route;}
function modal(title,body,options={}){ui.popover=null;ui.modal={title,body,...options,id:++ui.modalSequence};render();requestAnimationFrame(()=>document.querySelector('.modal input:not([type=hidden]),.modal textarea,.modal button')?.focus());}
function closeModal(){ui.modal=null;delete ui.teamPendingSend;render();}
function popover(el,body,width=290){const rect=el.getBoundingClientRect();ui.popover={body,width,x:Math.max(12,Math.min(rect.left,innerWidth-width-12)),y:rect.bottom+8,up:rect.bottom>innerHeight*.64,anchorTop:rect.top};render();}
function startTask(prompt,options={}){
 const config={...state.composer,...options,project:''};
 const issue=validateTeamTask(state,config)||(config.siteRequest?validateSiteTask(state,config):'');if(issue){toast(issue);return null;}
 const fromHome=ui.route==='home',homeProjectId=fromHome?state.sidebarLayout?.composeProjectId||'':'';
 const navigationProject=fromHome&&!config.teamOrigin&&!config.siteRequest?draftProject(state):null;
 const t=newTask(prompt,config);
 if(config.siteRequest)t.siteRequest=structuredClone(config.siteRequest);
 t.teamOrigin=config.teamOrigin?structuredClone(config.teamOrigin):null;
 t.ownerId=state.teamSpace?.userId||'me';
 t.teamAssetSnapshot=config.teamAssetSnapshot?structuredClone(config.teamAssetSnapshot):null;
 t.customInstructions=[state.settings?.personalization?.instructions,config.customInstructions,navigationProject?.instructions].filter(Boolean).join('\n\n');
 t.memorySnapshot=collectMemorySnapshot(state);t.context=structuredClone(config.context||[]);
 // Space and site tasks retain their own validated execution paths.
 if(state.office&&!config.teamOrigin&&!config.siteRequest&&!config.scheduleDraft&&config.origin!=='schedule'&&config.mode!=='计划模式'&&(options.agentId||options.officeScenario||(t.kind!=='office'&&config.mode!=='目标模式'))&&(!config.expert||options.agentId||options.officeScenario)){
  seedOfficeTask(t,options.officeScenario||detectScenario(prompt),config);
  t.office.conversationId=options.conversationId||uid('conversation');
 }
 if(!t.office)t.messages.push(createTaskIntakeMessage(t));
 if(!t.teamOrigin&&!t.siteRequest)registerSkillOffer(state,t.office?.agentId||'personal',prompt,t.id);
 state.tasks.unshift(t);if(navigationProject)assignDraftProject(state,t);
 if(fromHome&&state.sidebarLayout)state.sidebarLayout.composeProjectId='';
 if(save()===false){state.tasks.shift();if(fromHome&&state.sidebarLayout)state.sidebarLayout.composeProjectId=homeProjectId;if(navigationProject)delete state.sidebarLayout.assignments[t.id];return null;}
 if(t.office){registerSkillOffer(state,t.office.agentId,prompt,t.id);focusAgentTask(state,t);ui.conversationPanelOpen=true;ui.cvPanelMode='work';ui.cvPanelOwner=t.office.agentId;ui.cvScrollBottom=true;save();}
 go(`chat/${t.id}`);return t.id;
}
function continueTask(id,prompt,options={}){const t=state.tasks.find(t=>t.id===id);if(!t)return null;const issue=validateTeamTask(state,t);if(issue){toast(issue);return null;}t.messages.push({role:'user',text:prompt,time:Date.now()});t.status='running';t.progress=0;t.elapsed=0;t.pendingEdits=!!t.submittedAnnotations?.length;if(options.permission)t.permission=options.permission;if(options.model)t.model=options.model;save();go(`chat/${id}`);return id;}
function scrollChat(){requestAnimationFrame(()=>{const el=document.querySelector('.chat-scroll');if(el)el.scrollTop=el.scrollHeight;});}
const ctx={state,ui,esc,icon,save,render,go,toast,modal,closeModal,popover,download,startTask,continueTask,currentTask,scrollChat,renderPersonalHome,renderPersonalDock,collectMemorySnapshot,handleWorkspace,handlePersonalHub,handleSecretary,focusTalk:()=>requestAnimationFrame(()=>document.getElementById('personal-talk-input')?.focus({preventScroll:true})),isInteracting:()=>pointerHeld};
ctx.refreshSites=refreshSites;
ctx.siteComposer=()=>getSiteComposer(ctx);
ctx.prepareSiteTask=id=>prepareSiteTask(ctx,id);
ctx.resetSiteComposer=draft=>resetSiteComposer(state,draft);
ctx.renderSiteTaskCard=t=>renderSiteTaskCard(ctx,t);
ctx.handleSiteAction=(action,el)=>handleSites(action,el,ctx);
ctx.teamComposer=()=>getTeamComposer(ctx);
ctx.useTeamAsset=(teamId,type,resourceId,prompt)=>openTeamTask(ctx,teamId,type,resourceId,prompt);
ctx.requestTeamAuthorization=(task,resume)=>requestTeamAuthorization(ctx,task,resume);
ctx.sendCurrentDraft=()=>sendMessage(ctx);
ctx.validateTask=task=>validateTeamTask(state,task)||validateSiteTask(state,task);
ctx.resetTeamDraft=draft=>resetTeamDraft(state,draft);
ctx.renderTeamHome=()=>renderTeamHome(ctx);
function navItem(route,name,ico){const active=ui.route===route||(route==='teams'&&(ui.route.startsWith('team/')||ui.route.startsWith('team-task/')))||(route==='task-center'&&ui.route==='schedules')||(route==='experts'&&(ui.route.startsWith('agent/')||ui.route==='expert-config'))||(route==='plugins'&&['skills','mcp'].includes(ui.route));return `<button class="nav-item ${active?'active':''}" data-action="app:go" data-route="${route}" title="${name}">${icon(ico,19)}<span>${name}</span></button>`;}
const settingsGroups=[['个人',[['appearance','sun','外观'],['general','settings','常规'],['profile','user','个人资料'],['personalization','sliders','个性化'],['memory','memory','记忆'],['shortcuts','bolt','快捷键'],['voice','mic','语音'],['migration','upload','迁移']]],['环境',[['computer','monitor','操作电脑'],['browser','globe','操作浏览器'],['selection','edit','划词工具栏'],['runtime','terminal','运行环境'],['worktrees','folder','工作树']]],['扩展',[['plugins','plugin','插件'],['skills','bolt','技能'],['mcp','code','MCP'],['commands','terminal','命令'],['hooks','bolt','Hook'],['agents','expert','子智能体'],['models','cpu','模型服务'],['ai-plan','sparkles','AI Plan 配置'],['ranking','chart','模型排行'],['status','activity','服务状态'],['archived','history','已归档的聊天']]]];
function sidebar(){if(ui.route.startsWith('settings/'))return `<aside class="sidebar settings-sidebar"><div class="sidebar-brand"><span class="brand-symbol"><img class="xiaoyou-mascot" src="./assets/xiaoyou.png" alt=""></span><strong>小悠</strong><span class="brand-version">设置</span></div><button class="nav-item return-app" data-action="app:go" data-route="home">${icon('back',18)}<span>返回应用</span></button><div class="settings-nav-search">${icon('search',16)}<input data-live="app:settings-search" placeholder="搜索设置…" aria-label="搜索设置"></div><div class="sidebar-scroll">${settingsGroups.map(([label,items])=>`<div class="sidebar-section-label">${label}</div>${items.map(([id,i,n])=>navItem(['plugins','skills','mcp','ai-plan'].includes(id)?id:'settings/'+id,n,i)).join('')}`).join('')}</div></aside>`;
 return renderConversationSidebar(ctx);
}
function renderSettingsStub(){const items={selection:['划词工具栏','选中文字后的快捷操作'],worktrees:['工作树','代码项目的独立工作目录'],commands:['命令','对话中的快捷命令'],hooks:['Hook','任务生命周期中的触发动作'],agents:['子智能体','专门处理特定任务的智能体'],models:['模型服务','模型提供方与连接配置'],ranking:['模型排行','不同模型的表现比较'],status:['服务状态','服务与连接的可用情况'],archived:['已归档的聊天','已归档会话的管理入口']};const entry=items[ui.route.split('/')[1]];if(!ui.route.startsWith('settings/')||!entry)return '';return `<section class="work-settings"><header class="page-head"><div><h1>${esc(entry[0])}</h1><p class="muted">${esc(entry[1])}</p></div><span class="badge">入口预留</span></header><div class="empty-state"><span class="settings-stub-icon">${icon('sliders',32)}</span><h3>已保留此设置入口</h3><p>这一配置入口已保留，具体配置功能尚未补齐。<br>先保留原有位置，后续按实际页面补齐。</p><button class="btn" data-action="app:go" data-route="settings/appearance">返回已实现的设置</button></div></section>`;}
function applyTheme(){const appearance=state.settings?.appearance||{};const actual=appearance.theme==='system'?(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'):appearance.theme||'light';document.documentElement.dataset.theme=actual;document.documentElement.dataset.mascot=appearance.mascot||'ocean';document.documentElement.dataset.textWeight=appearance.weight||'standard';document.documentElement.style.setProperty('--chat-font-weight',appearance.weight==='medium'?'500':'400');}
function formKey(form){return (form.dataset.form||form.id||'')+'|'+(form.dataset.task||'')+'|'+(form.dataset.identity||'')+'|'+[...form.querySelectorAll('input[type=hidden]')].map(el=>el.name+'='+el.value).join('&');}
function captureForms(){return [...document.querySelectorAll('.main-stage form')].filter(form=>form.dataset.form!=='cv:send').map(form=>({key:formKey(form),values:[...form.elements].filter(el=>el.name&&!['file','hidden','submit','button'].includes(el.type)).map(el=>({name:el.name,type:el.type,value:el.value,checked:el.checked}))}));}
function restoreForms(snapshots){for(const form of document.querySelectorAll('.main-stage form')){const snapshot=snapshots.find(s=>s.key===formKey(form));if(!snapshot)continue;for(const item of snapshot.values){const el=[...form.elements].find(el=>el.name===item.name&&(!['radio','checkbox'].includes(item.type)||el.value===item.value));if(!el)continue;if(item.type==='radio'||item.type==='checkbox')el.checked=item.checked;else el.value=item.value;}}}
function render(){
 const pageTabsLeft=document.querySelector('.workspace-tab-list')?.scrollLeft||0;
 ui.pageViews||={};const previousRoute=ui.lastRoute;if(previousRoute&&previousRoute!==ui.route)ui.pageViews[previousRoute]={...capturePageView(document),forms:captureForms()};let restoringPage=previousRoute!==ui.route?ui.pageViews[ui.route]:null;if(restoringPage?.agentId){if(restorePageConversation(state,ui.route,restoringPage,{activate:ui.restorePageIdentity===ui.route})){ui.cvPanelOwner=restoringPage.agentId;ui.cvPanelMode=restoringPage.panelMode;ui.conversationPanelOpen=restoringPage.panelOpen;}else restoringPage=null;}ui.restorePageIdentity=null;
 ui.pageTabs=visitPageTab(ui.pageTabs,ui.route);storePageTabs(ui.pageTabs);
 document.documentElement.dataset.workspace=(ui.route==='teams'||ui.route.startsWith('team/')||ui.route.startsWith('team-task/'))?'team':'';ui.pendingTaskRender=false;ui.pendingPersonalRender=false;syncAgentThreads(state);reconcileConversation(state);applyTheme();const oldRoute=ui.lastRoute;const oldOfficeView=document.querySelector('[data-office-view]')?.dataset.officeView;const formDrafts=oldRoute===ui.route?captureForms():[];const active=document.activeElement;const focused=active?.id?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:active?.dataset.live?{live:active.dataset.live,start:active.selectionStart,end:active.selectionEnd}:null;
 const childOld=document.querySelector('[data-child-view]');ui.childScroll||={};if(childOld)ui.childScroll[childOld.dataset.childView]=childOld.scrollTop;ui.parentChatScroll||={};const parentOld=document.querySelector('.cv-chat-scroll');const parentOwner=document.querySelector('[data-agent-conversation]')?.dataset.conversationId;if(parentOld&&parentOwner)ui.parentChatScroll[parentOwner]=parentOld.scrollTop;
 const cvOld=document.querySelector('[data-agent-conversation]')?.dataset.conversationId;const cvChat=document.querySelector('.cv-chat-scroll');const cvTop=cvChat?.scrollTop||0;const cvNearBottom=cvChat?cvChat.scrollHeight-cvChat.scrollTop-cvChat.clientHeight<100:true;const cvPanel=document.querySelector('.cv-panel-scroll');const cvPanelTop=cvPanel?.scrollTop||0;const cvPanelView=document.querySelector('.cv-workpanel')?.dataset.officeView;const oldScroll=document.querySelector('.chat-scroll,.of-work-scroll');const chatScroll=oldScroll?.scrollTop;const nearBottom=oldScroll?oldScroll.scrollHeight-oldScroll.scrollTop-oldScroll.clientHeight<70:true;const mainScroll=document.querySelector('.page-scroll')?.scrollTop||0;const sideScroll=document.querySelector('.sidebar-scroll')?.scrollTop||0;const oldTalk=document.querySelector('.talk-scroll'),talkScroll=oldTalk?.scrollTop||0,talkAtEnd=oldTalk?oldTalk.scrollHeight-oldTalk.scrollTop-oldTalk.clientHeight<70:true;
 const centerMain=document.querySelector('.tc-main-scroll');const centerMainTop=centerMain?.scrollTop||0;const centerMainKey=centerMain?.dataset.tcMainKey;
 const officeContent=renderLocalAgentWorkspace(ctx)||renderTaskCenter(ctx)||renderMarketPage(ctx)||renderExperts(ctx)||renderAgentConversation(ctx);
 const content=officeContent||(ui.route==='sites'?renderSites(ctx):ui.route.startsWith('site-task/')?renderSiteTask(ctx):ui.route==='teams'||ui.route.startsWith('team/')?renderTeamSpace(ctx):ui.route.startsWith('team-task/')?renderTeamTask(ctx):ui.route==='home'?renderHome(ctx):ui.route.startsWith('chat/')?renderChat(ctx):renderPersonalHub(ctx)||renderCatalog(ctx)||renderSettingsStub()||renderWorkspace(ctx)||'<div class="empty-state"><h2>没有找到这个页面</h2><button class="btn primary" data-action="app:go" data-route="home">返回首页</button></div>');
 app.innerHTML=`<div class="app-shell nav-shell ${ui.navCollapsed?'nav-conversations-collapsed':''} ${ui.collapsed?'sidebar-collapsed':''} ${ui.route.startsWith('settings/')?'settings-mode':''}">${renderFunctionRail(ctx)}${sidebar()}${ui.sidebarOpen?'<button class="sidebar-scrim" aria-label="关闭侧栏" data-action="app:mobile-sidebar"></button>':''}<div class="workspace-main">${renderPageTabs(state,ui.pageTabs,ui.route)}${ui.route==='home'&&draftProject(state)?`<div class="nav-project-context">${icon('folder',14)}<span>${esc(draftProject(state).name)}</span><small>新建项目会话</small><button data-action="nav:new-task" aria-label="退出项目，返回普通对话">${icon('close',14)}</button></div>`:''}<div class="main-stage" id="workspace-page" role="tabpanel"><button class="mobile-menu-btn icon-btn" data-action="app:mobile-sidebar" aria-label="打开导航">${icon('sidebar',20)}</button>${officeContent||ui.route==='personal'||ui.route==='home'||ui.route.startsWith('team-task/')||ui.route.startsWith('site-task/')||ui.route.startsWith('chat/')?content:`<main class="page-scroll">${content}<footer class="page-footer">小悠 · 交互演示 <button data-action="app:about">查看原型范围</button></footer></main>`}</div></div></div>${ui.modal?`<div class="modal-backdrop" data-action="app:backdrop"><section class="modal ${ui.modal.drawer?'drawer':''} ${ui.modal.wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">${esc(ui.modal.title)}</h2><button class="icon-btn" data-action="app:close-modal" aria-label="关闭弹窗">${icon('close',20)}</button></header><div class="modal-body">${ui.modal.body}</div></section></div>`:''}${ui.popover?`<div class="floating-popover" role="menu" style="width:${ui.popover.width}px;left:${ui.popover.x}px;${ui.popover.up?'bottom:'+(innerHeight-ui.popover.anchorTop+8)+'px':'top:'+ui.popover.y+'px'}">${ui.popover.body}</div>`:''}`;
 if(oldRoute===ui.route){const tabs=document.querySelector('.workspace-tab-list');if(tabs)tabs.scrollLeft=pageTabsLeft;restoreForms(formDrafts);const sc=document.querySelector('.chat-scroll,.of-work-scroll');if(sc)sc.scrollTop=sc.classList.contains('of-work-scroll')?(oldOfficeView===document.querySelector('[data-office-view]')?.dataset.officeView?chatScroll:0):(nearBottom?sc.scrollHeight:chatScroll);const pg=document.querySelector('.page-scroll');if(pg)pg.scrollTop=mainScroll;}
 const side=document.querySelector('.sidebar-scroll');if(side)side.scrollTop=sideScroll;const talk=document.querySelector('.talk-scroll');if(talk)talk.scrollTop=ui.talkScrollBottom||oldRoute!==ui.route||talkAtEnd?talk.scrollHeight:talkScroll;ui.talkScrollBottom=false;readVisiblePersonalResults();
 const childNext=document.querySelector('[data-child-view]');if(childNext)childNext.scrollTop=ui.childScroll[childNext.dataset.childView]||0;
 const nextCv=document.querySelector('[data-agent-conversation]');if(nextCv){const chat=document.querySelector('.cv-chat-scroll');if(chat)chat.scrollTop=childOld?(ui.parentChatScroll[nextCv.dataset.conversationId]||0):ui.cvScrollBottom||cvOld!==nextCv.dataset.conversationId||cvNearBottom?chat.scrollHeight:cvTop;ui.cvScrollBottom=false;const panel=document.querySelector('.cv-panel-scroll');if(panel)panel.scrollTop=cvPanelView===document.querySelector('.cv-workpanel')?.dataset.officeView?cvPanelTop:0;if(ui.cvScrollTask){const target=[...document.querySelectorAll('.cv-task-anchor')].find(n=>n.dataset.conversationTask===ui.cvScrollTask);target?.scrollIntoView({block:'start'});ui.cvScrollTask=null;}}
 if(oldRoute===ui.route){const main=document.querySelector('.tc-main-scroll');if(main)main.scrollTop=centerMainKey===main.dataset.tcMainKey?centerMainTop:0;}
 if(focused){const el=focused.id?document.getElementById(focused.id):document.querySelector(`[data-live="${focused.live}"]`);if(el){el.focus({preventScroll:true});if(typeof focused.start==='number'&&el.setSelectionRange)try{el.setSelectionRange(focused.start,focused.end);}catch{}}}
 if(restoringPage){restoreForms(restoringPage.forms||[]);restorePageView(document,restoringPage);}
 if(oldRoute!==ui.route&&ui.route.startsWith('chat/')&&!restoringPage)scrollChat();ui.lastRoute=ui.route;refreshVoiceUI(ctx);if(oldRoute!==ui.route)document.querySelector('.workspace-tab.is-active')?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function searchResults(q=''){q=q.trim().toLowerCase();return state.tasks.filter(t=>(t.title+' '+t.prompt).toLowerCase().includes(q)).map(t=>`<button class="search-result" data-action="app:go" data-route="chat/${t.id}">${icon('chat',18)}<span><strong>${esc(t.title)}</strong><small>${esc(t.prompt.slice(0,70))}</small></span>${icon('chevron',15)}</button>`).join('')||'<div class="empty-state compact"><p>没有找到相关对话</p></div>';}
function handleApp(action,el){switch(action){
 case 'app:demo-menu':popover(el,`<div class="popover-label">体验完整对话流程</div><button data-action="app:demo-intake">${icon('chat',17)}任务预估与 Skill 推荐</button><button data-action="app:demo-distill">${icon('bolt',17)}重复工作 → 保存 Skill</button><button data-action="office:home-methods">${icon('bolt',17)}查看推荐工作方法</button><div class="divider"></div><button data-action="app:about">${icon('info',17)}原型说明</button>`,280);break;
 case 'app:open-skill-example':
 case 'app:demo-distill':{const {task}=ensureSkillDistillationDemo(state);focusAgentTask(state,task);ui.cvPanelOwner=task.office.agentId;ui.conversationPanelOpen=false;ui.cvPanelMode='summary';ui.cvScrollBottom=true;if(save()!==false)go('chat/'+task.id,()=>{ui.cvScrollTask=null;ui.cvScrollBottom=true;render();});break;}
 case 'app:demo-intake':{const id=startTask('请分析上周经营变化，交叉核对多份数据，整理图文周报和一份汇报 PPT，标注异常与待确认事项。',{agentId:'personal',officeScenario:'review'});if(id){state.tasks.find(t=>t.id===id).title='任务预估与 Skill 推荐 · 演示';ui.conversationPanelOpen=false;ui.cvPanelMode='summary';save();}break;}
 case 'app:go':go(el.dataset.route);break;
 case 'app:page-tab':go(el.dataset.route,()=>document.querySelector('.workspace-tab.is-active .workspace-tab-select')?.focus({preventScroll:true}),{restoreConversation:true});break;
 case 'app:close-page-tab':{const result=closePageTab(ui.pageTabs,el.dataset.route,ui.route);ui.pageTabs=result.tabs;storePageTabs(ui.pageTabs);go(result.route,undefined,{restoreConversation:true});break;}
 case 'app:dismiss-remote-banner':ui.remoteBannerDismissed=true;render();break;
 case 'app:collapse':ui.collapsed=!ui.collapsed;render();break;
 case 'app:mobile-sidebar':ui.sidebarOpen=!ui.sidebarOpen;render();break;
 case 'app:more':popover(el,`<div class="popover-label">更多工作方式</div>${[['remote','remote','远程控制'],['sites','globe','站点'],['knowledge','book','知识库'],['insights','sun','工作洞察'],['ai-plan','sparkles','AI Plan 配置']].map(([r,i,n])=>`<button data-action="app:go" data-route="${r}">${icon(i,18)}${n}</button>`).join('')}`);break;
 case 'app:account':popover(el,`<div class="popover-label">${esc(state.settings?.profile?.name||'Tyler')} · 个人工作空间</div><button data-action="app:go" data-route="settings/appearance">${icon('settings')}设置</button><button data-action="app:about">${icon('info')}关于小悠原型</button>`);break;
 case 'app:all-tasks':ui.allTasks=!ui.allTasks;render();break;
 case 'app:search':modal('搜索对话',`<div class="global-search-input">${icon('search',20)}<input id="global-search" data-live="app:search" placeholder="搜索任务名称和内容…" aria-label="搜索任务"></div><div id="search-results">${searchResults()}</div>`);break;
 case 'app:task-menu':{const t=state.tasks.find(t=>t.id===el.dataset.id);if(!t)return true;popover(el,`<button data-action="app:rename-task" data-id="${t.id}">${icon('edit')}重命名</button><button data-action="app:duplicate-task" data-id="${t.id}">${icon('copy')}复制对话</button><button data-action="app:export-task" data-id="${t.id}">${icon('download')}导出对话</button><div class="divider"></div><button class="danger-text" data-action="app:delete-task" data-id="${t.id}">${icon('trash')}删除对话</button>`);break;}
 case 'app:rename-task':{const t=state.tasks.find(t=>t.id===el.dataset.id);modal('重命名对话',`<form data-form="app:rename-task"><input type="hidden" name="id" value="${t.id}"><label class="field">对话名称<input name="title" value="${esc(t.title)}" maxlength="80" required></label><div class="form-actions"><button class="btn primary">保存</button></div></form>`);break;}
 case 'app:duplicate-task':{const t=structuredClone(state.tasks.find(t=>t.id===el.dataset.id));t.id=uid('task');t.title+=' · 副本';t.createdAt=Date.now();t.origin='duplicate';delete t.personalFollow;if(t.status==='running')t.status='paused';state.tasks.unshift(t);save();go('chat/'+t.id);break;}
 case 'app:export-task':{const t=state.tasks.find(t=>t.id===el.dataset.id);download(t.title+'.md',`# ${t.title}\n\n`+t.messages.map(m=>`## ${m.role==='user'?'你':'小悠'}\n\n${m.text}`).join('\n\n'),'text/markdown;charset=utf-8');toast('已导出对话文字');break;}
 case 'app:delete-task':modal('删除这段对话？',`<p>这会删除本地原型中的对话、成果和批注。</p><div class="form-actions"><button class="btn" data-action="app:close-modal">取消</button><button class="btn danger" data-action="app:confirm-delete-task" data-id="${el.dataset.id}">删除对话</button></div>`);break;
 case 'app:confirm-delete-task':state.tasks=state.tasks.filter(t=>t.id!==el.dataset.id);save();closeModal();if(ui.route==='chat/'+el.dataset.id)go('home');else render();break;
 case 'app:close-modal':closeModal();break;
 case 'app:backdrop':if(el===eventTarget)closeModal();break;
 case 'app:about':modal('小悠 · 交互原型',`<div class="about-brand"><img src="./assets/xiaoyou.png" alt=""><div><h3>让工作从容一点</h3><p>个人任务、团队资源与站点发布</p></div></div><p>这一版保留原产品的导航、对话工作区、成果预览、能力配置和定时任务等流程，替换为小悠的视觉风格。</p><div class="notice">当前为前端交互原型：任务与业务资料为合成示例，模型执行、授权、远程控制和定时调度均未连接真实服务。你的修改只保存在当前浏览器。</div><p>已能实际操作：创建团队空间、管理插件／助理／知识库、邀请成员和配置角色、个人账号连接、私人任务、文件预览与批注。邀请和角色变化只保存在当前浏览器，不会向真实同事发送通知，也未接入多人同步。</p>${state.legacyProjectArchive?'<p>旧项目资料已归档，原有对话和成果仍在个人对话列表。</p><button class="btn" data-action="app:export-legacy-projects">导出旧项目资料</button>':''}<div class="form-actions"><button class="btn ghost danger" data-action="app:reset-dialog">重置演示数据</button><button class="btn primary" data-action="app:close-modal">开始体验</button></div>`);break;
 case 'app:export-legacy-projects':download('旧项目资料归档.json',JSON.stringify(state.legacyProjectArchive,null,2),'application/json');toast('已导出旧项目资料');break;
 case 'app:reset-dialog':modal('重置演示数据',`<p>清空本版原型的本地修改并恢复示例。此前的程伴 Demo 不受影响。</p><div class="form-actions"><button class="btn" data-action="app:close-modal">取消</button><button class="btn danger" data-action="app:reset">确认重置</button></div>`);break;
 case 'app:reset':localStorage.removeItem(STORAGE_KEY);location.hash='home';location.reload();break;
 default:return false;
 }return true;}
let eventTarget;
document.addEventListener('click',e=>{eventTarget=e.target;const el=e.target.closest('[data-action]');if(!el){if(ui.popover&&!e.target.closest('.floating-popover')){ui.popover=null;document.querySelector('.floating-popover')?.remove();}return;}if(el.disabled)return;const action=el.dataset.action;if(ui.popover){ui.popover=null;document.querySelector('.floating-popover')?.remove();}try{if(handleSidebar(action,el,ctx)||handlePersonalSchedule(action,el,ctx)||handlePersonalConversation(action,el,ctx)||handlePersonalWelcome(action,el,ctx)||handlePersonalContext(action,el,ctx)||handlePersonalHub(action,el,ctx)||handleDiary(action,el,ctx)||handleSecretary(action,el,ctx)||handleVoice(action,el,ctx)||handleFollowup(action,el,ctx)||handleSkillDiscovery(action,el,ctx)||handleLocalAgents(action,el,ctx)||handleContextShortcut(action,el,ctx)||handleTaskCenter(action,el,ctx)||handleExperts(action,el,ctx)||handleConversation(action,el,ctx)||handleOffice(action,el,ctx)||handleSites(action,el,ctx)||handleTeamContext(action,el,ctx)||handleTeamSpace(action,el,ctx)||handleApp(action,el)||handleChat(action,el,ctx)||handleViewer(action,el,ctx)||handleCatalog(action,el,ctx)||handleWorkspace(action,el,ctx)||handlePersonal(action,el,ctx))return;}catch(error){console.error(error);toast('这一步没有完成，请重试');}});
document.addEventListener('submit',e=>{const form=e.target.closest('[data-form]');if(!form)return;e.preventDefault();if(!form.reportValidity())return;const name=form.dataset.form;try{if(submitSidebar(name,form,ctx)||submitSkillDiscovery(name,form,ctx)||submitLocalAgents(name,form,ctx)||submitTaskCenter(name,form,ctx)||submitExperts(name,form,ctx)||submitConversation(name,form,ctx)||submitOffice(name,form,ctx))return;if(name==='app:rename-task'){const v=Object.fromEntries(new FormData(form));if(!v.title.trim()){toast('请输入对话名称');return;}state.tasks.find(t=>t.id===v.id).title=v.title.trim();save();closeModal();return;}submitSites(name,form,ctx)||submitTeamSpace(name,form,ctx)||submitChat(name,form,ctx)||submitViewer(name,form,ctx)||submitCatalog(name,form,ctx)||submitWorkspace(name,form,ctx)||submitPersonalConversation(name,form,ctx)||submitPersonalContext(name,form,ctx)||submitPersonalHub(name,form,ctx)||submitDiary(name,form,ctx)||submitSecretary(name,form,ctx);}catch(error){console.error(error);toast('表单尚未保存，请检查输入');}});
function inputEvent(e){const el=e.target;if(el.dataset.live==='app:search'){document.querySelector('#search-results').innerHTML=searchResults(el.value);return;}if(el.dataset.live==='app:settings-search'){document.querySelectorAll('.settings-sidebar .nav-item:not(.return-app)').forEach(n=>n.hidden=!n.textContent.includes(el.value));return;}inputLocalAgents(el,ctx)||inputExperts(el,ctx)||inputTaskCenter(el,ctx)||inputConversation(el,ctx)||inputOffice(el,ctx)||inputSites(el,ctx)||inputTeamSpace(el,ctx)||inputChat(el,ctx)||inputCatalog(el,ctx)||inputWorkspace(el,ctx)||inputPersonalConversation(el,ctx);}
let pointerHeld=false;
function flushPendingTaskRender(){const el=document.activeElement;const editing=el?.matches('input,textarea,select,[contenteditable="true"]')&&el.id!=='task-prompt';if((ui.pendingTaskRender||ui.pendingPersonalRender)&&!pointerHeld&&!ui.modal&&!ui.popover&&!editing)render();}
document.addEventListener('pointerdown',()=>{pointerHeld=true;});document.addEventListener('pointerup',()=>{pointerHeld=false;setTimeout(flushPendingTaskRender,0);});document.addEventListener('pointercancel',()=>{pointerHeld=false;setTimeout(flushPendingTaskRender,0);});
document.addEventListener('focusout',()=>setTimeout(flushPendingTaskRender,0));
document.addEventListener('input',inputEvent);document.addEventListener('change',inputEvent);
document.addEventListener('keydown',e=>{
 if(e.target.matches('.workspace-tab-select')&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=[...document.querySelectorAll('.workspace-tab-select')],i=tabs.indexOf(e.target),n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;go(tabs[n].dataset.route,()=>document.querySelector('.workspace-tab.is-active .workspace-tab-select')?.focus({preventScroll:true}),{restoreConversation:true});return;}
 if(keyVoice(e,ctx)||keyFollowup(e,ctx))return;
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();handleApp('app:search',document.createElement('button'));return;}
 if(e.target.id==='personal-talk-input'&&conversationEnter(e)){e.preventDefault();e.target.form?.requestSubmit();return;}
 if(e.key==='Escape'){if(ui.modal){closeModal();return;}if(ui.popover){ui.popover=null;render();return;}const t=currentTask();if(t?.viewer?.max){t.viewer.max=false;render();return;}if(ui.sidebarOpen){ui.sidebarOpen=false;render();}return;}
 if(e.target.id==='task-prompt'&&e.key==='Enter'&&!e.isComposing){const mod=state.settings?.shortcuts?.send==='mod-enter';if((mod&&(e.metaKey||e.ctrlKey))||(!mod&&!e.shiftKey&&!e.metaKey&&!e.ctrlKey)){e.preventDefault();handleChat('chat:send',e.target,ctx);}return;}
 if(e.target.matches('[role="button"][data-action]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}
 if(e.key==='Tab'&&ui.modal){const list=[...document.querySelectorAll('.modal button,.modal input,.modal textarea,.modal select,.modal [tabindex="0"]')].filter(x=>!x.disabled&&x.offsetParent!==null);if(!list.length)return;const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
document.addEventListener('scroll',e=>{if(e.target?.classList?.contains('talk-scroll'))readVisiblePersonalResults();},true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)readVisiblePersonalResults();});
window.addEventListener('hashchange',()=>{ui.route=location.hash.slice(1)||'home';if(normalizeTeamRoute(state,normalizePersonalRoute(ui.route))!==ui.route){ui.route=normalizeTeamRoute(state,normalizePersonalRoute(ui.route));history.replaceState(null,'','#'+ui.route);}if(ui.navigationTarget!==ui.route)ui.restorePageIdentity=ui.route;ui.navigationTarget=null;ui.modal=null;delete ui.teamPendingSend;ui.popover=null;const next=ui.afterNavigate;ui.afterNavigate=null;save();render();if(next?.route===ui.route)next.run();});
window.__errors=[];window.addEventListener('error',e=>window.__errors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason)));
window.__xiaoyou={state,ui,ctx};initViewerInteractions(ctx);initOfficeInteractions(ctx);initConversationInteractions(ctx);save();render();setInterval(()=>{
 tickTasks(ctx);tickOffice(ctx);
 if(reconcileConversation(state)||ui.pendingPersonalRender){
  save();
  const active=document.activeElement;const editing=active?.matches('input,textarea,select,[contenteditable="true"]');
  if(!editing&&!pointerHeld&&!ui.modal&&!ui.popover)render();else ui.pendingTaskRender=true;
 }
},1000);
