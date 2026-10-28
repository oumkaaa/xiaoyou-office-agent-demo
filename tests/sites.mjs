// Run with: node --test tests/sites.mjs
// Behavior checks for local site creation and publication; no remote hosting.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createTaskIntakeMessage} from '../frontend/src/task-intake.js';
import {initialState,newTask,esc,icon} from '../frontend/src/core.js';
import {initCatalog} from '../frontend/src/catalog.js';
import {initWorkspace} from '../frontend/src/workspace.js';
import {collectMemorySnapshot} from '../frontend/src/personal.js';
import {validateTeamTask} from '../frontend/src/team-model.js';
import {sendMessage,inputChat} from '../frontend/src/chat.js';
import * as sites from '../frontend/src/site-model.js';
import {getSiteComposer,prepareSiteTask,resetSiteComposer,validateSiteTask,renderSiteTask,SITE_EXAMPLE} from '../frontend/src/site-context.js';
import {renderSites,renderSiteTaskCard,handleSites} from '../frontend/src/sites.js';

const clone=value=>structuredClone(value);
function setup(){const state=initialState();initCatalog(state);initWorkspace(state);sites.initSites(state);return state;}
function context(state,route='sites'){
 const ctx={state,ui:{route},esc,icon,notices:[],navigations:[],starts:[],saved:0,
  save(){this.saved++;return true;},render(){},toast(text){this.notices.push(text);},
  modal(title,body){this.ui.modal={title,body};},closeModal(){this.ui.modal=null;},
  go(route){this.ui.route=route;this.navigations.push(route);},
  currentTask(){return this.ui.route.startsWith('chat/')?this.state.tasks.find(task=>task.id===this.ui.route.split('/')[1]):null;},
  scrollChat(){},download(){},popover(_el,body){this.ui.popover={body};},
 };
 ctx.prepareSiteTask=id=>prepareSiteTask(ctx,id);
 ctx.siteComposer=()=>getSiteComposer(ctx);
 ctx.resetSiteComposer=draft=>resetSiteComposer(state,draft);
 ctx.validateTask=task=>validateSiteTask(state,task);
 const source=readFileSync(new URL('../frontend/src/app.js',import.meta.url),'utf8'),start=source.indexOf('function startTask('),end=source.indexOf('\nfunction continueTask(',start);
 assert.ok(start>=0&&end>start,'the real task boundary must remain discoverable');
 const startRealTask=runInNewContext('('+source.slice(start,end)+')',{state,ui:ctx.ui,newTask,structuredClone,validateTeamTask,validateSiteTask,collectMemorySnapshot,createTaskIntakeMessage,toast:text=>ctx.toast(text),save:()=>ctx.save(),go:route=>ctx.go(route)});
 ctx.startTask=(prompt,options={})=>{const id=startRealTask(prompt,options);if(id)ctx.starts.push({prompt,options:clone(options)});return id;};
 return ctx;
}
function withDocument(run){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,value:{activeElement:null,querySelector:()=>null,querySelectorAll:()=>[]}});
 try{return run();}finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
}
function generated(state,prompt='创建一个咖啡店介绍网站，标题为「山间咖啡」，包含菜单、营业时间和地址。',siteId=''){
 const request=sites.makeSiteRequest(state,siteId);assert.ok(!request.error,request.error);
 const task=newTask(prompt);task.siteRequest=request;task.status='complete';state.tasks.unshift(task);
 const result=sites.completeSiteTask(state,task);assert.ok(result.draft,result.error);return task;
}
function published(state,prompt){const task=generated(state,prompt),result=sites.publishSite(state,task.id);assert.ok(result.site,result.error);return {task,site:result.site};}
function assertError(result){assert.ok(result.error,'this operation must return a user-facing reason');}
function concurrentTabs(initial=setup()){
 let stored=JSON.stringify(initial),failWrites=false;
 const source=readFileSync(new URL('../frontend/src/app.js',import.meta.url),'utf8'),start=source.indexOf('function mergeTaskChanges('),end=source.indexOf('\nfunction toast(',start);
 assert.ok(start>=0&&end>start,'the real save and refresh boundaries must remain discoverable');
 const functions=source.slice(start,end),localStorage={getItem:()=>stored};
 return {
  read:()=>JSON.parse(stored),failWrites(value){failWrites=value;},
  open(){
   const state=JSON.parse(stored),ui={route:'sites'},notices=[];
   const api=runInNewContext(functions+'\n({save,refreshSites})',{
    state,ui,JSON,Array,Map,Set,localStorage,STORAGE_KEY:'test-local-state',
    savedSitesBaseline:JSON.stringify(state.workspace.sites),savedTasksBaseline:new Map(state.tasks.map(task=>[task.id,JSON.stringify(task)])),
    initSites:sites.initSites,reconcileConversation:()=>false,document:{querySelector:()=>null},toast:text=>notices.push(text),
    saveState:next=>{if(failWrites)throw new Error('quota exceeded');stored=JSON.stringify(next);},
   });return {state,ui,notices,...api};
  },
 };
}

test('old site metadata is retained as an unpublished draft and migration is repeatable',()=>{
 const state=initialState();state.workspace={sites:[{id:'legacy-site',name:'历史周报',title:'旧标题',description:'原有说明',updated:'昨天',files:1,visibility:'仅本机演示'}]};
 sites.initSites(state);const site=sites.getSite(state,'legacy-site');
 assert.ok(site);assert.equal(site.name,'历史周报');assert.equal(site.title,'旧标题');assert.equal(site.description,'原有说明');
 assert.notEqual(site.status,'published');assert.ok(!site.html);assert.equal(site.version,0);
 const before=clone(state.workspace.sites);sites.initSites(state);assert.deepEqual(state.workspace.sites,before);
});

test('different requests produce different page bodies instead of the former fixed project demo',()=>{
 const coffee=sites.buildSiteDraft('创建一个咖啡店介绍网站，标题为「山间咖啡」，包含菜单和营业时间。');
 const travel=sites.buildSiteDraft('创建一个京都旅行攻略网站，标题为「京都漫游」，包含路线与美食。');
 assert.ok(coffee.sections?.length);assert.ok(travel.sections?.length);assert.notDeepEqual(coffee.sections,travel.sections);
 assert.match(JSON.stringify(coffee),/咖啡/);assert.match(JSON.stringify(travel),/京都|旅行/);
 assert.doesNotMatch(sites.renderSiteHtml(coffee),/星桥|海帆|青岚/);
 assert.doesNotMatch(sites.renderSiteHtml(travel),/星桥|海帆|青岚/);
 const dangerous={...coffee,title:'<img src=x onerror=alert(1)>',sections:[{heading:'<script>alert(1)</script>',body:'<svg onload=alert(1)>'}]};
 const safe=sites.renderSiteHtml(dangerous);assert.doesNotMatch(safe,/<img src=x|<script>alert\(1\)|<svg onload/);assert.match(safe,/&lt;/);
});

test('the default trial creates the requested sections and keeps example metrics labeled',()=>{
 const draft=sites.buildSiteDraft(SITE_EXAMPLE);
 assert.equal(draft.title,'团队周报');assert.deepEqual(draft.sections.map(section=>section.heading),['本周进展','关键数据','下周计划']);
 assert.match(draft.sections[1].body,/示例/);assert.match(draft.sections[1].body,/6/);
 const embedded=sites.embeddedSiteHtml(draft.html);
 assert.match(embedded,/href="about:srcdoc#section-1"/);assert.doesNotMatch(embedded,/href="#section-/);
 assert.equal(sites.embeddedSiteHtml(embedded),embedded,'embedding is safe to apply more than once');
});

test('generation prepares a task draft, and only an explicit publish creates a published site',()=>{
 const state=setup(),before=clone(state.workspace.sites),task=generated(state);
 assert.deepEqual(state.workspace.sites,before);assert.ok(task.siteDraft);assert.ok(!task.sitePublishedRevision);
 const result=sites.publishSite(state,task.id);assert.ok(result.site,result.error);const site=result.site;
 assert.equal(site.status,'published');assert.equal(site.version,1);assert.equal(sites.getSite(state,site.id),site);
 assert.equal(task.siteRequest.siteId,site.id);assert.equal(task.siteDraft.siteId,site.id);assert.ok(task.sitePublishedRevision);
 const count=state.workspace.sites.length,saved=clone(site);const repeat=sites.publishSite(state,task.id);
 assert.ok(repeat.site,repeat.error);assert.equal(repeat.site.id,site.id);assert.equal(state.workspace.sites.length,count);assert.deepEqual(site,saved);
});

test('an update keeps the published page and stable link until the new revision is explicitly published',()=>{
 const state=setup(),{site}=published(state),before=clone(site.page),count=state.workspace.sites.length,url=sites.siteUrl(site.id,'http://127.0.0.1:8771/#sites');
 const task=generated(state,'把标题改为「山间咖啡 · 秋季菜单」，其他内容保持不变。',site.id);
 assert.deepEqual(site.page,before);assert.equal(site.version,1);assert.equal(task.siteDraft.baseVersion,1);
 assert.match(task.siteDraft.title,/秋季菜单/);
 const result=sites.publishSite(state,task.id);assert.ok(result.site,result.error);assert.equal(result.site.id,site.id);assert.equal(site.version,2);
 assert.equal(state.workspace.sites.length,count);assert.notDeepEqual(site.page,before);assert.equal(sites.siteUrl(site.id,'http://127.0.0.1:8771/#home'),url);
 assert.ok(!url.includes('#sites'));assert.ok(url.includes(encodeURIComponent(site.id)));
});

test('editing a generated draft leaves the published snapshot unchanged and empty content is rejected atomically',()=>{
 const state=setup(),{site}=published(state),task=generated(state,'标题改为「周末咖啡活动」。',site.id),publishedBefore=clone(site.page);
 const values={name:'周末咖啡活动',title:'周末咖啡活动',description:'本周安排',sections:[{heading:'活动时间',body:'周六下午两点开始。'}],accent:'#287be0'};
 const changed=sites.updateSiteDraft(state,task.id,values);assert.ok(changed.draft,changed.error);assert.match(JSON.stringify(changed.draft),/周六下午两点/);assert.deepEqual(site.page,publishedBefore);
 const draftBefore=clone(task.siteDraft);
 for(const invalid of [{...values,title:''},{...values,sections:[]},{...values,sections:[{heading:'空段落',body:'  '}]}])assertError(sites.updateSiteDraft(state,task.id,invalid));
 assert.deepEqual(task.siteDraft,draftBefore);assert.deepEqual(site.page,publishedBefore);
});

test('two independent edits cannot silently overwrite a newer published version',()=>{
 const state=setup(),{site}=published(state),first=generated(state,'标题改为「第一份修改」。',site.id),second=generated(state,'标题改为「第二份修改」。',site.id);
 assert.ok(sites.publishSite(state,first.id).site);const saved=clone(site);
 assertError(sites.publishSite(state,second.id));assert.deepEqual(site,saved);assert.equal(site.version,2);assert.match(second.siteDraft.title,/第二份修改/);
});

test('continuing the original site conversation creates a new draft revision without creating another site',()=>{
 const state=setup(),{site,task}=published(state),count=state.workspace.sites.length,oldPage=clone(site.page),oldRevision=task.siteDraft.revision;
 task.messages.push({role:'user',text:'新增段落「营业时间」：周一至周日 09:00–18:00。',time:Date.now()});
 const result=sites.completeSiteTask(state,task);assert.ok(result.draft,result.error);assert.equal(task.siteDraft.revision,oldRevision+1);assert.deepEqual(site.page,oldPage);
 assert.match(JSON.stringify(task.siteDraft.sections),/09:00/);assert.ok(sites.publishSite(state,task.id).site);
 assert.equal(site.version,2);assert.equal(state.workspace.sites.length,count);assert.equal(task.siteRequest.siteId,site.id);
 const revision=task.siteDraft.revision;sites.completeSiteTask(state,task);assert.equal(task.siteDraft.revision,revision,'re-rendering completion must not generate another revision');
});

test('unrecognized edit requests preserve the original content and require an explicit content correction before publication',()=>{
 const state=setup(),{site}=published(state),before=clone(site.page),task=generated(state,'让它更有感觉一点。',site.id);
 assert.equal(task.siteDraft.unapplied,true);assert.deepEqual(task.siteDraft.sections,before.sections);assert.match(task.siteDraft.note,/尚未|未.*应用/);
 assertError(sites.publishSite(state,task.id));assert.deepEqual(site.page,before);
 const changed=sites.updateSiteDraft(state,task.id,{...before,title:'山间咖啡 · 欢迎光临'});assert.ok(changed.draft,changed.error);assert.equal(task.siteDraft.unapplied,false);assert.ok(sites.publishSite(state,task.id).site);
});

test('publication refuses unfinished tasks and missing or empty drafts without changing the site list',()=>{
 const state=setup(),task=generated(state),before=clone(state.workspace.sites);
 for(const status of ['running','paused']){task.status=status;assertError(sites.publishSite(state,task.id));assert.deepEqual(state.workspace.sites,before);}
 task.status='complete';const draft=clone(task.siteDraft);task.siteDraft.sections=[];assertError(sites.publishSite(state,task.id));assert.deepEqual(state.workspace.sites,before);
 task.siteDraft=draft;assertError(sites.publishSite(state,'missing-task'));
});

test('deleting a site makes the old target unavailable while restore keeps its identity and content',()=>{
 const state=setup(),{site}=published(state),task=generated(state,'标题改为「稍后发布」。',site.id),before=clone(site.page),id=site.id;
 assert.ok(sites.softDeleteSite(state,id).site);assert.ok(!sites.getSite(state,id));assertError(sites.makeSiteRequest(state,id));assertError(sites.publishSite(state,task.id));
 assert.ok(state.tasks.includes(task));assert.ok(sites.restoreSite(state,id).site);assert.equal(sites.getSite(state,id).id,id);assert.deepEqual(sites.getSite(state,id).page,before);
 assert.ok(sites.publishSite(state,task.id).site);
});

test('create and edit actions only prepare the correct composer, and reopening preserves the user draft',()=>withDocument(()=>{
 const state=setup(),ctx=context(state),{site}=published(state),count=state.tasks.length;
 assert.equal(handleSites('site:create',{dataset:{}},ctx),true);assert.equal(ctx.ui.route,'site-task/new');assert.equal(state.tasks.length,count);assert.equal(ctx.starts.length,0);
 const creating=getSiteComposer(ctx);assert.ok(creating?.isSiteDraft);assert.match(creating.draft,/网站|网页/);
 inputChat({dataset:{live:'chat:draft'},value:'我的独立建站需求，请保留。'},ctx);
 ctx.go('sites');handleSites('site:create',{dataset:{}},ctx);assert.equal(getSiteComposer(ctx).draft,'我的独立建站需求，请保留。');
 handleSites('site:edit',{dataset:{id:site.id}},ctx);const editing=getSiteComposer(ctx);
 assert.equal(ctx.ui.route,'site-task/'+site.id);assert.equal(editing.siteRequest.siteId,site.id);assert.equal(ctx.starts.length,0);assert.match(editing.draft,new RegExp(site.id));
 inputChat({dataset:{live:'chat:draft'},value:'只修改营业时间，保留其他内容。'},ctx);
 ctx.go('sites');handleSites('site:edit',{dataset:{id:site.id}},ctx);assert.equal(getSiteComposer(ctx).draft,'只修改营业时间，保留其他内容。');
 assert.equal(state.siteComposers.new.draft,'我的独立建站需求，请保留。');assert.match(renderSiteTask(ctx),/只修改营业时间/);
}));

test('sending a site composer binds the target exactly once and clears only that submitted composer',()=>withDocument(()=>{
 const state=setup(),ctx=context(state),{site}=published(state);prepareSiteTask(ctx);prepareSiteTask(ctx,site.id);ctx.go('site-task/'+site.id);
 const draft=getSiteComposer(ctx);draft.draft='标题改为「新的标题」。';const other=clone(state.siteComposers.new);
 sendMessage(ctx);assert.equal(ctx.starts.length,1);assert.equal(ctx.starts[0].prompt,'标题改为「新的标题」。');assert.equal(ctx.starts[0].options.siteRequest.siteId,site.id);
 assert.ok(!state.siteComposers[site.id]);assert.deepEqual(state.siteComposers.new,other);assert.equal(ctx.currentTask().siteRequest.siteId,site.id);
 sendMessage(ctx);assert.equal(ctx.starts.length,1,'the pending task must not submit twice');
}));

test('a removed site blocks a saved edit composer without deleting the typed requirement',()=>withDocument(()=>{
 const state=setup(),ctx=context(state),{site}=published(state);prepareSiteTask(ctx,site.id);ctx.go('site-task/'+site.id);
 const draft=getSiteComposer(ctx);draft.draft='我还没有发送的修改说明';sites.softDeleteSite(state,site.id);
 assert.ok(validateSiteTask(state,draft));sendMessage(ctx);assert.equal(ctx.starts.length,0);assert.equal(draft.draft,'我还没有发送的修改说明');
 assert.match(renderSiteTask(ctx),/已删除|暂不可编辑/);
}));

test('reopening an old edit composer keeps personal input but rebases its resource snapshot to the latest published page',()=>{
 const state=setup(),ctx=context(state),{site}=published(state);const draft=prepareSiteTask(ctx,site.id);
 draft.draft='请保留这段尚未发送的要求';draft.context=[{id:'personal-notes',type:'file',name:'我的补充.txt',text:'私人资料'}];
 const other=generated(state,'标题改为「刚刚发布的新标题」。',site.id);assert.ok(sites.publishSite(state,other.id).site);assert.equal(site.version,2);
 const reopened=prepareSiteTask(ctx,site.id);assert.equal(reopened,draft);assert.equal(reopened.draft,'请保留这段尚未发送的要求');assert.equal(reopened.context[0].text,'私人资料');
 assert.equal(reopened.siteRequest.baseVersion,2);assert.equal(reopened.siteRequest.basePage.title,'刚刚发布的新标题');
});

test('publication confirmation is tied to the reviewed content and failed storage rolls back the publish',()=>{
 const state=setup(),ctx=context(state),task=generated(state),before=clone(state.workspace.sites);
 handleSites('site:publish',{dataset:{task:task.id}},ctx);assert.match(ctx.ui.modal.title,/确认发布/);
 assert.ok(sites.updateSiteDraft(state,task.id,{...task.siteDraft,title:'检查后又修改过的标题'}).draft);
 handleSites('site:confirm-publish',{dataset:{task:task.id}},ctx);assert.deepEqual(state.workspace.sites,before);assert.ok(ctx.notices.some(text=>/新修改|重新/.test(text)));
 const savedTask=clone(task);ctx.save=()=>false;
 handleSites('site:confirm-publish',{dataset:{task:task.id}},ctx);assert.deepEqual(state.workspace.sites,before);assert.deepEqual(task,savedTask);assert.ok(ctx.notices.some(text=>/保存失败/.test(text)));
 ctx.save=()=>true;handleSites('site:confirm-publish',{dataset:{task:task.id}},ctx);assert.equal(state.workspace.sites.length,before.length+1);assert.match(ctx.ui.modal.title,/已发布/);
});

test('a failed task save preserves the unsent site requirement and does not add a conversation',()=>withDocument(()=>{
 const state=setup(),ctx=context(state,'site-task/new'),draft=prepareSiteTask(ctx),count=state.tasks.length;draft.draft='尚未成功发送的建站需求';ctx.save=()=>false;
 sendMessage(ctx);assert.equal(ctx.starts.length,0);assert.equal(state.tasks.length,count);assert.equal(getSiteComposer(ctx).draft,'尚未成功发送的建站需求');
}));

test('site list search has a recoverable empty state and pending drafts are not presented as published pages',()=>{
 const state=setup(),ctx=context(state),{site,task}=published(state);ctx.ui.siteQuery='绝对不存在的站点关键词';
 const empty=renderSites(ctx);assert.match(empty,/没有|未找到/);assert.match(empty,/site:clear-search/);assert.ok(!empty.includes('data-id="'+site.id+'"'));
 handleSites('site:clear-search',{dataset:{}},ctx);assert.equal(ctx.ui.siteQuery,'');assert.match(renderSites(ctx),new RegExp(site.id));
 const next=generated(state,'标题改为「尚未发布的修改」。',site.id);const card=renderSiteTaskCard(ctx,next);assert.match(card,/发布|更新/);assert.match(renderSiteTaskCard(ctx,task),/已发布|打开/);
});

test('copy-link failure exposes a selectable local URL instead of reporting a false success',async()=>{
 const state=setup(),ctx=context(state),{site}=published(state),previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async()=>{throw new Error('clipboard denied');}}}});
 try{await handleSites('site:copy',{dataset:{id:site.id}},ctx);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(ctx.ui.modal?.title,'复制站点链接');assert.match(ctx.ui.modal.body,/readonly/);assert.match(ctx.ui.modal.body,/site-copy-link/);assert.match(ctx.ui.modal.body,new RegExp(site.id));assert.ok(!ctx.notices.some(text=>/已复制/.test(text)));}
 finally{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;}
});

test('an older page saving unrelated input retains another page new site conversation and publication',()=>{
 const store=concurrentTabs(),older=store.open(),newer=store.open(),{task,site}=published(newer.state);
 assert.equal(newer.save(),true);older.state.homeDraft='旧页面刚输入的独立要求';assert.equal(older.save(),true);
 const saved=store.read();assert.ok(saved.workspace.sites.some(item=>item.id===site.id));assert.ok(saved.tasks.some(item=>item.id===task.id));assert.equal(saved.homeDraft,'旧页面刚输入的独立要求');
 assert.ok(older.state.tasks.some(item=>item.id===task.id));
});

test('save and refresh adopt remote task updates only when the local task is unchanged',()=>{
 const store=concurrentTabs(),first=store.open(),second=store.open(),[remoteId,localId]=first.state.tasks.map(task=>task.id);
 first.state.tasks.find(task=>task.id===remoteId).title='另一页刚改好的标题';assert.equal(first.save(),true);
 second.state.tasks.find(task=>task.id===localId).draft='当前页自己的输入';assert.equal(second.refreshSites(),true);
 assert.equal(second.state.tasks.find(task=>task.id===remoteId).title,'另一页刚改好的标题');assert.equal(second.state.tasks.find(task=>task.id===localId).draft,'当前页自己的输入');
 assert.equal(second.save(),true);assert.equal(store.read().tasks.find(task=>task.id===localId).draft,'当前页自己的输入');
 const third=store.open();first.refreshSites();first.state.tasks.find(task=>task.id===remoteId).title='再次更新';first.save();assert.equal(third.save(),true);assert.equal(store.read().tasks.find(task=>task.id===remoteId).title,'再次更新');
});

test('two pages modifying the same site task cannot overwrite each other or discard the local draft',()=>{
 const initial=setup(),{task}=published(initial),store=concurrentTabs(initial),first=store.open(),second=store.open();
 first.state.tasks.find(item=>item.id===task.id).draft='另一页的站点修改';assert.equal(first.save(),true);
 const local=second.state.tasks.find(item=>item.id===task.id);local.draft='当前页未发送的修改';const before=store.read();
 assert.equal(second.save(),false);assert.match(second.ui.saveError,/其他页面修改/);assert.equal(local.draft,'当前页未发送的修改');assert.deepEqual(store.read(),before);
 assert.equal(second.refreshSites(),false);assert.equal(local.draft,'当前页未发送的修改');assert.deepEqual(store.read(),before);
});

test('publication stops when refresh replaces the reviewed task with an unreviewed remote draft',()=>{
 const initial=setup(),task=generated(initial),store=concurrentTabs(initial),reviewing=store.open(),editing=store.open(),ctx=context(reviewing.state);
 ctx.ui=reviewing.ui;ctx.save=reviewing.save;ctx.refreshSites=reviewing.refreshSites;
 handleSites('site:publish',{dataset:{task:task.id}},ctx);const reviewedHtml=ctx.ui.sitePublishReview.html;
 const remoteTask=editing.state.tasks.find(item=>item.id===task.id);
 assert.ok(sites.updateSiteDraft(editing.state,task.id,{...remoteTask.siteDraft,title:'其他页面刚修改的未审阅标题'}).draft);assert.equal(editing.save(),true);
 const before=store.read();handleSites('site:confirm-publish',{dataset:{task:task.id}},ctx);
 assert.deepEqual(store.read(),before);assert.equal(ctx.ui.sitePublishReview.html,reviewedHtml);assert.ok(ctx.notices.some(text=>/其他页面更新/.test(text)));
 assert.equal(ctx.state.tasks.find(item=>item.id===task.id).siteDraft.title,'其他页面刚修改的未审阅标题');assert.ok(!ctx.state.tasks.find(item=>item.id===task.id).sitePublishedRevision);
 handleSites('site:publish',{dataset:{task:task.id}},ctx);handleSites('site:confirm-publish',{dataset:{task:task.id}},ctx);
 assert.ok(store.read().workspace.sites.some(site=>site.title==='其他页面刚修改的未审阅标题'&&site.status==='published'));
});

test('a remote deletion is respected while an unsent local change is preserved with an explicit conflict',()=>{
 const initial=setup(),{task}=published(initial),store=concurrentTabs(initial),deleting=store.open(),dirty=store.open(),clean=store.open();
 const local=dirty.state.tasks.find(item=>item.id===task.id);local.draft='删除前还没有发送的要求';
 deleting.state.tasks=deleting.state.tasks.filter(item=>item.id!==task.id);assert.equal(deleting.save(),true);
 assert.equal(clean.save(),true);assert.ok(!store.read().tasks.some(item=>item.id===task.id),'a clean old tab must not resurrect the deleted task');
 assert.equal(dirty.save(),false);assert.match(dirty.ui.saveError,/其他页面删除/);assert.equal(local.draft,'删除前还没有发送的要求');assert.ok(!store.read().tasks.some(item=>item.id===task.id));
});

test('local conversation deletion cannot discard a concurrent remote edit',()=>{
 const store=concurrentTabs(),deleting=store.open(),editing=store.open(),id=deleting.state.tasks[0].id;
 deleting.state.tasks=deleting.state.tasks.filter(task=>task.id!==id);editing.state.tasks.find(task=>task.id===id).draft='需要保留的远端输入';assert.equal(editing.save(),true);
 assert.equal(deleting.save(),false);assert.match(deleting.ui.saveError,/本次删除未保存/);assert.equal(store.read().tasks.find(task=>task.id===id).draft,'需要保留的远端输入');
});

test('failed storage leaves the original in-memory task collection intact and a retry safely merges remote additions',()=>{
 const store=concurrentTabs(),older=store.open(),newer=store.open(),{task}=published(newer.state);assert.equal(newer.save(),true);
 const tasks=older.state.tasks;older.state.homeDraft='等待重试的本地输入';store.failWrites(true);
 assert.equal(older.save(),false);assert.equal(older.state.tasks,tasks);assert.equal(older.state.homeDraft,'等待重试的本地输入');assert.match(older.ui.saveError,/存储空间/);
 store.failWrites(false);assert.equal(older.save(),true);assert.equal(older.ui.saveError,'');assert.ok(store.read().tasks.some(item=>item.id===task.id));
});

test('user-facing source copy consistently names the product 小悠',()=>{
 const sourceRoot=new URL('../frontend/src/',import.meta.url),files=readdirSync(sourceRoot).filter(name=>name.endsWith('.js'));
 for(const file of files)assert.doesNotMatch(readFileSync(new URL(file,sourceRoot),'utf8'),/小帮/,file+' must use the requested product name');
 assert.doesNotMatch(readFileSync(new URL('../frontend/index.html',import.meta.url),'utf8'),/小帮/);
});
