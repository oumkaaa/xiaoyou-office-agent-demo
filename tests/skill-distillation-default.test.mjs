import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../frontend/src/core.js';
import {initCatalog} from '../frontend/src/catalog.js';
import {initOffice,seedOfficeTask} from '../frontend/src/office-model.js';
import {agentThread,syncAgentThreads} from '../frontend/src/agent-conversations.js';
import {renderAgentConversation} from '../frontend/src/conversation-ui.js';

function setup({long=true,count=3}={}){
  const state=initialState();initCatalog(state);initOffice(state);state.tasks=[];
  for(let i=0;i<count;i++){
    const t=seedOfficeTask(newTask('生成经营周报 '+i),'review',{agentId:'personal',conversationId:'repeat-thread'});
    t.createdAt=1000+i;t.status='complete';t.office.phase='complete';t.skillDistillationDemoGroup='default-visibility';state.tasks.push(t);
  }
  const task=state.tasks.at(-1);if(long)task.skillDistillationLongConversationExample=true;
  syncAgentThreads(state);
  const c={state,ui:{route:'chat/'+task.id,lastRoute:'home',cvScrollBottom:false},currentTask(){return task;}};
  return {state,c,task};
}

test('opening the long conversation shows all messages at the tail without a task-goal anchor',()=>{
  const {state,c}=setup();const thread=agentThread(state,'personal','repeat-thread');
  for(let i=0;i<30;i++)thread.messages.push({id:'history-'+i,role:'assistant',text:'历史讨论 '+i,at:500+i,conversationId:thread.id});
  const html=renderAgentConversation(c);
  assert.equal(c.ui.cvAllMessages,true);assert.equal(c.ui.cvScrollBottom,true);assert.equal(c.ui.cvScrollTask,null);
  assert.match(html,/历史讨论 0/);assert.match(html,/历史讨论 29/);
  assert.equal((html.match(/class="sr-distill(?: sr-conversation-method)?"/g)||[]).length,1);
});

test('ordinary real conversation routing retains its task-goal positioning',()=>{
  const {c,task}=setup({long:false});delete task.skillDistillationDemoGroup;
  renderAgentConversation(c);
  assert.equal(c.ui.cvScrollTask,task.id);assert.equal(c.ui.cvScrollBottom,false);
});

test('rerendering the already open example does not force another bottom scroll',()=>{
  const {c}=setup();renderAgentConversation(c);
  c.ui.lastRoute=c.ui.route;c.ui.cvScrollBottom=false;c.ui.cvScrollTask=null;
  renderAgentConversation(c);
  assert.equal(c.ui.cvScrollBottom,false);assert.equal(c.ui.cvScrollTask,null);
});

test('long conversation recommends its reusable process and keeps the example count secondary',()=>{
  const {c}=setup({count:4});const html=renderAgentConversation(c);
  assert.match(html,/<strong>发现可以复用的工作方法<\/strong>/);
  assert.match(html,/统一口径 → 核对异常 → 图文周报/);
  assert.match(html,/<small class="sr-sample-note">内置对话示例 · 已识别 4 次重复工作<\/small>/);
  assert.match(html,/>保存为 Skill<\/button>/);
  assert.doesNotMatch(html,/<strong>演示：已完成/);
});

test('the built-in example still requires three completed equivalent workflows',()=>{
  const {c}=setup({count:2});const html=renderAgentConversation(c);
  assert.doesNotMatch(html,/发现可以复用的工作方法/);
  assert.doesNotMatch(html,/class="sr-distill"/);
});


test('first direct visit to the long example defaults to a collapsed summary',()=>{
  const {c}=setup();const html=renderAgentConversation(c);
  assert.equal(c.ui.cvPanelOwner,'personal');assert.equal(c.ui.cvPanelMode,'summary');assert.equal(c.ui.conversationPanelOpen,false);
  assert.match(html,/cv-panel-hidden/);assert.doesNotMatch(html,/class="cv-workpanel cv-summary-panel"/);
});

test('ordinary conversation keeps its default summary open',()=>{
  const {c}=setup({long:false});const html=renderAgentConversation(c);
  assert.equal(c.ui.cvPanelMode,'summary');assert.equal(c.ui.conversationPanelOpen,true);
  assert.match(html,/class="cv-workpanel cv-summary-panel"/);
});

test('example rerenders preserve the summary the user deliberately opened',()=>{
  const {c}=setup();renderAgentConversation(c);
  c.ui.lastRoute=c.ui.route;c.ui.conversationPanelOpen=true;c.ui.cvPanelMode='summary';
  const html=renderAgentConversation(c);
  assert.equal(c.ui.conversationPanelOpen,true);assert.match(html,/class="cv-workpanel cv-summary-panel"/);
});

test('a restored example page retains its captured panel state',()=>{
  const {c}=setup();
  c.ui.pageViews={[c.ui.route]:{agentId:'personal',panelMode:'work',panelOpen:true}};
  // app.js restores these values before rendering the conversation.
  c.ui.cvPanelOwner='personal';c.ui.cvPanelMode='work';c.ui.conversationPanelOpen=true;
  renderAgentConversation(c);
  assert.equal(c.ui.cvPanelMode,'work');assert.equal(c.ui.conversationPanelOpen,true);
});
