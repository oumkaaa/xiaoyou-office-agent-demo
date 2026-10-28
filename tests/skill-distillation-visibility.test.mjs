import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../frontend/src/core.js';
import {initCatalog} from '../frontend/src/catalog.js';
import {initOffice,seedOfficeTask,event} from '../frontend/src/office-model.js';
import {agentThread,focusAgentTask,switchAgentConversation,syncAgentThreads} from '../frontend/src/agent-conversations.js';
import {renderAgentConversation} from '../frontend/src/conversation-ui.js';
import {renderSkillDistillation,renderSkillLibrarySuggestions,handleSkillDiscovery} from '../frontend/src/skill-discovery-ui.js';
import {distillationCandidate,distillationSpec,saveDistilledSkill} from '../frontend/src/skill-discovery-model.js';

function setup(){
  const state=initialState();initCatalog(state);initOffice(state);state.tasks=[];syncAgentThreads(state);
  const c={state,ui:{route:'agent/personal'},currentTask(){return state.tasks.find(t=>t.id===agentThread(state,'personal').activeTaskId);},save(){},render(){},modal(title,body){this.ui.modal={title,body};}};
  return {state,c,a:state.office.agents.find(a=>a.id==='personal')};
}
function addTask(state,index,{thread='personal',complete=true,delivery=false,group=null}={}){
  const t=seedOfficeTask(newTask('生成经营周报 '+index),'review',{agentId:'personal',conversationId:thread});
  t.createdAt=1000+index;if(group)t.skillDistillationDemoGroup=group;
  if(complete){t.office.phase='complete';t.status='complete';event(t,delivery?'交付已完成':'独立验收','完成记录',delivery?'delivery':'check');t.office.events.at(-1).at=t.createdAt+100;}
  state.tasks.push(t);syncAgentThreads(state);return t;
}
const cards=html=>(html.match(/class="sr-distill"/g)||[]).length;

test('completed work remains eligible after a new active task, without requiring delivery messages',()=>{
  const {state,c}=setup();const completed=[0,1,2].map(i=>addTask(state,i));
  const next=addTask(state,3,{complete:false});focusAgentTask(state,next);
  assert.equal(distillationCandidate(state,completed[2]).count,3);
  const html=renderAgentConversation(c);
  assert.equal(cards(html),1);
  assert.match(html,new RegExp('data-action="skillrec:distill" data-task="'+completed[2].id+'"'));
  assert.ok(html.indexOf('class="sr-distill"')>html.lastIndexOf('class="cv-message d-process-message"'));
});

test('multiple delivery messages produce one tail prompt for the latest completed candidate',()=>{
  const {state,c}=setup();const completed=[0,1,2].map(i=>addTask(state,i,{delivery:true}));
  // A task created earlier but delivered later is the latest completed work.
  completed[0].office.events.at(-1).at=5000;focusAgentTask(state,completed[2]);
  const html=renderAgentConversation(c);
  assert.equal(cards(html),1);
  assert.match(html,new RegExp('data-action="skillrec:distill" data-task="'+completed[0].id+'"'));
  assert.ok(html.indexOf('class="sr-distill"')>html.lastIndexOf('class="d-message-tools"'));
});

test('Agent distillation stays within the displayed conversation and disappears in an empty new thread',()=>{
  const {state,c,a}=setup();const completed=[0,1,2].map(i=>addTask(state,i,{thread:'history'}));
  focusAgentTask(state,completed[2]);assert.equal(cards(renderAgentConversation(c)),1);
  const next=addTask(state,3,{thread:'new-topic',complete:false});focusAgentTask(state,next);
  assert.equal(cards(renderAgentConversation(c)),0);
  assert.equal(renderSkillDistillation(c,a,completed[2]),'');
  switchAgentConversation(state,'personal','history');assert.equal(cards(renderAgentConversation(c)),1);
  assert.equal(renderSkillDistillation(c,{id:'bi'},completed[2]),'');
});

test('a routed task resolves its own displayed thread and fewer than three completions stay silent',()=>{
  const {state,c,a}=setup();const completed=[0,1].map(i=>addTask(state,i,{thread:'history'}));
  focusAgentTask(state,completed[1]);assert.equal(cards(renderAgentConversation(c)),0);
  const third=addTask(state,2,{thread:'history'});const next=addTask(state,3,{thread:'new-topic',complete:false});focusAgentTask(state,next);
  c.ui.route='chat/'+third.id;
  assert.match(renderSkillDistillation(c,a,third),/保存为 Skill/);
  assert.equal(cards(renderAgentConversation(c)),1);
});

test('saving through the tail prompt preserves one linked draft receipt when another task becomes active',()=>{
  const {state,c}=setup();const completed=[0,1,2].map(i=>addTask(state,i,{delivery:true}));
  focusAgentTask(state,completed[2]);
  const saved=saveDistilledSkill(state,completed[2],distillationSpec(completed[2]));
  assert.ok(saved.skill.id);
  const next=addTask(state,3,{complete:false});focusAgentTask(state,next);
  const html=renderAgentConversation(c);
  assert.equal(cards(html),0);assert.equal((html.match(/class="sr-saved-draft"/g)||[]).length,1);
  assert.match(html,new RegExp('data-action="skillrec:draft-detail" data-id="'+saved.skill.id+'"'));
  assert.equal(saveDistilledSkill(state,completed[2],distillationSpec(completed[2])).already,true);
});

test('ordinary completed tasks retain their current-task entry without Agent activation',()=>{
  const {state,c,a}=setup();const completed=[0,1,2].map(i=>{const t=newTask('生成经营周报 '+i);t.status='complete';state.tasks.push(t);return t;});
  c.currentTask=()=>completed[2];
  assert.equal(cards(renderSkillDistillation(c,a,completed[2])),1);
  assert.equal(renderSkillDistillation(c,a,completed[1]),'');
});

test('synthetic repetitions and saved demo drafts are labelled in the conversation and library',()=>{
  const {state,c}=setup();const completed=[0,1,2].map(i=>addTask(state,i,{group:'visibility-demo'}));
  focusAgentTask(state,completed[2]);
  let html=renderAgentConversation(c);assert.match(html,/演示：已完成 3 次同类工作/);assert.match(html,/合成演示记录/);
  const saved=saveDistilledSkill(state,completed[2],distillationSpec(completed[2]));
  assert.ok(saved.skill);saved.skill.demoSource||='visibility-demo';
  html=renderAgentConversation(c);assert.match(html,/演示 Skill 草稿/);assert.match(html,/合成演示记录/);
  assert.match(renderSkillLibrarySuggestions(c),/演示 Skill 草稿/);
  handleSkillDiscovery('skillrec:draft-detail',{dataset:{id:saved.skill.id}},c);
  assert.equal(c.ui.modal.title,'演示 Skill 草稿');assert.match(c.ui.modal.body,/3 次合成演示记录/);
});
