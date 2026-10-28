// Run with: node --test tests/team-space.mjs
// Behavior checks for the local team-space prototype; no network or backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {initialState, newTask, esc, icon, uid} from '../frontend/src/core.js';
import {initCatalog, renderCatalog, handleCatalog} from '../frontend/src/catalog.js';
import {isPluginConnected} from '../frontend/src/account-state.js';
import {initWorkspace,renderWorkspace,handleWorkspace,submitWorkspace} from '../frontend/src/workspace.js';
import {collectMemorySnapshot} from '../frontend/src/personal.js';
import {createTaskIntakeMessage} from '../frontend/src/task-intake.js';
import {registerSkillOffer} from '../frontend/src/skill-discovery-model.js';
import {draftProject,assignDraftProject} from '../frontend/src/sidebar-layout.js';
import {initTaskFiles, applyAnnotations, handleViewer} from '../frontend/src/viewer.js';
import {handleChat, inputChat, tickTasks, renderHome, renderChat, sendMessage} from '../frontend/src/chat.js';
import * as model from '../frontend/src/team-model.js';
import {normalizeTeamRoute, getTeamComposer, openTeamTask, resetTeamDraft, renderTeamTask, requestTeamAuthorization, handleTeamContext} from '../frontend/src/team-context.js';
import {renderTeamSpace, renderTeamHome, handleTeamSpace, submitTeamSpace, inputTeamSpace} from '../frontend/src/team-space.js';

const clone = value => structuredClone(value);
function setup() {
  const state = initialState();
  initCatalog(state);
  initWorkspace(state);
  model.initTeamSpace(state);
  return state;
}
function appContext(state,route='teams') {
  const ctx={state,ui:{route},esc,icon,notices:[],navigations:[],saved:0,
    save(){this.saved++;},render(){},toast(text){this.notices.push(text);},
    modal(title,body){this.ui.modal={title,body};},closeModal(){this.ui.modal=null;delete this.ui.teamPendingSend;},
    go(route){this.ui.route=route;this.navigations.push(route);},
    currentTask(){return this.ui.route.startsWith('chat/')?this.state.tasks.find(t=>t.id===this.ui.route.split('/')[1]):null;},
    popover(_el,body){this.ui.popover={body};},download(){},scrollChat(){},
  };
  ctx.teamComposer=()=>getTeamComposer(ctx);
  ctx.useTeamAsset=(bid,type,id,prompt)=>openTeamTask(ctx,bid,type,id,prompt);
  ctx.resetTeamDraft=draft=>resetTeamDraft(state,draft);
  ctx.validateTask=task=>model.validateTeamTask(state,task);
  ctx.requestTeamAuthorization=(task,resume)=>requestTeamAuthorization(ctx,task,resume);
  ctx.sendCurrentDraft=()=>sendMessage(ctx);
  ctx.renderTeamHome=()=>renderTeamHome(ctx);
  return ctx;
}
function withDocument(run) {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{activeElement:null,querySelector:()=>null,querySelectorAll:()=>[]}});
  try{return run();}finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
}
function submitForm(name,values,ctx,dataset={},handler=submitTeamSpace) {
  const Original=globalThis.FormData, data=new Original();
  for(const [key,value] of Object.entries(values))for(const v of Array.isArray(value)?value:[value])data.append(key,v);
  globalThis.FormData=class{constructor(){return data;}};
  const form={dataset,elements:{namedItem:key=>key in values?{value:values[key],focus(){}}:null}};
  try{return handler(name,form,ctx);}finally{globalThis.FormData=Original;}
}
function wireRealTaskCreation(ctx) {
  // Execute app.js's real task boundary with its actual state dependencies.
  const source=readFileSync(new URL('../frontend/src/app.js',import.meta.url),'utf8');
  const start=source.indexOf('function startTask('),end=source.indexOf('\nfunction continueTask(',start);
  assert.ok(start>=0&&end>start,'task-creation boundary must remain discoverable');
  ctx.startTask=runInNewContext('('+source.slice(start,end)+')',{
    ...model,state:ctx.state,ui:ctx.ui,newTask,uid,structuredClone,
    collectMemorySnapshot,draftProject,assignDraftProject,registerSkillOffer,createTaskIntakeMessage,toast:text=>ctx.toast(text),save:()=>ctx.save(),go:route=>ctx.go(route),
  });
  return ctx;
}
function resource(state,type='plugin',sourceId='office',teamId='product') {
  const found=model.teamResources(state,teamId).find(r=>r.type===type&&r.sourceId===sourceId);
  if(found)return found;
  const result=model.addTeamResource(state,teamId,{type,sourceId});
  assert.ok(result.resource,result.error);return result.resource;
}
function freshTeam(state,name='测试团队空间') {
  const result=model.createTeam(state,{name,description:'只用于本地验证'});
  assert.ok(result.team,result.error);return result.team;
}
function addCustomExpert(state) {
  const expert={id:'custom-expert',name:'流程核对助理',description:'按团队规则核对流程',custom:true,enabled:true,
    instructions:'只按材料中的证据给出判断',plugins:['lark'],skills:['weekly'],example:'核对这份周报的依据'};
  state.catalog.experts.push(expert);return expert;
}
function expertResource(state,teamId='product') {
  const expert=addCustomExpert(state),plugin=resource(state,'plugin','lark',teamId),item=resource(state,'expert',expert.id,teamId);
  const configured=model.updateTeamResource(state,teamId,item.id,{pluginResourceIds:[plugin.id],knowledgeResourceIds:[]});
  assert.ok(configured.resource,configured.error);return {expert,item,plugin};
}
function optionsFor(state,item,teamId='product',allowUnconnected=false) {
  return model.teamTaskOptions(state,teamId,item.type,item.id,{allowUnconnected}).options;
}
function addKnowledge(state,teamId='product',overrides={}) {
  const result=model.addTeamResource(state,teamId,{type:'knowledge',name:'团队流程手册',description:'审核时参考',content:'项目汇报需写明数据来源和负责人。',...overrides});
  assert.ok(result.resource,result.error);return result.resource;
}

// Space, resources and roles are the actual product contract. There is no draft
// suite, publication or approval layer in the current member experience.
test('creating a team makes the current user its creator and starts with an empty independent resource collection', () => {
  const state=setup(),before=clone(state.tasks),team=freshTeam(state,'  新项目组  ');
  assert.equal(team.name,'新项目组');assert.equal(model.teamRole(state,team.id),'owner');
  assert.equal(model.canManageTeam(state,team.id),true);assert.equal(model.canManageMembers(state,team.id),true);
  assert.ok(model.visibleTeams(state).some(t=>t.id===team.id));assert.deepEqual(model.teamResources(state,team.id),[]);
  assert.equal(team.members.length,1);assert.equal(team.members[0].id,'me');assert.deepEqual(state.tasks,before);
  const count=state.teamSpace.teams.length;
  for(const values of [{name:''},{name:'   '},{name:'字'.repeat(51)},{name:'正常名称',description:'字'.repeat(301)}])assert.ok(model.createTeam(state,values).error);
  assert.equal(state.teamSpace.teams.length,count);
});

test('only creators and administrators may mutate resources or memberships, including direct model calls', () => {
  const state=setup(),item=resource(state),team=model.getTeam(state,'product');
  const invitation=model.inviteTeamMember(state,'product',{name:'待加入同事',email:'join@example.com',role:'member'}).invitation;
  assert.ok(invitation);state.teamSpace.userId='member-b';
  assert.equal(model.teamRole(state,'product'),'member');assert.equal(model.canManageTeam(state,'product'),false);
  const before=clone(state.teamSpace);
  const attempted=[
    model.addTeamResource(state,'product',{type:'plugin',sourceId:'image'}),
    model.addTeamResource(state,'product',{type:'knowledge',name:'越权知识库',content:'不保存'}),
    model.updateTeamResource(state,'product',item.id,{name:'越权更新'}),
    model.removeTeamResource(state,'product',item.id),
    model.inviteTeamMember(state,'product',{name:'越权邀请',email:'other@example.com',role:'member'}),
    model.updateMemberRole(state,'product','member-a','admin'),
    model.removeTeamMember(state,'product','member-a'),
    model.cancelTeamInvitation(state,'product',invitation.id)
  ];
  for(const result of attempted)assert.ok(result.error,'mutations must reject an ordinary member even without a UI');
  assert.deepEqual(state.teamSpace,before);
  state.teamSpace.userId='me';assert.ok(model.updateMemberRole(state,'product','member-a','admin').member);
  state.teamSpace.userId='member-a';assert.equal(model.teamRole(state,'product'),'admin');assert.equal(model.canManageTeam(state,'product'),true);
  const added=model.addTeamResource(state,'product',{type:'plugin',sourceId:'image'});assert.ok(added.resource,added.error);
  assert.ok(model.updateTeamResource(state,'product',added.resource.id,{name:'配图工具'}).resource);
  assert.ok(model.removeTeamResource(state,'product',added.resource.id).ok);
  assert.ok(model.inviteTeamMember(state,'product',{name:'新同事',email:'admin-invite@example.com',role:'member'}).invitation);
  assert.equal(team.ownerId,'me');
});

test('creator identity is protected and administrators cannot change themselves or remove the creator', () => {
  const state=setup();assert.ok(model.updateMemberRole(state,'product','member-a','admin').member);
  for(const user of ['me','member-a']) {
    state.teamSpace.userId=user;
    assert.ok(model.updateMemberRole(state,'product','me','member').error);
    assert.ok(model.removeTeamMember(state,'product','me').error);
  }
  assert.ok(model.updateMemberRole(state,'product','member-a','member').error);
  assert.ok(model.removeTeamMember(state,'product','member-a').error);
  assert.ok(model.updateMemberRole(state,'product','member-b','owner').error);
  state.teamSpace.userId='me';assert.ok(model.updateMemberRole(state,'product','member-a','member').member);
  assert.equal(model.getTeam(state,'product').ownerId,'me');
});

test('invitations validate identity and roles, deduplicate pending recipients and may be revoked without creating a member', () => {
  const state=setup(),team=model.getTeam(state,'product'),members=clone(team.members);
  for(const values of [{name:'',email:'x@example.com',role:'member'},{name:'人',email:'invalid',role:'member'},{name:'人',email:'x@example.com',role:'owner'}])assert.ok(model.inviteTeamMember(state,'product',values).error);
  const result=model.inviteTeamMember(state,'product',{name:'  王同学  ',email:'  NEW@example.com  ',role:'admin'});
  assert.ok(result.invitation,result.error);assert.equal(result.invitation.email,'new@example.com');assert.equal(result.invitation.name,'王同学');
  assert.ok(model.inviteTeamMember(state,'product',{name:'重复邀请',email:'new@example.com',role:'member'}).error);
  assert.deepEqual(team.members,members,'a local pending invitation is not an accepted membership');
  assert.ok(model.cancelTeamInvitation(state,'product',result.invitation.id).ok);
  assert.ok(model.inviteTeamMember(state,'product',{name:'王同学',email:'new@example.com',role:'member'}).invitation);
  const withEmail=team.members.find(m=>m.email);
  if(withEmail)assert.ok(model.inviteTeamMember(state,'product',{name:withEmail.name,email:withEmail.email,role:'member'}).error);
});

test('resources and member mutations cannot cross spaces and a removed member loses use access', () => {
  const state=setup(),team=freshTeam(state),item=resource(state),other=resource(state,'plugin','office',team.id);
  assert.notEqual(item.id,other.id);assert.ok(model.updateTeamResource(state,team.id,item.id,{name:'错空间'}).error);
  assert.ok(model.removeTeamResource(state,team.id,item.id).error);
  assert.ok(model.teamTaskOptions(state,team.id,'plugin',item.id).error);
  assert.ok(model.updateMemberRole(state,team.id,'member-a','admin').error);
  assert.ok(model.removeTeamMember(state,team.id,'member-a').error);
  state.teamSpace.userId='member-b';assert.deepEqual(model.teamResources(state,team.id),[]);
  assert.ok(!model.visibleTeams(state).some(t=>t.id===team.id));assert.ok(optionsFor(state,item));
  state.teamSpace.userId='me';assert.ok(model.removeTeamMember(state,'product','member-b').ok);
  state.teamSpace.userId='member-b';assert.deepEqual(model.teamResources(state,'product'),[]);assert.ok(!optionsFor(state,item));
});

test('resources are deduplicated within a space, editable locally and independent of their catalog source', () => {
  const state=setup(),team=freshTeam(state),item=resource(state,'plugin','office',team.id),source=state.catalog.plugins.find(p=>p.id==='office'),original=clone(source);
  assert.ok(model.addTeamResource(state,team.id,{type:'plugin',sourceId:'office'}).error);
  assert.equal(model.teamResources(state,team.id).length,1);
  const beforeVersion=item.version;
  assert.ok(model.updateTeamResource(state,team.id,item.id,{name:'团队办公工具',description:'用于周报整理'}).resource);
  assert.equal(item.name,'团队办公工具');assert.equal(item.description,'用于周报整理');assert.equal(item.version,beforeVersion+1);assert.deepEqual(source,original);
  const second=freshTeam(state,'另一个团队');assert.ok(resource(state,'plugin','office',second.id));
  assert.ok(model.addTeamResource(state,team.id,{type:'skill',sourceId:'weekly'}).error);
  assert.ok(model.addTeamResource(state,team.id,{type:'plugin',sourceId:'missing'}).error);
});

test('expert resource snapshots freeze working instructions and dependencies without copying personal connection credentials', () => {
  const state=setup(),{expert,item}=expertResource(state),plugin=state.catalog.plugins.find(p=>p.id==='lark'),skill=state.catalog.skills.find(s=>s.id==='weekly');
  plugin.auth='demo-authorized';expert.auth='demo-authorized';const saved=clone(item.snapshot);
  assert.equal(saved.instructions,expert.instructions);assert.equal(saved.skills[0].id,'weekly');
  const resolved=model.resolveTeamExpert(state,'product',item.id).asset;
  assert.equal(resolved.plugins[0].id,'lark');assert.equal(resolved.auth,undefined);assert.equal(resolved.plugins[0].auth,undefined);
  assert.deepEqual(item.pluginResourceIds,[resource(state,'plugin','lark').id]);
  expert.instructions='后来修改的源助理';skill.content='后来修改的源技能';plugin.description='后来修改的源插件';
  assert.deepEqual(item.snapshot,saved);assert.equal(model.teamAssetStatus(state,'product','expert',item.id).available,false);
  assert.ok(model.updateTeamResource(state,'product',item.id,{name:item.name,description:item.description,instructions:'这个空间自己的规则'}).resource);
  assert.equal(item.snapshot.instructions,'这个空间自己的规则');assert.equal(expert.instructions,'后来修改的源助理');
});

test('knowledge can be created and edited in a space, and use freezes a personal reference without changing the original', () => {
  const state=setup(),item=addKnowledge(state),tasks=clone(state.tasks),options=optionsFor(state,item),saved=clone(options);
  assert.ok(options);assert.equal(options.expert,'');assert.equal(options.teamOrigin.resourceId,item.id);
  assert.match(options.context[0].text,/数据来源和负责人/);assert.deepEqual(state.tasks,tasks);
  assert.ok(model.updateTeamResource(state,'product',item.id,{name:'新版流程手册',description:'新的说明',content:'新版要求注明验收条件。'}).resource);
  assert.deepEqual(options,saved);assert.match(optionsFor(state,item).context[0].text,/验收条件/);
  assert.match(saved.context[0].text,/数据来源和负责人/);assert.equal(model.validateTeamTask(state,saved),'');
  assert.ok(model.removeTeamResource(state,'product',item.id).ok);assert.ok(model.validateTeamTask(state,saved));assert.deepEqual(options,saved);
});

test('personal plugin consent is isolated from the source publisher and other members', () => {
  const state=setup(),{item}=expertResource(state),plugin=state.catalog.plugins.find(p=>p.id==='lark');plugin.auth='demo-authorized';
  assert.ok(!optionsFor(state,item));const options=optionsFor(state,item,'product',true);assert.ok(options);
  assert.ok(model.authorizeTeamTask(state,options).ok);assert.ok(optionsFor(state,item));
  state.teamSpace.userId='member-a';assert.ok(!optionsFor(state,item));assert.equal(state.teamSpace.authorizations['member-a'],undefined);
  assert.ok(model.authorizeTeamTask(state,options).ok);assert.ok(optionsFor(state,item));
  delete state.teamSpace.authorizations.me.lark;assert.ok(optionsFor(state,item));state.teamSpace.userId='me';assert.ok(!optionsFor(state,item));
});

test('unconnected resources may prepare input but cannot execute or bypass membership, availability or removal', () => {
  const state=setup(),{item}=expertResource(state),options=optionsFor(state,item,'product',true);assert.ok(options);
  assert.equal(model.teamTaskAccess(state,options).available,false);assert.deepEqual(model.teamTaskAccess(state,options).missingPlugins.map(p=>p.id),['lark']);assert.ok(model.validateTeamTask(state,options));
  state.catalog.plugins.find(p=>p.id==='lark').enabled=false;assert.ok(optionsFor(state,item,'product',true),'the saved space copy is independent of the personal source');
  model.updateTeamResource(state,'product',item.id,{enabled:false});assert.ok(!optionsFor(state,item,'product',true));assert.ok(model.authorizeTeamTask(state,options).error);
  model.updateTeamResource(state,'product',item.id,{enabled:true});state.teamSpace.userId='outsider';assert.ok(!optionsFor(state,item,'product',true));assert.ok(model.authorizeTeamTask(state,options).error);
  state.teamSpace.userId='me';model.removeTeamResource(state,'product',item.id);assert.ok(!optionsFor(state,item,'product',true));assert.ok(model.authorizeTeamTask(state,options).error);
  assert.equal(state.teamSpace.authorizations.me,undefined);
});

test('frozen task consent grants only its original dependencies and rejects a forged resource identity', () => {
  const state=setup(),{expert,item}=expertResource(state),old=optionsFor(state,item,'product',true),snapshot=clone(old);
  expert.plugins.push('idata');const data=resource(state,'plugin','idata');
  assert.ok(model.updateTeamResource(state,'product',item.id,{refreshFromSource:true,instructions:'新版空间规则',pluginResourceIds:[...item.pluginResourceIds,data.id]}).resource);
  const latest=optionsFor(state,item,'product',true);
  assert.deepEqual(model.teamTaskAccess(state,old).missingPlugins.map(p=>p.id),['lark']);
  assert.deepEqual(model.teamTaskAccess(state,latest).missingPlugins.map(p=>p.id),['lark','idata']);
  assert.ok(model.authorizeTeamTask(state,old).ok);assert.deepEqual(state.teamSpace.authorizations.me,{lark:'demo-authorized'});assert.deepEqual(old,snapshot);
  const forged={...clone(old),teamOrigin:{...old.teamOrigin,teamId:'data'}};
  assert.ok(model.authorizeTeamTask(state,forged).error);assert.deepEqual(state.teamSpace.authorizations.me,{lark:'demo-authorized'});
});

test('removing a resource prevents new and resumed execution while preserving historical files and snapshots', () => {
  const state=setup(),item=resource(state),options=optionsFor(state,item),task={...newTask('整理周报'),...clone(options)};
  initTaskFiles(task,'dashboard');state.tasks.push(task);const saved=clone(task);
  assert.ok(model.removeTeamResource(state,'product',item.id).ok);assert.ok(!optionsFor(state,item));assert.ok(model.validateTeamTask(state,task));assert.deepEqual(task,saved);
  assert.equal(state.tasks.at(-1),task);assert.ok(task.files.length);
});

// Use is always a private task. Preparing a draft, connecting an account and
// sending are deliberately separate user actions.
test('using a team resource prepares a private draft and leaves home input and other members drafts untouched', () => {
  const state=setup(),item=resource(state),ctx=appContext(state),tasks=clone(state.tasks);
  state.homeDraft='个人首页未发送的内容';state.homeContext=[{type:'file',id:'home-doc',name:'首页资料',text:'个人正文'}];
  const home=clone({draft:state.homeDraft,context:state.homeContext,composer:state.composer});
  assert.equal(openTeamTask(ctx,'product',item.type,item.id),true);const draft=getTeamComposer(ctx);
  assert.equal(draft.isTeamDraft,true);assert.equal(draft.teamOrigin.resourceId,item.id);assert.deepEqual(state.tasks,tasks);
  draft.draft='空间入口的个人草稿';draft.context.push({type:'file',id:'private-file',name:'个人附件',text:'个人输入'});
  openTeamTask(ctx,'product',item.type,item.id);assert.equal(getTeamComposer(ctx),draft);
  state.teamSpace.userId='member-a';openTeamTask(ctx,'product',item.type,item.id);assert.notEqual(getTeamComposer(ctx),draft);assert.equal(getTeamComposer(ctx).draft,'');
  assert.deepEqual({draft:state.homeDraft,context:state.homeContext,composer:state.composer},home);assert.deepEqual(state.tasks,tasks);
});

test('first message creates exactly one personal task with detached resource snapshots and consumes only its own draft', () => withDocument(() => {
  const state=setup(),item=resource(state),ctx=wireRealTaskCreation(appContext(state)),count=state.tasks.length;
  state.homeDraft='保留首页草稿';openTeamTask(ctx,'product',item.type,item.id);inputChat({dataset:{live:'chat:draft'},value:'  准备项目复盘 PPT  '},ctx);
  handleChat('chat:set-model',{dataset:{value:'GPT'}},ctx);const draft=getTeamComposer(ctx),key=draft.teamDraftKey;
  handleChat('chat:send',{dataset:{}},ctx);const task=ctx.currentTask();
  assert.equal(state.tasks.length,count+1);assert.equal(task.messages[0].text,'准备项目复盘 PPT');assert.equal(task.teamOrigin.resourceId,item.id);assert.equal(task.model,'GPT');assert.equal(task.project,'');
  assert.equal(state.teamDrafts[key],undefined);assert.equal(state.homeDraft,'保留首页草稿');
  draft.teamAssetSnapshot.description='发送后修改草稿';assert.notEqual(task.teamAssetSnapshot.description,draft.teamAssetSnapshot.description);
}));

test('first send requests personal connection, cancellation preserves input and confirmation sends exactly once', () => withDocument(() => {
  const state=setup(),{item}=expertResource(state),ctx=wireRealTaskCreation(appContext(state)),count=state.tasks.length;
  openTeamTask(ctx,'product',item.type,item.id);inputChat({dataset:{live:'chat:draft'},value:'核对这份周报的来源'},ctx);
  getTeamComposer(ctx).context.push({id:'my-file',type:'file',name:'周报.txt',text:'我的周报'});const before=clone(getTeamComposer(ctx));
  handleChat('chat:send',{dataset:{}},ctx);assert.equal(state.tasks.length,count);assert.deepEqual(getTeamComposer(ctx),before);
  assert.match(ctx.ui.modal.title,/发送前.*连接/);assert.match(ctx.ui.modal.body,/飞书/);assert.equal(state.teamSpace.authorizations.me,undefined);
  const cancelled=ctx.ui.teamPendingSend.token;handleTeamContext('team-task:cancel-connect',{dataset:{token:cancelled}},ctx);
  assert.equal(ctx.ui.modal,null);assert.deepEqual(getTeamComposer(ctx),before);handleTeamContext('team-task:connect-send',{dataset:{token:cancelled}},ctx);assert.equal(state.tasks.length,count);
  handleChat('chat:send',{dataset:{}},ctx);const token=ctx.ui.teamPendingSend.token;handleTeamContext('team-task:connect-send',{dataset:{token}},ctx);
  assert.equal(state.tasks.length,count+1);assert.equal(ctx.currentTask().messages[0].text,'核对这份周报的来源');assert.deepEqual(state.teamSpace.authorizations.me,{lark:'demo-authorized'});
  handleTeamContext('team-task:connect-send',{dataset:{token}},ctx);handleChat('chat:send',{dataset:{}},ctx);assert.equal(state.tasks.length,count+1);assert.equal(ctx.currentTask().messages.filter(m=>m.role==='user').length,1);
}));

test('pending consent cannot send after navigation or resource removal', () => withDocument(() => {
  const state=setup(),{item}=expertResource(state),ctx=wireRealTaskCreation(appContext(state)),count=state.tasks.length;
  openTeamTask(ctx,'product',item.type,item.id);inputChat({dataset:{live:'chat:draft'},value:'保留输入'},ctx);handleChat('chat:send',{dataset:{}},ctx);
  const token=ctx.ui.teamPendingSend.token,route=ctx.ui.route;ctx.ui.route='home';handleTeamContext('team-task:connect-send',{dataset:{token}},ctx);assert.equal(state.tasks.length,count);
  ctx.ui.route=route;model.removeTeamResource(state,'product',item.id);handleTeamContext('team-task:connect-send',{dataset:{token}},ctx);
  assert.equal(state.tasks.length,count);assert.equal(getTeamComposer(ctx).draft,'保留输入');assert.equal(state.teamSpace.authorizations.me,undefined);assert.equal(ctx.ui.teamPendingSend,undefined);
}));

test('experts have their own conversation while tools and knowledge enter an ordinary task as removable resources', () => {
  const state=setup(),{item:expert}=expertResource(state),tool=resource(state),knowledge=addKnowledge(state),ctx=appContext(state);
  openTeamTask(ctx,'product',expert.type,expert.id);assert.equal(getTeamComposer(ctx).expert,'流程核对助理');assert.match(renderTeamTask(ctx),/<h1>流程核对助理<\/h1>/);
  for(const item of [tool,knowledge]) {
    openTeamTask(ctx,'product',item.type,item.id);assert.equal(getTeamComposer(ctx).expert,'');assert.match(renderTeamTask(ctx),/<h1>这次想让小悠做什么？<\/h1>/);
    assert.match(renderTeamTask(ctx),/data-action="team-task:remove-(?:tool|resource)"/);
  }
});

test('removing tool or knowledge references preserves personal input and files and clears source and pending consent', () => withDocument(() => {
  for(const type of ['plugin','knowledge']) {
    const state=setup(),item=type==='plugin'?resource(state,'plugin','lark'):addKnowledge(state),ctx=wireRealTaskCreation(appContext(state)),count=state.tasks.length;
    openTeamTask(ctx,'product',item.type,item.id);inputChat({dataset:{live:'chat:draft'},value:'整理我上传的材料'},ctx);
    const draft=getTeamComposer(ctx);draft.context.push({id:'upload',type:'file',name:'我的材料.txt',text:'我的内容'});draft.model='GPT';
    handleTeamContext('team-task:remove-resource',{dataset:{}},ctx);
    assert.equal(draft.draft,'整理我上传的材料');assert.equal(draft.model,'GPT');assert.equal(draft.teamOrigin,null);assert.equal(draft.teamAssetSnapshot,null);assert.equal(draft.customInstructions,'');
    assert.deepEqual(draft.context,[{id:'upload',type:'file',name:'我的材料.txt',text:'我的内容'}]);handleChat('chat:send',{dataset:{}},ctx);
    assert.equal(state.tasks.length,count+1);assert.equal(ctx.currentTask().origin,'manual');assert.equal(ctx.currentTask().context[0].id,'upload');assert.equal(state.teamSpace.authorizations.me,undefined);
  }
}));

test('manually added experts stay removable from a tool task while a bound team expert cannot be detached', () => withDocument(() => {
  const state=setup(),{expert,item}=expertResource(state),tool=resource(state),ctx=appContext(state);
  openTeamTask(ctx,'product',tool.type,tool.id);handleChat('chat:set-expert',{dataset:{value:expert.name}},ctx);assert.match(renderTeamTask(ctx),/data-action="chat:clear-expert"/);
  handleChat('chat:clear-expert',{dataset:{}},ctx);assert.equal(getTeamComposer(ctx).expert,'');assert.equal(getTeamComposer(ctx).teamOrigin.resourceId,tool.id);
  openTeamTask(ctx,'product',item.type,item.id);assert.doesNotMatch(renderTeamTask(ctx),/data-action="chat:clear-expert"/);handleChat('chat:clear-expert',{dataset:{}},ctx);assert.equal(getTeamComposer(ctx).expert,expert.name);
}));

test('plugin connection is consistent across resource use, catalog and task selection and stays isolated per member', () => withDocument(() => {
  const state=setup(),item=resource(state,'plugin','lark'),ctx=appContext(state,'plugins'),plugin=state.catalog.plugins.find(p=>p.id==='lark'),options=optionsFor(state,item,'product',true);
  function ready(value) {
    assert.equal(isPluginConnected(state,plugin),value);ctx.ui.route='plugins';renderCatalog(ctx);ctx.ui.catalog.queries.plugins='飞书';const html=renderCatalog(ctx);
    if(value)assert.match(html,/cat-auth is-ready/);else assert.doesNotMatch(html,/cat-auth is-ready/);
    ctx.ui.route='home';handleChat('chat:pick-plugin',{dataset:{}},ctx);const button=ctx.ui.modal.body.match(/<button[^>]+data-action="chat:add-reference"[^>]+data-type="plugin"[^>]+data-id="lark"[^>]*>/)?.[0];assert.ok(button);assert.equal(button.includes('disabled'),!value);
  }
  ready(false);assert.ok(model.authorizeTeamTask(state,options).ok);ready(true);
  handleCatalog('cat:revoke-auth',{dataset:{kind:'plugins',id:'lark'}},ctx);ready(false);assert.ok(model.validateTeamTask(state,options));
  handleCatalog('cat:demo-authorize',{dataset:{kind:'plugins',id:'lark'}},ctx);ready(true);assert.equal(model.validateTeamTask(state,options),'');
  state.teamSpace.userId='member-a';ready(false);handleCatalog('cat:demo-authorize',{dataset:{kind:'plugins',id:'lark'}},ctx);ready(true);
  handleCatalog('cat:revoke-auth',{dataset:{kind:'plugins',id:'lark'}},ctx);ready(false);state.teamSpace.userId='me';ready(true);
}));

test('team tasks retain ordinary pause, resume and file generation without sharing inputs or outputs into the space', () => withDocument(() => {
  const state=setup(),item=resource(state),ctx=wireRealTaskCreation(appContext(state)),spaceBefore=clone(model.getTeam(state,'product'));
  openTeamTask(ctx,'product',item.type,item.id);inputChat({dataset:{live:'chat:draft'},value:'生成项目复盘 PPT'},ctx);handleChat('chat:send',{dataset:{}},ctx);const task=ctx.currentTask();tickTasks(ctx);tickTasks(ctx);
  handleChat('chat:stop',{dataset:{}},ctx);const paused=clone({elapsed:task.elapsed,progress:task.progress,messages:task.messages});tickTasks(ctx);assert.deepEqual({elapsed:task.elapsed,progress:task.progress,messages:task.messages},paused);
  handleChat('chat:resume',{dataset:{}},ctx);for(let i=0;i<8&&task.status==='running';i++)tickTasks(ctx);
  assert.equal(task.status,'complete');assert.ok(task.files.length);assert.deepEqual(model.getTeam(state,'product'),spaceBefore);
  inputChat({dataset:{live:'chat:draft'},value:'再补充风险说明'},ctx);handleChat('chat:send',{dataset:{}},ctx);handleChat('chat:stop',{dataset:{}},ctx);const messages=clone(task.messages);
  model.removeTeamResource(state,'product',item.id);handleChat('chat:resume',{dataset:{}},ctx);assert.equal(task.status,'paused');assert.deepEqual(task.messages,messages);
}));

// UI contracts focus on visible actions and the actual backing mutations.
test('team list offers creation and each space has resources and members as the two main pages', () => {
  const state=setup(),ctx=appContext(state,'teams'),html=renderTeamSpace(ctx);assert.match(html,/创建团队空间/);assert.match(html,/产品体验团队/);
  handleTeamSpace('team:create',{dataset:{}},ctx);assert.match(ctx.ui.modal.body,/team:create/);
  submitForm('team:create',{name:'新建体验空间',description:'共同维护常用资料'},ctx);const team=model.visibleTeams(state).find(t=>t.name==='新建体验空间');assert.ok(team);assert.match(ctx.ui.route,new RegExp(`team/${team.id}`));
  ctx.ui.route=`team/${team.id}/resources`;const resources=renderTeamSpace(ctx);assert.match(resources,/空间资源/);assert.match(resources,/成员配置/);assert.match(resources,/插件/);assert.match(resources,/助理/);assert.match(resources,/知识库/);
  assert.doesNotMatch(resources,/套件|发布版本|协作台|共享对话|团队额度/);assert.deepEqual(model.teamResources(state,team.id),[]);
});

test('resource and invitation forms operate within their space and ordinary members see no resource management actions', () => {
  const state=setup(),team=freshTeam(state),ctx=appContext(state,`team/${team.id}/resources`);
  handleTeamSpace('team:add-resource',{dataset:{id:team.id,kind:'plugin',source:'office'}},ctx);const item=model.teamResources(state,team.id)[0];assert.ok(item);assert.equal(item.sourceId,'office');
  submitForm('team:create-knowledge',{name:'项目口径',description:'字段说明',content:'客诉按问题首次发生日期统计。'},ctx,{id:team.id});assert.ok(model.teamResources(state,team.id).some(r=>r.type==='knowledge'));
  ctx.ui.route=`team/${team.id}/members`;handleTeamSpace('team:invite',{dataset:{id:team.id}},ctx);handleTeamSpace('team:select-invitee',{dataset:{id:team.id,email:'colleague-c@example.com'}},ctx);submitForm('team:invite',{memberSearch:ctx.ui.teamSpace.inviteQuery,role:'member'},ctx,{id:team.id});assert.match(renderTeamSpace(ctx),/colleague-c@example.com/);
  ctx.ui.route='team/product/resources';state.teamSpace.userId='member-b';handleTeamSpace('team:tab',{dataset:{id:'product',kind:'plugin'}},ctx);const member=renderTeamSpace(ctx);
  assert.match(member,/team:use/);assert.doesNotMatch(member,/data-action="team:(?:add-resource|open-picker|edit-resource|remove-resource|confirm-remove-resource)"/);
  ctx.ui.route='team/product/members';const members=renderTeamSpace(ctx);assert.doesNotMatch(members,/data-action="team:(?:invite|edit-role|remove-member|confirm-remove-member|cancel-invitation)"/);
});

test('resource examples fill an editable private draft and never overwrite existing input or send automatically', () => {
  const state=setup(),item=resource(state),ctx=appContext(state,'team/product/resources'),count=state.tasks.length;
  const el={dataset:{id:'product',kind:'plugin',asset:item.id,resource:item.id,prompt:'把项目进展整理成汇报 PPT'}};
  handleTeamSpace('team:use',el,ctx);const draft=getTeamComposer(ctx);assert.ok(draft);assert.equal(draft.draft,el.dataset.prompt);assert.equal(state.tasks.length,count);
  draft.draft='已经输入的另一项工作';el.dataset.prompt='另一个示例';handleTeamSpace('team:use',el,ctx);assert.equal(getTeamComposer(ctx),draft);assert.equal(draft.draft,'已经输入的另一项工作');assert.equal(state.tasks.length,count);
});

// Existing local data is retained, but migration must not silently broaden the
// audience of formerly selected resources or turn personal files into shared ones.
test('legacy personal projects and drafts are archived without sharing resources or losing conversation files', () => {
  const state=initialState();initCatalog(state);initTaskFiles(state.tasks[0],'dashboard');
  state.projects=[{id:'design',name:'旧产品项目',knowledge:[{id:'private-k',name:'私有资料',content:'只属于个人项目'}]}];state.tasks[0].project='design';
  state.projectDrafts={'design:a':{draft:'未发送的个人草稿',context:[{type:'file',name:'个人附件.txt',text:'个人正文'}]}};
  state.tasks[0].projectSnapshot={projectName:'旧项目',knowledge:[{name:'私有资料'}]};state.tasks[0].context.push({type:'project-knowledge',id:'private-k',text:'历史引用'});
  const tasks=clone(state.tasks),projects=clone(state.projects),drafts=clone(state.projectDrafts);model.initTeamSpace(state);
  assert.deepEqual(state.legacyProjectArchive.projects,projects);assert.deepEqual(state.legacyProjectArchive.projectDrafts,drafts);assert.deepEqual(state.projects,[]);assert.deepEqual(state.projectDrafts,{});
  assert.equal(state.tasks[0].legacyProjectId,'design');assert.deepEqual(state.tasks[0].files,tasks[0].files);assert.deepEqual(state.tasks[0].messages,tasks[0].messages);assert.deepEqual(state.tasks[0].projectSnapshot,tasks[0].projectSnapshot);
  assert.doesNotMatch(JSON.stringify(state.teamSpace),/私有资料|private-k|未发送的个人草稿/);const once=clone(state);model.initTeamSpace(state);assert.deepEqual(state,once);
});

test('legacy suite migration preserves selected access and old snapshots without reviving unpublished drafts', () => {
  const state=initialState();initCatalog(state);const office=clone(state.catalog.plugins.find(p=>p.id==='office'));delete office.auth;
  const team={id:'legacy',name:'旧团队',ownerId:'me',members:[{id:'me',name:'我'},{id:'member-a',name:'成员 A'},{id:'member-b',name:'成员 B'}]};
  const published={name:'受限旧套件',description:'旧说明',assets:[{...office,type:'plugin'}],audience:{mode:'selected',memberIds:['member-a']},version:3,publishedAt:1};
  state.teamSpace={version:1,userId:'me',currentTeamId:'legacy',teams:[team],authorizations:{},bundles:[{id:'old-bundle',teamId:'legacy',draft:{name:'尚未发布的更新',assets:[{type:'plugin',id:'image'}],audience:{mode:'all',memberIds:[]}},published},{id:'unpublished',teamId:'legacy',draft:{name:'不能自动共享的草稿',assets:[{type:'plugin',id:'image'}]},published:null}]};
  const oldTask={...newTask('旧任务'),teamOrigin:{teamId:'legacy',teamName:'旧团队',bundleId:'old-bundle',bundleName:'受限旧套件',version:3,assetId:'office',assetType:'plugin',assetName:office.name},teamAssetSnapshot:{...office,type:'plugin'},context:[{type:'team-asset',id:'old-bundle:plugin:office',name:office.name,text:'旧引用'}]};
  initTaskFiles(oldTask,'dashboard');state.tasks.push(oldTask);const snapshot=clone(oldTask.teamAssetSnapshot),files=clone(oldTask.files),messages=clone(oldTask.messages);
  model.initTeamSpace(state);assert.equal(state.teamSpace.bundles,undefined);assert.ok(state.teamSpace.legacyBundleArchive);
  assert.deepEqual(oldTask.teamAssetSnapshot,snapshot);assert.deepEqual(oldTask.files,files);assert.deepEqual(oldTask.messages,messages);assert.ok(oldTask.teamOrigin.resourceId);
  state.teamSpace.userId='member-b';assert.equal(model.teamResources(state,'legacy').length,0);assert.ok(model.validateTeamTask(state,oldTask));
  state.teamSpace.userId='member-a';const items=model.teamResources(state,'legacy');assert.equal(items.length,1);assert.equal(items[0].sourceId,'office');assert.equal(model.validateTeamTask(state,oldTask),'');
  const once=clone(state);model.initTeamSpace(state);assert.deepEqual(state,once);
});

test('retired project code remains disconnected and common home, viewer and team routes remain loaded', () => {
  const entry=readFileSync(new URL('../frontend/index.html',import.meta.url),'utf8'),app=readFileSync(new URL('../frontend/src/app.js',import.meta.url),'utf8');
  assert.match(entry,/team-space\.css/);assert.doesNotMatch(entry,/project-space\.css|project-resources\.css/);assert.doesNotMatch(app,/import[^\n]+\.\/project-/);
  assert.doesNotMatch(app,/data-action="(?:app:new-project|app:move-task|ps:|pres:|project:)/);assert.match(app,/renderHome/);assert.match(app,/handleViewer/);assert.match(app,/renderTeamSpace/);
});

test('legacy project memories stay archived and never enter new personal or team tasks', () => {
  const state=initialState();initCatalog(state);state.projects=[{id:'design',name:'旧产品项目'}];
  state.settings={memory:{enabled:true,items:[{id:'global-memory',title:'个人偏好',text:'先给结论',scope:'global',source:'个人确认',version:1},{id:'legacy-memory',title:'旧项目规则',text:'旧项目专属限制',scope:'project',projectId:'design',source:'旧项目确认',version:2}]}};
  state.tasks[0].memorySnapshot=[clone(state.settings.memory.items[1])];const history=clone(state.tasks[0].memorySnapshot);initWorkspace(state);model.initTeamSpace(state);
  assert.deepEqual(collectMemorySnapshot(state).map(m=>m.id),['global-memory']);assert.deepEqual(collectMemorySnapshot(state,'design').map(m=>m.id),['global-memory']);
  const ctx=wireRealTaskCreation(appContext(state));ctx.startTask('普通新任务');assert.deepEqual(ctx.currentTask().memorySnapshot.map(m=>m.id),['global-memory']);
  const item=resource(state);ctx.startTask('团队资源新任务',optionsFor(state,item));assert.deepEqual(ctx.currentTask().memorySnapshot.map(m=>m.id),['global-memory']);
  assert.deepEqual(state.tasks.find(t=>t.id==='sample-dashboard').memorySnapshot,history);ctx.ui.route='settings/memory';assert.match(renderWorkspace(ctx),/旧项目归档/);
});
test('editing archived memory preserves its original scope, project and provenance and rejects scope promotion', () => {
  const state=setup();initWorkspace(state);
  const archived={id:'legacy-memory',title:'旧项目规则',text:'只适用于旧项目',scope:'project',projectId:'retired-id',source:'原用户明确确认',version:2};
  state.settings.memory.items.push(archived);state.legacyProjectArchive.projects.push({id:'retired-id',name:'已退役项目'});
  const ctx=appContext(state,'settings/memory');handleWorkspace('work:memory-edit',{dataset:{id:archived.id}},ctx);
  assert.equal(ctx.ui.modal.title,'编辑归档记忆');assert.match(ctx.ui.modal.body,/已退役项目/);assert.doesNotMatch(ctx.ui.modal.body,/<select[^>]*name="projectId"/);
  submitForm('work:memory',{title:'更新归档标题',text:'更新归档内容',scope:'project',projectId:'forged-project'},ctx,{},submitWorkspace);
  assert.equal(archived.title,'更新归档标题');assert.equal(archived.text,'更新归档内容');assert.equal(archived.scope,'project');assert.equal(archived.projectId,'retired-id');assert.equal(archived.source,'原用户明确确认');assert.equal(archived.version,3);
  const before=clone(archived);
  submitForm('work:memory',{title:'扩大作用范围',text:'不应保存',scope:'global'},ctx,{},submitWorkspace);
  assert.deepEqual(archived,before);assert.match(ctx.notices.at(-1),/范围不可变更/);assert.ok(!collectMemorySnapshot(state).some(m=>m.id===archived.id));
});

test('new memories use only the personal global scope and fresh installs do not invent project memories', () => {
  const state=setup();initWorkspace(state);assert.ok(state.settings.memory.items.every(m=>m.scope==='global'));
  const ctx=appContext(state,'settings/memory');handleWorkspace('work:memory-new',{dataset:{}},ctx);
  assert.match(ctx.ui.modal.body,/name="scope" value="global"/);assert.doesNotMatch(ctx.ui.modal.body,/<select[^>]*name="projectId"/);
  const count=state.settings.memory.items.length;
  submitForm('work:memory',{title:'伪造项目记忆',text:'不应保存',scope:'project',projectId:'design'},ctx,{},submitWorkspace);assert.equal(state.settings.memory.items.length,count);
  submitForm('work:memory',{title:'新的个人偏好',text:'用简洁中文说明结论',scope:'global',projectId:'design'},ctx,{},submitWorkspace);
  const saved=state.settings.memory.items.at(-1);assert.equal(saved.scope,'global');assert.equal(saved.projectId,'');assert.equal(saved.text,'用简洁中文说明结论');assert.equal(state.settings.memory.items.length,count+1);
});

test('ordinary result preview still supports annotations, version updates and undo', () => {
  const state=setup(),task=state.tasks[0];
  initTaskFiles(task,'dashboard');
  const ctx=appContext(state,'chat/'+task.id),file=task.files[0],original=file.content.title;
  handleViewer('viewer:open',{dataset:{id:file.id,task:task.id}},ctx);
  assert.equal(task.viewer.open,true);
  assert.equal(task.viewer.active,file.id);
  task.annotations.push({id:'review-a',fileId:file.id,target:'title',sourceVersion:file.version,before:original,after:'已核对的标题'});
  const changes=applyAnnotations(task);
  assert.equal(changes.length,1);
  assert.equal(file.content.title,'已核对的标题');
  handleViewer('viewer:undo',{dataset:{task:task.id,id:changes[0].id}},ctx);
  assert.equal(file.content.title,original);
  assert.equal(changes[0].undone,true);
});

test('migration never broadens a private changed snapshot through an older public resource with the same source ID', () => {
  const state=initialState();initCatalog(state);const office={...clone(state.catalog.plugins.find(p=>p.id==='office')),type:'plugin'};delete office.auth;
  const team={id:'legacy',name:'旧团队',ownerId:'me',members:[{id:'me',name:'我'},{id:'member-a',name:'成员 A'},{id:'member-b',name:'成员 B'}]};
  const bundle=(id,asset,audience,publishedAt)=>({id,teamId:'legacy',draft:{name:id,assets:[]},published:{name:id,assets:[asset],audience,version:1,publishedAt}});
  state.teamSpace={version:1,userId:'me',currentTeamId:'legacy',teams:[team],authorizations:{},bundles:[
    bundle('public',{...office,description:'公开说明'},{mode:'all',memberIds:[]},1),
    bundle('private',{...office,description:'仅指定成员可见的独立配置'},{mode:'selected',memberIds:['member-a']},2)
  ]};
  model.initTeamSpace(state);assert.equal(team.resources.length,2);
  state.teamSpace.userId='member-b';const publicItems=model.teamResources(state,'legacy');assert.equal(publicItems.length,1);assert.equal(publicItems[0].description,'公开说明');
  const privateResource=team.resources.find(r=>r.description.startsWith('仅指定'));assert.ok(model.teamTaskOptions(state,'legacy','plugin',privateResource.id).error);
  state.teamSpace.userId='member-a';assert.equal(model.teamResources(state,'legacy').length,2);assert.ok(model.teamTaskOptions(state,'legacy','plugin',privateResource.id).options);
  state.teamSpace.userId='me';assert.equal(model.canManageTeam(state,'legacy'),true);assert.ok(model.teamTaskOptions(state,'legacy','plugin',privateResource.id).error,'management authority must not silently expand an old selected audience');
});

test('legacy resource drafts retain unsent input and attachments during key migration and duplicate-source draft collisions', () => {
  const state=initialState();initCatalog(state);const office={...clone(state.catalog.plugins.find(p=>p.id==='office')),type:'plugin'};delete office.auth;
  state.teamSpace={version:1,userId:'me',currentTeamId:'legacy',authorizations:{},teams:[{id:'legacy',name:'旧团队',ownerId:'me',members:[{id:'me',name:'我'}]}],bundles:['one','two'].map(id=>({id,teamId:'legacy',draft:{name:id,assets:[]},published:{name:id,assets:[clone(office)],audience:{mode:'all',memberIds:[]},version:1,publishedAt:1}}))};
  state.teamDrafts=Object.fromEntries(['one','two'].map((id,index)=>{
    const key=`me:${id}:plugin:office`;return [key,{teamDraftKey:key,isTeamDraft:true,draft:`未发送内容${index}`,context:[{type:'file',id:`file-${index}`,name:`附件${index}`,text:`个人输入${index}`}],teamOrigin:{teamId:'legacy',bundleId:id,bundleName:id,version:1,assetId:'office',assetType:'plugin',assetName:office.name},teamAssetSnapshot:clone(office)}];
  }));
  const input=Object.values(state.teamDrafts).map(d=>({draft:d.draft,context:clone(d.context)}));model.initTeamSpace(state);
  const drafts=Object.values(state.teamDrafts);assert.equal(drafts.length,2);assert.equal(new Set(drafts.map(d=>d.teamOrigin.resourceId)).size,1);
  assert.deepEqual(drafts.map(d=>({draft:d.draft,context:d.context})).sort((a,b)=>a.draft.localeCompare(b.draft)),input);
  assert.ok(drafts.some(d=>d.teamDraftKey.includes(':legacy:plugin:resource-')));
  const routes=['one','two'].map(id=>normalizeTeamRoute(state,`team-task/${id}/plugin/office`));
  assert.notEqual(routes[0],routes[1],'colliding legacy URLs must distinguish their original drafts');
  const recovered=routes.map(route=>getTeamComposer(appContext(state,route)));
  assert.deepEqual(recovered.map(d=>d.draft),['未发送内容0','未发送内容1']);
  assert.deepEqual(recovered.map(d=>d.context.filter(ref=>ref.type!=='team-asset')),input.map(i=>i.context));
  assert.ok(recovered.every(d=>d.context.filter(ref=>ref.type==='team-asset').length===1),'reopening refreshes the space reference without duplicating personal input');
  assert.equal(normalizeTeamRoute(state,routes[1]),routes[1]);
  const foreignKey='member-a:private:plugin:office';
  state.teamDrafts[foreignKey]={...clone(recovered[1]),teamDraftKey:foreignKey,draft:'其他成员的私有输入'};
  const baseRoute=routes[0].split('/').slice(0,4).join('/');
  assert.equal(getTeamComposer(appContext(state,baseRoute+'/'+encodeURIComponent(foreignKey))),recovered[0],'another member alias cannot reveal that member draft');
  const retainedKey=recovered[1].teamDraftKey;resetTeamDraft(state,recovered[1]);
  assert.equal(state.teamDrafts[retainedKey],undefined);assert.equal(state.teamDrafts[recovered[0].teamDraftKey],recovered[0]);
  assert.equal(state.teamDrafts[foreignKey].draft,'其他成员的私有输入');
});

test('initialization never auto-shares a local knowledge library, including one with a built-in example ID', () => {
  const state=initialState();initCatalog(state);initWorkspace(state);
  state.workspace.knowledge.local.push({id:'kb-general',name:'我的私有知识库',description:'不自动共享',content:'私人计划',documents:[]});
  model.initTeamSpace(state);
  assert.doesNotMatch(JSON.stringify(model.getTeam(state,'product').resources),/我的私有知识库|私人计划/);
  const team=freshTeam(state,'主动选择资料的团队');const result=model.addTeamResource(state,team.id,{type:'knowledge',sourceId:'kb-general'});
  assert.ok(result.resource);assert.equal(result.resource.name,'我的私有知识库','explicit selection may copy a personal library');
  result.resource.snapshot.content='空间修改';assert.equal(state.workspace.knowledge.local.find(k=>k.name==='我的私有知识库').content,'私人计划');
});

test('resource search and member actions keep user-provided names escaped and operations scoped to the current space', () => {
  const state=setup(),team=freshTeam(state,'<b>测试空间</b>'),item=resource(state,'plugin','office',team.id),ctx=appContext(state,`team/${team.id}/resources`);
  model.updateTeamResource(state,team.id,item.id,{name:'<script>办公</script>',description:'仅用于周报整理'});
  const html=renderTeamSpace(ctx);assert.match(html,/&lt;b&gt;测试空间&lt;\/b&gt;/);assert.match(html,/&lt;script&gt;办公&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>办公/);
  inputTeamSpace({dataset:{live:'team:search'},value:'周报'},ctx);assert.match(renderTeamSpace(ctx),/team:use/);
  inputTeamSpace({dataset:{live:'team:search'},value:'不存在的关键词'},ctx);assert.doesNotMatch(renderTeamSpace(ctx),/data-action="team:use"/);
  const roleCtx=appContext(state,'team/product/members');submitForm('team:member-role',{role:'member'},roleCtx,{id:'product',member:'member-a'});assert.equal(model.getTeam(state,'product').members.find(m=>m.id==='member-a').role,'member');
  const before=clone(model.getTeam(state,'product'));state.teamSpace.userId='member-b';
  submitForm('team:member-role',{role:'admin'},roleCtx,{id:'product',member:'member-b'});assert.deepEqual(model.getTeam(state,'product'),before);
});

test('an old team draft URL resolves to its migrated space resource and reopens original unsent input and attachments', () => {
  const state=initialState();initCatalog(state);const asset={...clone(state.catalog.plugins.find(p=>p.id==='office')),type:'plugin'};delete asset.auth;
  state.teamSpace={version:1,userId:'me',currentTeamId:'product',teams:[{id:'product',name:'产品团队',ownerId:'me',members:[{id:'me',name:'我'}]}],authorizations:{},bundles:[{id:'legacy-bundle',teamId:'product',draft:{name:'旧套件',assets:[]},published:{name:'旧套件',assets:[asset],audience:{mode:'all',memberIds:[]},version:1}}]};
  const original={isTeamDraft:true,draft:'先保留，稍后整理项目周报',teamDraftKey:'me:legacy-bundle:plugin:office',teamOrigin:{teamId:'product',bundleId:'legacy-bundle',assetType:'plugin',assetId:'office'},teamAssetSnapshot:clone(asset),context:[{type:'file',id:'unsent-upload',name:'项目记录.txt',text:'只保留在个人草稿中的内容'}],model:'GPT',annotations:[]};
  state.teamDrafts={[original.teamDraftKey]:original};const saved=clone(original),tasks=clone(state.tasks);
  model.initTeamSpace(state);const route=normalizeTeamRoute(state,'team-task/legacy-bundle/plugin/office'),mapped=state.teamSpace.legacyResourceMap['legacy-bundle:plugin:office'];
  assert.equal(route,`team-task/${mapped.teamId}/plugin/${mapped.resourceId}`);assert.equal(normalizeTeamRoute(state,route),route);
  const draft=getTeamComposer(appContext(state,route));assert.equal(draft,original);assert.equal(draft.draft,saved.draft);assert.deepEqual(draft.context.filter(ref=>ref.type!=='team-asset'),saved.context);assert.equal(draft.context.filter(ref=>ref.type==='team-asset').length,1);assert.deepEqual(draft.teamAssetSnapshot,model.getResource(state,mapped.teamId,mapped.resourceId).snapshot);assert.equal(draft.model,saved.model);assert.deepEqual(state.tasks,tasks);
  assert.equal(normalizeTeamRoute(state,'projects'),'teams');assert.equal(normalizeTeamRoute(state,'project/retired-id'),'teams');assert.equal(normalizeTeamRoute(state,'team/product/resources'),'team/product/resources');
});

// An expert's tools and knowledge belong to its space and are configured once
// by a manager. A member's task inherits them as bound, frozen references.
test('expert associations are manager-only and reject invalid changes atomically while normalizing duplicate IDs', () => {
  const state=setup(),{item,plugin}=expertResource(state),knowledge=addKnowledge(state),team=freshTeam(state),foreign=resource(state,'plugin','office',team.id);
  state.teamSpace.userId='member-b';const denied=clone(item);
  assert.ok(model.updateTeamResource(state,'product',item.id,{pluginResourceIds:[],knowledgeResourceIds:[knowledge.id]}).error);assert.deepEqual(item,denied);
  state.teamSpace.userId='member-a';
  assert.ok(model.updateTeamResource(state,'product',item.id,{pluginResourceIds:[plugin.id,plugin.id],knowledgeResourceIds:[knowledge.id,knowledge.id]}).resource);
  assert.deepEqual(item.pluginResourceIds,[plugin.id]);assert.deepEqual(item.knowledgeResourceIds,[knowledge.id]);
  const stopped=resource(state,'plugin','office');model.updateTeamResource(state,'product',stopped.id,{enabled:false});
  const invalid=[{pluginResourceIds:[foreign.id]},{pluginResourceIds:[knowledge.id]},{knowledgeResourceIds:[plugin.id]},{pluginResourceIds:['missing']},{pluginResourceIds:'lark'},{knowledgeResourceIds:[null]},{pluginResourceIds:[stopped.id]}];
  for(const values of invalid){const before=clone(model.getTeam(state,'product'));const result=model.updateTeamResource(state,'product',item.id,{name:'不应部分保存',...values});assert.ok(result.error,JSON.stringify(values));assert.deepEqual(model.getTeam(state,'product'),before);}
  assert.ok(model.updateTeamResource(state,'product',item.id,{pluginResourceIds:[],knowledgeResourceIds:[]}).resource);
  assert.deepEqual(item.pluginResourceIds,[]);assert.deepEqual(item.knowledgeResourceIds,[]);
  assert.deepEqual(model.resolveTeamExpert(state,'product',item.id).asset.plugins,[]);assert.deepEqual(model.resolveTeamExpert(state,'product',item.id).asset.knowledgeBases,[]);
});

test('association validation on expert creation is atomic and never imports a catalog dependency outside the space', () => {
  const state=setup(),expert=addCustomExpert(state),team=freshTeam(state),foreign=resource(state,'plugin','lark');
  assert.ok(model.addTeamResource(state,team.id,{type:'expert',sourceId:expert.id,pluginResourceIds:[foreign.id]}).error);assert.deepEqual(model.teamResources(state,team.id),[]);
  const result=model.addTeamResource(state,team.id,{type:'expert',sourceId:expert.id});assert.ok(result.resource,result.error);
  assert.deepEqual(result.resource.pluginResourceIds,[]);assert.deepEqual(model.resolveTeamExpert(state,team.id,result.resource.id).asset.plugins,[]);
  assert.equal(model.teamResources(state,team.id).length,1,'adding an expert must not silently add external resources');
});

test('a public expert cannot expose a restricted space resource, and later access restrictions are rechecked at execution', () => {
  const state=setup(),{item,plugin}=expertResource(state),knowledge=addKnowledge(state);knowledge.allowedMemberIds=['member-a'];
  const before=clone(item);assert.ok(model.updateTeamResource(state,'product',item.id,{knowledgeResourceIds:[knowledge.id]}).error);assert.deepEqual(item,before);
  item.allowedMemberIds=['member-a'];assert.ok(model.updateTeamResource(state,'product',item.id,{knowledgeResourceIds:[knowledge.id]}).resource);
  state.teamSpace.userId='member-b';assert.ok(!optionsFor(state,item,'product',true));
  state.teamSpace.userId='member-a';const task=optionsFor(state,item,'product',true);assert.ok(task);assert.match(task.context.find(r=>r.type==='team-expert-knowledge').text,/数据来源/);
  plugin.allowedMemberIds=['me'];const access=model.teamTaskAccess(state,task);assert.equal(access.available,false);assert.deepEqual(access.missingPlugins,[]);assert.ok(model.authorizeTeamTask(state,task).error);
});

test('members inherit configured plugin snapshots and knowledge content automatically, with immutable knowledge chips', () => withDocument(() => {
  const state=setup(),{item,plugin}=expertResource(state),knowledge=addKnowledge(state),ctx=appContext(state);
  assert.ok(model.updateTeamResource(state,'product',item.id,{pluginResourceIds:[plugin.id],knowledgeResourceIds:[knowledge.id]}).resource);
  state.teamSpace.userId='member-b';openTeamTask(ctx,'product','expert',item.id);const draft=getTeamComposer(ctx);
  assert.deepEqual(draft.teamAssetSnapshot.plugins.map(p=>p.id),['lark']);assert.equal(draft.teamAssetSnapshot.knowledgeBases.length,1);
  const bound=draft.context.filter(r=>r.type==='team-expert-knowledge');assert.equal(bound.length,1);assert.equal(bound[0].boundToTeamExpert,true);assert.match(bound[0].text,/数据来源和负责人/);
  const index=draft.context.indexOf(bound[0]),saved=clone(draft.context);
  handleChat('chat:remove-context',{dataset:{index:String(index)}},ctx);assert.deepEqual(getTeamComposer(ctx).context,saved);
  handleChat('chat:view-context',{dataset:{index:String(index)}},ctx);assert.match(ctx.ui.modal.body,/数据来源和负责人/);ctx.closeModal();
  assert.doesNotMatch(renderTeamTask(ctx),new RegExp(`data-action="chat:remove-context" data-index="${index}"`));
  assert.doesNotMatch(renderTeamTask(ctx),/data-action="chat:clear-expert"/);
}));

test('new expert tasks use current linked resources while historical task instructions and knowledge stay frozen', () => {
  const state=setup(),{item,plugin}=expertResource(state),knowledge=addKnowledge(state);
  model.updateTeamResource(state,'product',item.id,{knowledgeResourceIds:[knowledge.id]});const old=optionsFor(state,item,'product',true),saved=clone(old);
  model.updateTeamResource(state,'product',plugin.id,{name:'团队飞书连接',description:'新版工具说明'});
  model.updateTeamResource(state,'product',knowledge.id,{name:'新版团队手册',content:'新版知识要求写明验收日期。'});
  model.updateTeamResource(state,'product',item.id,{instructions:'新版工作方法'});const latest=optionsFor(state,item,'product',true);
  assert.equal(latest.teamAssetSnapshot.plugins[0].name,'团队飞书连接');assert.equal(latest.teamAssetSnapshot.plugins[0].description,'新版工具说明');
  assert.match(latest.context.find(r=>r.type==='team-expert-knowledge').text,/验收日期/);assert.match(latest.customInstructions,/新版工作方法/);
  assert.deepEqual(old,saved);assert.match(old.context.find(r=>r.type==='team-expert-knowledge').text,/数据来源和负责人/);
  assert.ok(model.authorizeTeamTask(state,old).ok);assert.equal(model.validateTeamTask(state,old),'');
});

test('reopening an unsent expert draft refreshes its configured resources but preserves personal input, attachments and choices', () => withDocument(() => {
  const state=setup(),{item,plugin}=expertResource(state),first=addKnowledge(state),second=addKnowledge(state,'product',{name:'新使用资料',content:'保留这份新知识正文。'}),ctx=appContext(state);
  model.updateTeamResource(state,'product',item.id,{knowledgeResourceIds:[first.id]});openTeamTask(ctx,'product','expert',item.id);
  const draft=getTeamComposer(ctx);draft.draft='保留我已经写好的问题';draft.model='GPT';draft.permission='请求批准';draft.context.push({type:'file',id:'my-upload',name:'我的附件.txt',text:'个人附件正文'},{type:'knowledge',id:'my-library',name:'我的额外引用',text:'个人引用正文'});
  model.updateTeamResource(state,'product',item.id,{instructions:'更新后的助理方法',pluginResourceIds:[plugin.id],knowledgeResourceIds:[second.id]});
  openTeamTask(ctx,'product','expert',item.id,'不要覆盖已输入内容');const latest=getTeamComposer(ctx);
  assert.equal(latest,draft);assert.equal(latest.draft,'保留我已经写好的问题');assert.equal(latest.model,'GPT');assert.equal(latest.permission,'请求批准');assert.match(latest.customInstructions,/更新后的助理方法/);
  assert.deepEqual(latest.context.filter(r=>['file','knowledge'].includes(r.type)).map(r=>r.text),['个人附件正文','个人引用正文']);
  assert.equal(latest.context.filter(r=>r.type==='team-expert-knowledge').length,1);assert.match(latest.context.find(r=>r.type==='team-expert-knowledge').text,/新知识正文/);assert.doesNotMatch(JSON.stringify(latest.context),/数据来源和负责人/);
  openTeamTask(ctx,'product','expert',item.id);assert.equal(getTeamComposer(ctx).context.filter(r=>r.type==='team-expert-knowledge').length,1,'refreshing must not duplicate bound references');
}));

test('only configured plugins request personal consent, and one-click expert use never grants another member connection', () => {
  const state=setup(),{item}=expertResource(state),data=resource(state,'plugin','idata'),knowledge=addKnowledge(state);
  model.updateTeamResource(state,'product',item.id,{pluginResourceIds:[data.id],knowledgeResourceIds:[knowledge.id]});state.teamSpace.userId='member-b';
  const options=optionsFor(state,item,'product',true);assert.deepEqual(model.teamTaskAccess(state,options).missingPlugins.map(p=>p.id),['idata']);
  assert.ok(model.authorizeTeamTask(state,options).ok);assert.deepEqual(state.teamSpace.authorizations['member-b'],{idata:'demo-authorized'});assert.equal(state.teamSpace.authorizations.me,undefined);
  state.teamSpace.userId='member-a';assert.deepEqual(model.teamTaskAccess(state,options).missingPlugins.map(p=>p.id),['idata']);
});

test('linked plugins and knowledge cannot be removed until all experts are unlinked, and stopped resources block execution', () => {
  const state=setup(),{item,plugin}=expertResource(state),knowledge=addKnowledge(state);
  model.updateTeamResource(state,'product',item.id,{knowledgeResourceIds:[knowledge.id]});const task=optionsFor(state,item,'product',true);
  for(const bound of [plugin,knowledge]){const before=clone(model.getTeam(state,'product'));const result=model.removeTeamResource(state,'product',bound.id);assert.ok(result.error);assert.match(result.error,/流程核对助理/);assert.deepEqual(model.getTeam(state,'product'),before);}
  model.updateTeamResource(state,'product',knowledge.id,{enabled:false});assert.ok(model.teamTaskAccess(state,task).reason);assert.deepEqual(model.teamTaskAccess(state,task).missingPlugins,[]);assert.ok(!optionsFor(state,item,'product',true));
  model.updateTeamResource(state,'product',knowledge.id,{enabled:true});assert.ok(model.updateTeamResource(state,'product',item.id,{pluginResourceIds:[],knowledgeResourceIds:[]}).resource);
  assert.ok(model.removeTeamResource(state,'product',plugin.id).ok);assert.ok(model.removeTeamResource(state,'product',knowledge.id).ok);assert.ok(model.validateTeamTask(state,task),'historical bound sources are still checked even after current expert changes');
});

test('the expert editor saves selected space IDs and clearing every checkbox clears both association groups', () => {
  const state=setup(),{item,plugin}=expertResource(state),knowledge=addKnowledge(state),ctx=appContext(state,'team/product/resources');
  handleTeamSpace('team:edit-resource',{dataset:{id:'product',resource:item.id}},ctx);
  assert.match(ctx.ui.modal.body,/name="pluginResourceIds"/);assert.match(ctx.ui.modal.body,/name="knowledgeResourceIds"/);assert.match(ctx.ui.modal.body,new RegExp(`value="${plugin.id}"`));
  submitForm('team:resource-editor',{name:item.name,description:item.description,instructions:'按关联知识库回答',pluginResourceIds:[plugin.id],knowledgeResourceIds:[knowledge.id]},ctx,{id:'product',resource:item.id,kind:'expert'});
  assert.deepEqual(item.pluginResourceIds,[plugin.id]);assert.deepEqual(item.knowledgeResourceIds,[knowledge.id]);
  submitForm('team:resource-editor',{name:item.name,description:item.description,instructions:'独立回答'},ctx,{id:'product',resource:item.id,kind:'expert'});
  assert.deepEqual(item.pluginResourceIds,[]);assert.deepEqual(item.knowledgeResourceIds,[]);
  state.teamSpace.userId='member-b';const before=clone(item);
  submitForm('team:resource-editor',{name:item.name,description:'不应保存',pluginResourceIds:[plugin.id],knowledgeResourceIds:[knowledge.id]},ctx,{id:'product',resource:item.id,kind:'expert'});assert.deepEqual(item,before);
});

test('legacy expert bindings migrate only to available matching resources inside their own audience, preserving historical tasks', () => {
  const state=setup(),{item,plugin}=expertResource(state),oldTask=optionsFor(state,item,'product',true),saved=clone(oldTask);state.tasks.push(oldTask);
  const existingIds=model.getTeam(state,'product').resources.map(r=>r.id);state.teamSpace.version=2;delete item.pluginResourceIds;delete item.knowledgeResourceIds;
  const sourcePlugin=clone(plugin.snapshot);item.snapshot.plugins=[sourcePlugin,{id:'external-not-in-space',name:'外部插件',type:'plugin'}];item.snapshot.pluginIds=['lark','external-not-in-space'];item.snapshot.dependencies={plugins:clone(item.snapshot.plugins)};
  model.initTeamSpace(state);assert.deepEqual(item.pluginResourceIds,[plugin.id]);assert.deepEqual(item.knowledgeResourceIds,[]);assert.deepEqual(model.getTeam(state,'product').resources.map(r=>r.id),existingIds);assert.deepEqual(oldTask,saved);
  assert.deepEqual(model.resolveTeamExpert(state,'product',item.id).asset.plugins.map(p=>p.id),['lark']);
  const once=clone(state);model.initTeamSpace(state);assert.deepEqual(state,once);
  // A later setup must respect an explicitly saved empty selection.
  state.teamSpace.version=2;item.pluginResourceIds=[];item.knowledgeResourceIds=[];item.snapshot.plugins=[sourcePlugin];item.snapshot.pluginIds=['lark'];model.initTeamSpace(state);assert.deepEqual(item.pluginResourceIds,[]);
});

test('legacy expert drafts refresh safely without recovering a narrower or stopped implicit dependency or losing personal work', () => withDocument(() => {
  const state=setup(),{item,plugin}=expertResource(state),knowledge=addKnowledge(state),data=resource(state,'plugin','idata'),ctx=appContext(state);
  model.updateTeamResource(state,'product',item.id,{knowledgeResourceIds:[knowledge.id]});openTeamTask(ctx,'product','expert',item.id);
  const draft=getTeamComposer(ctx);draft.draft='旧草稿里尚未发出的完整问题';draft.model='GPT';draft.context.push({type:'file',id:'legacy-upload',name:'旧草稿附件.txt',text:'保留旧附件正文'});
  const historical={...newTask('旧助理历史任务'),...clone(optionsFor(state,item,'product',true))};state.tasks.push(historical);const saved=clone(historical),resourceIds=model.getTeam(state,'product').resources.map(r=>r.id);
  state.teamSpace.version=2;delete item.pluginResourceIds;delete item.knowledgeResourceIds;
  item.snapshot.plugins=[clone(plugin.snapshot),clone(data.snapshot)];item.snapshot.pluginIds=['lark','idata'];item.snapshot.dependencies={plugins:clone(item.snapshot.plugins)};item.snapshot.instructions='旧空间助理当前的工作方法';
  plugin.allowedMemberIds=['member-a'];data.snapshot.enabled=false;
  model.initTeamSpace(state);assert.deepEqual(item.pluginResourceIds,[]);assert.deepEqual(item.knowledgeResourceIds,[]);assert.deepEqual(model.getTeam(state,'product').resources.map(r=>r.id),resourceIds);assert.deepEqual(historical,saved);
  const restored=getTeamComposer(ctx);assert.equal(restored,draft);assert.equal(restored.draft,'旧草稿里尚未发出的完整问题');assert.equal(restored.model,'GPT');assert.equal(restored.context.find(r=>r.id==='legacy-upload').text,'保留旧附件正文');
  assert.deepEqual(restored.teamAssetSnapshot.plugins,[]);assert.deepEqual(restored.teamAssetSnapshot.knowledgeBases,[]);assert.equal(restored.context.filter(r=>r.type==='team-expert-knowledge').length,0);assert.match(restored.customInstructions,/旧空间助理当前的工作方法/);
}));

// Regression checks exercise the combinations that previously escaped the
// individual resource, permission and first-send checks.
test('unsent plugin and knowledge drafts refresh current space content while preserving personal choices and references', () => withDocument(() => {
  for(const type of ['plugin','knowledge']) {
    const state=setup(),item=type==='plugin'?resource(state):addKnowledge(state),ctx=appContext(state);
    openTeamTask(ctx,'product',type,item.id);const draft=getTeamComposer(ctx),before=clone(draft.teamAssetSnapshot);
    draft.draft='保留业务背景和截止日期';draft.model='GPT';draft.permission='请求批准';draft.expert='我手动选择的助理';
    draft.context.push({type:'file',id:'private-upload',name:'补充材料.txt',text:'只属于我的附件'}, {type:'knowledge',id:'private-reference',name:'私人补充资料',text:'私人引用内容'});
    const personal=clone(draft.context.filter(ref=>ref.type!=='team-asset'));
    assert.ok(model.updateTeamResource(state,'product',item.id,{name:'最新空间资料',description:'最新使用说明',...(type==='knowledge'?{content:'最新知识要求补充验收日期。'}:{})}).resource);
    ctx.ui.route='team/product/resources';openTeamTask(ctx,'product',type,item.id);const refreshed=getTeamComposer(ctx);
    assert.equal(refreshed,draft);assert.equal(refreshed.draft,'保留业务背景和截止日期');assert.equal(refreshed.model,'GPT');assert.equal(refreshed.permission,'请求批准');assert.equal(refreshed.expert,'我手动选择的助理');
    assert.equal(refreshed.teamAssetSnapshot.name,'最新空间资料');assert.equal(refreshed.teamAssetSnapshot.description,'最新使用说明');assert.notDeepEqual(refreshed.teamAssetSnapshot,before);
    assert.deepEqual(refreshed.context.filter(ref=>ref.type!=='team-asset'),personal);assert.equal(refreshed.context.filter(ref=>ref.type==='team-asset').length,1);
    if(type==='knowledge')assert.match(refreshed.context.find(ref=>ref.type==='team-asset').text,/最新知识要求补充验收日期/);
    model.updateTeamResource(state,'product',item.id,{description:'仍在输入页时更新的说明'});
    assert.equal(getTeamComposer(ctx).teamAssetSnapshot.description,'仍在输入页时更新的说明');
  }
}));

test('detached resources stay removed during draft refresh and are restored only by an explicit new use action', () => withDocument(() => {
  for(const type of ['plugin','knowledge']) {
    const state=setup(),item=type==='plugin'?resource(state):addKnowledge(state),ctx=appContext(state);
    openTeamTask(ctx,'product',type,item.id);const draft=getTeamComposer(ctx);draft.draft='保留任务';draft.expert='手动助理';draft.context.push({type:'file',id:'own-file',name:'自己的文件',text:'正文'});
    handleTeamContext('team-task:remove-resource',{dataset:{}},ctx);const detached=clone(draft);
    model.updateTeamResource(state,'product',item.id,{description:'后来修改的资源说明'});
    assert.equal(getTeamComposer(ctx),draft);assert.deepEqual(draft,detached);assert.doesNotMatch(renderTeamTask(ctx),/仍在输入页时更新的说明/);
    openTeamTask(ctx,'product',type,item.id);assert.equal(getTeamComposer(ctx).teamOrigin.resourceId,item.id);assert.equal(draft.draft,'保留任务');assert.equal(draft.expert,'手动助理');assert.ok(draft.context.some(ref=>ref.id==='own-file'));
  }
}));

test('space examples append without losing typed work or adding duplicates, including the expert example shortcut', () => withDocument(() => {
  const state=setup(),{item}=expertResource(state),ctx=appContext(state),count=state.tasks.length;
  openTeamTask(ctx,'product','expert',item.id);const draft=getTeamComposer(ctx),example='整理为本周进展和待办';
  handleTeamContext('team-task:example',{dataset:{prompt:example}},ctx);assert.equal(draft.draft,example);
  draft.draft='项目背景：本周已完成访谈。';draft.context.push({type:'file',id:'original-file',name:'访谈.txt',text:'访谈资料'});
  const attachments=clone(draft.context);handleTeamContext('team-task:example',{dataset:{prompt:example}},ctx);
  assert.equal(draft.draft,'项目背景：本周已完成访谈。\n\n'+example);
  handleTeamContext('team-task:example',{dataset:{prompt:'  '+example+'  '}},ctx);assert.equal(draft.draft,'项目背景：本周已完成访谈。\n\n'+example);
  handleChat('chat:team-example',{dataset:{}},ctx);const once=draft.draft;assert.match(once,/项目背景：本周已完成访谈/);assert.match(once,/核对这份周报的依据/);
  handleChat('chat:team-example',{dataset:{}},ctx);assert.equal(draft.draft,once);assert.deepEqual(draft.context,attachments);assert.equal(state.tasks.length,count);
}));

test('an invalid current expert association blocks its old draft without altering historical task snapshots', () => withDocument(() => {
  const state=setup(),{item}=expertResource(state),knowledge=addKnowledge(state),ctx=wireRealTaskCreation(appContext(state));
  assert.ok(model.authorizeTeamTask(state,optionsFor(state,item,'product',true)).ok);
  openTeamTask(ctx,'product','expert',item.id);const draft=getTeamComposer(ctx);draft.draft='不能丢失的旧草稿';draft.context.push({type:'file',id:'preserved-upload',name:'原输入.txt',text:'保留正文'});
  const history={...newTask('历史助理任务'),...clone(optionsFor(state,item))};state.tasks.push(history);const savedHistory=clone(history),count=state.tasks.length;
  assert.ok(model.updateTeamResource(state,'product',item.id,{knowledgeResourceIds:[knowledge.id]}).resource);
  assert.ok(model.updateTeamResource(state,'product',knowledge.id,{enabled:false}).resource);
  assert.ok(model.validateTeamTask(state,draft),'a stale draft cannot fall back to its still-valid old snapshot');
  handleChat('chat:send',{dataset:{}},ctx);assert.equal(state.tasks.length,count);assert.equal(draft.draft,'不能丢失的旧草稿');assert.ok(draft.context.some(ref=>ref.id==='preserved-upload'));
  assert.ok(ctx.notices.some(text=>/停用|不可用|关联|配置/.test(text)));assert.match(renderTeamTask(ctx),/停用|不可用|关联/);
  assert.equal(model.validateTeamTask(state,history),'');assert.deepEqual(history,savedHistory,'the started task keeps its original valid bindings');
  model.updateTeamResource(state,'product',knowledge.id,{enabled:true});assert.equal(model.validateTeamTask(state,getTeamComposer(ctx)),'');handleChat('chat:send',{dataset:{}},ctx);
  assert.equal(state.tasks.length,count+1);assert.match(ctx.currentTask().context.find(ref=>ref.type==='team-expert-knowledge').text,/数据来源和负责人/);
}));

test('a changed expert configuration during connection confirmation requires review again and grants no silent new consent', () => withDocument(() => {
  const state=setup(),{item,plugin}=expertResource(state),data=resource(state,'plugin','idata'),ctx=wireRealTaskCreation(appContext(state)),count=state.tasks.length;
  openTeamTask(ctx,'product','expert',item.id);getTeamComposer(ctx).draft='按最新关联完成分析';handleChat('chat:send',{dataset:{}},ctx);
  const token=ctx.ui.teamPendingSend.token;assert.match(ctx.ui.modal.body,/飞书/);assert.doesNotMatch(ctx.ui.modal.body,/idata/i);
  model.updateTeamResource(state,'product',item.id,{pluginResourceIds:[plugin.id,data.id]});handleTeamContext('team-task:connect-send',{dataset:{token}},ctx);
  assert.equal(state.tasks.length,count);assert.equal(state.teamSpace.authorizations.me,undefined);assert.equal(ctx.ui.teamPendingSend,undefined);assert.equal(getTeamComposer(ctx).draft,'按最新关联完成分析');
  assert.deepEqual(getTeamComposer(ctx).teamAssetSnapshot.plugins.map(p=>p.id),['lark','idata']);
  handleChat('chat:send',{dataset:{}},ctx);assert.deepEqual(model.teamTaskAccess(state,getTeamComposer(ctx)).missingPlugins.map(p=>p.id),['lark','idata']);assert.match(ctx.ui.modal.body,/飞书/);assert.match(ctx.ui.modal.body,/iData|idata/);
  handleTeamContext('team-task:connect-send',{dataset:{token:ctx.ui.teamPendingSend.token}},ctx);assert.equal(state.tasks.length,count+1);assert.deepEqual(state.teamSpace.authorizations.me,{lark:'demo-authorized',idata:'demo-authorized'});
}));

test('started tasks lose draft-only state and old mislabeled tasks are normalized without losing their original content', () => withDocument(() => {
  const state=setup(),item=addKnowledge(state),ctx=wireRealTaskCreation(appContext(state));openTeamTask(ctx,'product','knowledge',item.id);getTeamComposer(ctx).draft='根据原资料回答';handleChat('chat:send',{dataset:{}},ctx);
  const task=ctx.currentTask(),saved={snapshot:clone(task.teamAssetSnapshot),context:clone(task.context),messages:clone(task.messages)};
  assert.equal(task.isTeamDraft,undefined);assert.equal(task.teamDraftKey,undefined);assert.equal(task.teamDraftError,undefined);
  model.updateTeamResource(state,'product',item.id,{content:'只适用于新任务的新版本'});assert.equal(model.validateTeamTask(state,task),'');assert.deepEqual(task.teamAssetSnapshot,saved.snapshot);assert.deepEqual(task.context,saved.context);
  task.isTeamDraft=true;task.teamDraftKey='legacy-stale-key';task.teamDraftError='过期草稿错误';model.initTeamSpace(state);
  assert.equal(task.isTeamDraft,undefined);assert.equal(task.teamDraftKey,undefined);assert.equal(task.teamDraftError,undefined);assert.deepEqual(task.teamAssetSnapshot,saved.snapshot);assert.deepEqual(task.context,saved.context);assert.deepEqual(task.messages,saved.messages);
}));

test('valid catalog resource field lengths import intact while oversized writes fail atomically and space limits stay unchanged', () => {
  const state=setup(),team=freshTeam(state),expert=addCustomExpert(state);expert.name='专'.repeat(60);expert.description='说'.repeat(500);
  state.workspace.knowledge.local.push({id:'long-library',name:'知'.repeat(80),description:'简'.repeat(160),content:'完整资料正文',enabled:true});
  const expertResult=model.addTeamResource(state,team.id,{type:'expert',sourceId:expert.id}),knowledgeResult=model.addTeamResource(state,team.id,{type:'knowledge',sourceId:'long-library'});
  assert.ok(expertResult.resource,expertResult.error);assert.equal(expertResult.resource.name,expert.name);assert.equal(expertResult.resource.description,expert.description);
  assert.ok(knowledgeResult.resource,knowledgeResult.error);assert.equal(knowledgeResult.resource.name,'知'.repeat(80));
  const item=knowledgeResult.resource;assert.ok(model.updateTeamResource(state,team.id,item.id,{name:'名'.repeat(80),description:'说'.repeat(500)}).resource);const before=clone(item);
  for(const values of [{name:'名'.repeat(81)},{description:'说'.repeat(501)}])assert.ok(model.updateTeamResource(state,team.id,item.id,values).error);
  assert.deepEqual(item,before);assert.ok(model.createTeam(state,{name:'间'.repeat(51)}).error);assert.ok(model.createTeam(state,{name:'空间',description:'说'.repeat(301)}).error);
  const ctx=appContext(state,`team/${team.id}/resources`);handleTeamSpace('team:edit-resource',{dataset:{id:team.id,resource:item.id}},ctx);assert.match(ctx.ui.modal.body,/name="name"[^>]*maxlength="80"/);assert.match(ctx.ui.modal.body,/name="description"[^>]*maxlength="500"/);
  handleTeamSpace('team:create',{dataset:{}},ctx);assert.match(ctx.ui.modal.body,/name="name"[^>]*maxlength="50"/);assert.match(ctx.ui.modal.body,/name="description"[^>]*maxlength="300"/);
});

test('creating or adding a resource clears the prior filter so the newly saved resource is immediately visible', () => {
  const state=setup(),team=freshTeam(state),ctx=appContext(state,`team/${team.id}/resources`);
  handleTeamSpace('team:tab',{dataset:{id:team.id,kind:'knowledge'}},ctx);inputTeamSpace({dataset:{live:'team:search'},value:'会议'},ctx);
  assert.match(renderTeamSpace(ctx),/没有找到相关知识库/);handleTeamSpace('team:new-knowledge',{dataset:{id:team.id}},ctx);assert.match(ctx.ui.modal.body,/name="name"[^>]*maxlength="80"/);
  submitForm('team:create-knowledge',{name:'业务术语',description:'团队统一术语',content:'已完成：满足验收要求。'},ctx,{id:team.id});
  assert.equal(ctx.ui.teamSpace.query,'');assert.equal(ctx.ui.teamSpace.resourceType,'knowledge');assert.match(renderTeamSpace(ctx),/业务术语/);assert.doesNotMatch(renderTeamSpace(ctx),/没有找到相关知识库/);
  inputTeamSpace({dataset:{live:'team:search'},value:'不存在的插件'},ctx);handleTeamSpace('team:add-resource',{dataset:{id:team.id,kind:'plugin',source:'office'}},ctx);
  assert.equal(ctx.ui.teamSpace.query,'');assert.equal(ctx.ui.teamSpace.resourceType,'plugin');assert.match(renderTeamSpace(ctx),/team:use/);
});

test('member search selection must be reviewed again after editing the query and role changes stay permission guarded', () => withDocument(() => {
  const state=setup(),ctx=appContext(state,'team/product/members'),team=model.getTeam(state,'product');
  handleTeamSpace('team:invite',{dataset:{id:team.id}},ctx);assert.match(ctx.ui.modal.body,/搜索成员/);assert.match(ctx.ui.modal.body,/输入姓名、拼音、飞书邮箱/);assert.match(ctx.ui.modal.body,/成员角色/);assert.doesNotMatch(ctx.ui.modal.body,/加入后的角色|本地交互演示/);
  inputTeamSpace({dataset:{live:'team:invite-search',id:team.id},value:'shilitongshic'},ctx);handleTeamSpace('team:select-invitee',{dataset:{id:team.id,email:'colleague-c@example.com'}},ctx);
  assert.equal(ctx.ui.teamSpace.inviteSelectedEmail,'colleague-c@example.com');const previousQuery=ctx.ui.teamSpace.inviteQuery;
  inputTeamSpace({dataset:{live:'team:invite-search',id:team.id},value:'shilitongshid'},ctx);assert.equal(ctx.ui.teamSpace.inviteSelectedEmail,'');const invitations=clone(team.invitations);
  submitForm('team:invite',{memberSearch:previousQuery,role:'admin'},ctx,{id:team.id});assert.deepEqual(team.invitations,invitations);
  handleTeamSpace('team:select-invitee',{dataset:{id:team.id,email:'colleague-d@example.com'}},ctx);submitForm('team:invite',{memberSearch:ctx.ui.teamSpace.inviteQuery,role:'admin'},ctx,{id:team.id});
  assert.equal(team.invitations.at(-1).email,'colleague-d@example.com');assert.equal(team.invitations.at(-1).role,'admin');assert.equal(team.invitations.at(-1).status,'pending');assert.ok(!team.members.some(member=>member.email==='colleague-d@example.com'));
  submitForm('team:member-role',{role:'admin'},ctx,{id:team.id,member:'member-b'});assert.equal(team.members.find(member=>member.id==='member-b').role,'admin');
  state.teamSpace.userId='member-b';assert.equal(model.canManageMembers(state,team.id),true);state.teamSpace.userId='me';submitForm('team:member-role',{role:'member'},ctx,{id:team.id,member:'member-b'});
  state.teamSpace.userId='member-b';const before=clone(team);submitForm('team:member-role',{role:'admin'},ctx,{id:team.id,member:'member-a'});handleTeamSpace('team:invite',{dataset:{id:team.id}},ctx);assert.deepEqual(team,before);
}));
