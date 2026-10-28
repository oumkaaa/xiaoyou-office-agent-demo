// Exercise the emitted artifact in a minimal DOM host; this is not a browser layout test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {siteUrl} from '../frontend/src/site-model.js';

const html=readFileSync(new URL('../frontend/程小悠.html',import.meta.url),'utf8');
const script=html.match(/<script>\n([\s\S]*)\n<\/script>/)?.[1];
const base='file:///Users/example/程小悠.html';

function host(hash='#home',stored=new Map()){
 const nodes=new Map(),events={},timers=[];
 const node=()=>({innerHTML:'',textContent:'',hidden:false,srcdoc:'',dataset:{},style:{setProperty(){}},classList:{add(){},remove(){}},removeAttribute(name){delete this[name];}});
 for(const id of ['app','toast','app-styles','site-frame','site-empty','empty-title','empty-description','site-name','site-scope'])nodes.set('#'+id,node());
 const document={documentElement:node(),body:node(),activeElement:null,hidden:false,addEventListener(){},querySelector:s=>nodes.get(s)||null,querySelectorAll:()=>[],getElementById:id=>nodes.get('#'+id)||null};
 const location=new URL(base+hash);location.reload=()=>{location.reloads=(location.reloads||0)+1;};
 const localStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,String(v)),removeItem:k=>stored.delete(k)};
 const sandbox={document,location,localStorage,URL,Blob,console,structuredClone,TextEncoder,Date,FormData,
  setInterval:fn=>timers.push(fn),setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},matchMedia:()=>({matches:false}),
  history:{replaceState(_a,_b,hash){location.hash=hash;}},navigator:{},innerWidth:1280,innerHeight:800,
  addEventListener(name,fn){(events[name]||=[]).push(fn);},
 };
 sandbox.window=sandbox;
 const context=createContext(sandbox);new Script(script).runInContext(context);
 return {context,nodes,stored,location,timers,events,app:context.__xiaoyou};
}

test('one HTML contains all application assets and a valid classic script',()=>{
 assert.ok(script);
 new Script(script);
 assert.doesNotMatch(html,/<script[^>]+src=/i);
 assert.doesNotMatch(html,/<link[^>]+rel="stylesheet"/i);
 assert.doesNotMatch(script,/^import\s|^export\s/m);
 assert.doesNotMatch(script,/\.\/assets\//);
 assert.match(html,/data:image\/png;base64,/);
 assert.match(html,/data:image\/svg\+xml;base64,/);
});

test('standalone boots and renders home, team, member, plugin, expert, site and task routes',()=>{
 const h=host();assert.ok(h.app);
 const cases=[['home','今天，我们来做些什么'],['team/product/resources','空间资源'],['team/product/members','邀请成员'],['plugins','操作浏览器'],['experts','创建助理'],['sites','在会话中试用'],['chat/sample-dashboard','项目协作看板']];
 for(const [route,text] of cases){h.app.ui.route=route;h.app.ctx.render();assert.ok(h.nodes.get('#app').innerHTML.includes(text),route);}
 h.app.state.homeDraft='刷新后仍保留';h.app.ctx.save();
 assert.equal(host('#home',h.stored).app.state.homeDraft,'刷新后仍保留');
});

test('standalone site create, publish, open and return use the same HTML and preserve publication',()=>{
 const h=host(),c=h.app.ctx;
 c.prepareSiteTask();h.app.ui.route='site-task/new';
 c.siteComposer().draft='帮我创建一个网页，主题是「单文件验收周报」，包含本周进展和下周计划。';
 c.sendCurrentDraft();h.app.ui.route=h.location.hash.slice(1);
 const task=c.currentTask();assert.ok(task?.siteRequest);
 for(let i=0;i<10;i++)h.timers.forEach(fn=>fn());
 assert.equal(task.status,'complete');assert.ok(task.siteDraft);
 c.handleSiteAction('site:publish',{dataset:{task:task.id}});
 c.handleSiteAction('site:confirm-publish',{dataset:{task:task.id}});
 const site=h.app.state.workspace.sites.find(s=>s.status==='published');assert.ok(site);
 const link=h.app.ui.modal.body.match(/href="([^"]+#published\/[^\"]+)"/)?.[1];
 assert.ok(link);assert.equal(new URL(link).pathname,new URL(base).pathname);
 const pub=host(new URL(link).hash,h.stored);
 assert.equal(pub.nodes.get('#site-frame').hidden,false);
 assert.match(pub.nodes.get('#site-frame').srcdoc,/单文件验收周报/);
 assert.match(pub.context.document.body.innerHTML,/href="#sites"/);
 pub.location.hash='#sites';pub.events.hashchange.forEach(fn=>fn());
 assert.equal(pub.location.reloads,1);
 assert.equal(host('#sites',h.stored).app.state.workspace.sites.find(s=>s.id===site.id).version,1);
});

test('standalone missing publication has a recoverable empty state',()=>{
 const h=host('#published/missing');
 assert.equal(h.nodes.get('#site-frame').hidden,true);
 assert.equal(h.nodes.get('#empty-title').textContent,'当前浏览器没有这个站点');
});

test('ordinary HTTP publication URLs remain compatible',()=>{
 assert.equal(siteUrl('sample','http://127.0.0.1:8771/#sites'),'http://127.0.0.1:8771/site.html?id=sample');
});

// Integration checks execute the actual emitted application, then exercise the
// new controllers against its initialized state and persistence implementation.
import {agentThread,focusAgentTask} from '../frontend/src/agent-conversations.js';
import {sendConversation} from '../frontend/src/conversation-ui.js';
import {handleTaskCenter,openTaskConversation} from '../frontend/src/task-center-ui.js';
import {jobRuns} from '../frontend/src/task-center-model.js';
import {initExpertLibrary} from '../frontend/src/expert-library.js';
import {startRun,pause} from '../frontend/src/office-model.js';
import {initPersonal} from '../frontend/src/personal.js';
import {sendConversation as sendPersonalMessage} from '../frontend/src/personal-conversation.js';
import {handleModuleNavigation} from '../frontend/src/module-navigation.js';

test('standalone switches both navigation columns and restores the prior workspace through primary navigation',()=>{
 const h=host(),c=h.app.ctx,s=h.app.state;
 s.homeDraft='跨模块保留的草稿';s.sidebarLayout.projects[0].open=true;c.render();
 function clickModule(module){handleModuleNavigation('module:open',{dataset:{module}},c);h.events.hashchange.forEach(fn=>fn());return h.nodes.get('#app').innerHTML;}
 let html=clickModule('tasks');assert.match(html,/data-navigation-module="tasks"/);assert.match(html,/aria-label="任务中心导航"/);assert.doesNotMatch(html,/aria-label="会话与项目"/);
 h.app.ui.tmTab='automations';c.render();
 html=clickModule('market');assert.match(html,/aria-label="市场导航"/);assert.doesNotMatch(html,/aria-label="任务中心导航"|aria-label="会话与项目"/);
 html=clickModule('workspace');assert.match(html,/aria-label="会话与项目"/);assert.match(html,/跨模块保留的草稿/);assert.equal(s.sidebarLayout.projects[0].open,true);
 html=clickModule('tasks');assert.equal(h.app.ui.tmTab,'automations');assert.match(html,/触发方式/);
});

test('merged standalone renders new routes alongside existing configuration pages',()=>{
 const h=host();
 for(const [route,label] of [['task-center','任务中心'],['agent/bi','持续对话'],['local-agent/codex','连接 Codex'],['expert-config','我创建的'],['skills','技能']]){
  h.app.ui.route=route;h.app.ctx.render();assert.ok(h.nodes.get('#app').innerHTML.includes(label),route);
 }
});

test('homepage office runs get isolated conversations and preserve personal context',()=>{
 const h=host(),c=h.app.ctx,s=h.app.state;s.settings.personalization.instructions='验收先给结论';
 const a=c.startTask('分析经营变化并形成复盘',{context:[{id:'evidence',name:'测试资料',text:'合成证据'}]}),b=c.startTask('研究产品交互并整理结论');
 const first=s.tasks.find(t=>t.id===a),second=s.tasks.find(t=>t.id===b);
 assert.ok(first.office);assert.notEqual(first.office.conversationId,second.office.conversationId);
 assert.equal(first.context[0].text,'合成证据');assert.match(first.customInstructions,/验收先给结论/);
 assert.equal(first.office.scenario,'review');
 focusAgentTask(s,first);assert.ok(!agentThread(s,'personal').messages.some(m=>m.taskId===b));
 c.save();const loaded=host('#chat/'+a,h.stored);assert.equal(loaded.app.state.tasks.find(t=>t.id===a).office.conversationId,first.office.conversationId);
});

test('existing document, plan, goal and scheduled flows retain original executors',()=>{
 const h=host(),c=h.app.ctx;
 for(const [prompt,options] of [['制作 PPT 和 Excel 汇报',{}],['整理资料',{mode:'计划模式'}],['整理资料',{mode:'目标模式'}],['每天整理资料',{origin:'schedule'}]]){
  const id=c.startTask(prompt,options),t=h.app.state.tasks.find(t=>t.id===id);assert.ok(!t.office,prompt+JSON.stringify(options));
 }
 const id=c.startTask('制作 PPT 经营复盘',{agentId:'bi',officeScenario:'review'});assert.ok(h.app.state.tasks.find(t=>t.id===id).office);
});

test('merged application keeps team tasks private and outside personal expert execution',()=>{
 const h=host(),c=h.app.ctx,s=h.app.state,team=s.teamSpace.teams.find(t=>t.id==='product'),resource=team.resources.find(r=>r.type==='plugin');
 c.useTeamAsset(team.id,resource.type,resource.id,'制作团队复盘');h.app.ui.route=h.location.hash.slice(1);
 c.teamComposer().draft='制作团队复盘';c.sendCurrentDraft();h.app.ui.route=h.location.hash.slice(1);
 const t=c.currentTask();assert.ok(t.teamOrigin);assert.ok(!t.office);assert.equal(t.ownerId,s.teamSpace.userId);
 assert.ok(!Object.values(s.office.threads).some(thread=>thread.messages.some(m=>m.taskId===t.id)));
});

test('failed new expert task keeps unsent draft, references and mentions',()=>{
 const h=host('#agent/bi'),c=h.app.ctx,thread=agentThread(h.app.state,'bi');thread.draft='分析酒店经营变化并形成复盘';thread.context=[{id:'draft',name:'待提交资料',text:'保留'}];thread.mentions=['product'];
 const before=JSON.stringify({draft:thread.draft,context:thread.context,mentions:thread.mentions});
 sendConversation({...c,startTask:()=>null},'bi',thread.draft);
 assert.equal(JSON.stringify({draft:thread.draft,context:thread.context,mentions:thread.mentions}),before);
});

test('legacy schedule history and editor remain reachable from the task center',()=>{
 const h=host('#task-center'),c=h.app.ctx,s=h.app.state,legacy={id:'legacy-schedule',name:'旧版继续会话',prompt:'整理示例资料',enabled:true,type:'periodic',frequency:'weekly',weekday:'5',time:'09:00',permission:'approve',model:'原模型',context:'continue',notify:'smart',history:[]};s.workspace.schedules.push(legacy);
 const t=s.tasks.find(t=>t.id==='sample-office');legacy.history=[{taskId:t.id,time:'测试',status:'已完成',context:'continue'}];
 assert.equal(jobRuns(s,legacy.id)[0].id,t.id);openTaskConversation(c,t);assert.equal(h.location.hash,'#chat/'+t.id);
 handleTaskCenter('tc:edit',{dataset:{id:legacy.id}},c);assert.equal(h.app.ui.modal.title,'编辑定时任务');
 assert.match(h.app.ui.modal.body,/继续会话/);
 handleTaskCenter('tc:open-rule',{dataset:{id:legacy.id}},c);assert.match(h.app.ui.modal.title,/运行记录/);assert.match(h.app.ui.modal.body,/sample-office/);
});

test('edited personal experts sync into the new library without becoming enterprise published',()=>{
 const h=host(),s=h.app.state;
 s.catalog.experts.push({id:'custom-integration',custom:true,name:'我的方法',description:'原说明',instructions:'先核对',icon:'expert'});
 initExpertLibrary(s);const a=s.office.agents.find(a=>a.catalogId==='custom-integration');assert.ok(a.saved);assert.equal(a.source,'个人创建');
 s.catalog.experts.at(-1).instructions='先核对再总结';initExpertLibrary(s);assert.equal(a.instructions,'先核对再总结');assert.equal(a.publisher,'我');
 s.catalog.experts=s.catalog.experts.filter(x=>x.id!=='custom-integration');initExpertLibrary(s);assert.equal(a.archived,true);assert.equal(a.saved,false);assert.equal(a.pinned,false);
});

test('personal replacement removes retired drawer and persists the long conversation',()=>{
 const h=host('#personal'),s=h.app.state,c=h.app.ctx;
 s.personal.suggestions=[{id:'old'}];s.personal.follows=[{id:'old'}];initPersonal(s);
 assert.equal(s.personal.suggestions,undefined);assert.equal(s.personal.follows,undefined);
 const count=s.tasks.length;sendPersonalMessage(c,'你好');assert.equal(s.tasks.length,count);
 s.personal.draft='刷新后继续输入';c.save();
 const restored=host('#personal',h.stored);assert.equal(restored.app.state.personal.draft,'刷新后继续输入');
 assert.ok(restored.app.state.personal.messages.some(m=>m.text==='你好'));
 for(const [route,label] of [['personal','我和小悠'],['personal/capabilities','每周工作回顾'],['personal/secretary','工作秘书'],['personal/diary','日记'],['personal/context','上下文'],['personal/settings','设置'],['personal/guide','上手']]){
 restored.app.ui.route=route;restored.app.ctx.render();const html=restored.nodes.get('#app').innerHTML;assert.ok(html.includes(label),route);assert.ok(!html.includes('personal-panel-host'));assert.ok(!html.includes('小悠在这里'));
 }
});
