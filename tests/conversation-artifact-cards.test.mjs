import test from 'node:test';
import assert from 'node:assert/strict';
import {artifactMessageAnchors,renderConversationArtifacts} from '../frontend/src/conversation-artifact-cards.js';
import {initialState,newTask} from '../frontend/src/core.js';
import {initCatalog} from '../frontend/src/catalog.js';
import {initOffice,seedOfficeTask,startRun,advance,repair} from '../frontend/src/office-model.js';
import {agentThread,syncAgentThreads} from '../frontend/src/agent-conversations.js';
import {renderAgentConversation} from '../frontend/src/conversation-ui.js';

test('only the latest assistant result receipt per task owns a preview',()=>{
  const messages=[
    {id:'ready-a',taskId:'a',role:'assistant',kind:'approval',eventTitle:'准备操作确认'},
    {id:'done-b',taskId:'b',role:'assistant',kind:'delivery'},
    {id:'done-a',taskId:'a',role:'assistant',kind:'delivery'},
    {id:'ack-a',taskId:'a',role:'assistant',kind:'approval',eventTitle:'已批准本次操作'},
    {id:'user-a',taskId:'a',role:'user',kind:'delivery'},
  ];
  assert.deepEqual([...artifactMessageAnchors(messages)],['done-a','done-b']);
});

test('previews escape content, use actual versions, and do not mutate files',()=>{
  const task={id:'task-a',files:[{id:'task-a-report',type:'doc',name:'<报告>',version:4,content:{title:'<script>alert(1)</script>',pages:[{heading:'结论',paragraphs:['收入增长 9.4% & 待核对']}]}},{id:'task-a-data',type:'sheet',name:'核对表',version:2,content:{sheets:[]}}]};
  const before=JSON.stringify(task),html=renderConversationArtifacts(task);
  assert.equal(JSON.stringify(task),before);
  assert.match(html,/data-action="cv:file" data-task="task-a" data-file="task-a-report"/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/当前版本 v4/);assert.match(html,/9.4% &amp; 待核对/);
  assert.doesNotMatch(html,/<script|<iframe|创建时间|已交付/);
  assert.equal((html.match(/class="db-artifact-card /g)||[]).length,2);
  assert.equal(renderConversationArtifacts({files:[]}), '');
});

test('structured web thumbnails clamp progress and never execute raw HTML',()=>{
  const task={id:'x',files:[{id:'web',name:'网页',type:'html',content:{title:'看板',projects:[{name:'项目',progress:200,status:'待确认',note:'<img src=x onerror=alert(1)>'}]}}]};
  const html=renderConversationArtifacts(task);
  assert.match(html,/width:100%/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html,/<img|<iframe/);
  task.files[0].content='<script>unsafe()</script>';
  assert.doesNotMatch(renderConversationArtifacts(task),/unsafe|<script|db-dashboard-preview/);
});

test('ready work shows one actual result preview while preserving its approval action',()=>{
  const state=initialState();initCatalog(state);initOffice(state);
  const task=seedOfficeTask(newTask('分析经营变化'),'review',{agentId:'personal'});state.tasks.push(task);startRun(task);
  for(let i=0;i<20&&task.office.phase!=='ready';i++){if(task.office.phase==='review')repair(task);else advance(task);}
  assert.equal(task.office.phase,'ready');syncAgentThreads(state);
  const c={state,ui:{route:'chat/'+task.id},currentTask(){return task;}};
  let html=renderAgentConversation(c);
  assert.equal((html.match(/class="db-artifact-cards"/g)||[]).length,1);
  assert.match(html,/核对本次操作/);assert.match(html,/当前版本 v2/);
  assert.equal(task.office.approval.status,'pending');
  const thread=agentThread(state,'personal',task.office.conversationId),receipt=thread.messages.find(m=>m.taskId===task.id&&m.kind==='approval');
  thread.messages.push({...receipt,id:'duplicate-result-reply',key:'duplicate-result-reply',at:receipt.at+10});
  c.ui.lastRoute=c.ui.route;html=renderAgentConversation(c);
  assert.equal((html.match(/class="db-artifact-cards"/g)||[]).length,1);
  assert.equal(task.office.approval.status,'pending');
});
