import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,newTask} from '../frontend/src/core.js';
import {initCatalog} from '../frontend/src/catalog.js';
import {initOffice,seedOfficeTask} from '../frontend/src/office-model.js';
import {syncAgentThreads,focusAgentTask,agentThread} from '../frontend/src/agent-conversations.js';
import {distillationCandidate,distillationSpec,saveDistilledSkill} from '../frontend/src/skill-discovery-model.js';
import {renderSkillDistillation} from '../frontend/src/skill-discovery-ui.js';
import {ensureSkillDistillationDemo} from '../frontend/src/skill-distillation-demo.js';

function setup(){const state=initialState();initCatalog(state);initOffice(state);syncAgentThreads(state);return state;}

test('repeat-work demo runs three distinct synthetic workflows through checked local delivery',()=>{
  const state=setup(),{task,tasks,created}=ensureSkillDistillationDemo(state);
  assert.equal(created,true);
  assert.equal(tasks.length,3);
  assert.equal(task,tasks[2]);
  assert.equal(new Set(tasks.map(t=>t.id)).size,3);
  assert.equal(new Set(tasks.map(t=>t.office.conversationId)).size,3);
  for(const [index,t] of tasks.entries()){
    assert.equal(t.skillDistillationDemoGroup,'repeat-work-v1');
    assert.equal(t.skillDistillationDemoIndex,index+1);
    assert.match(t.title,/示例/);
    assert.match(t.prompt,/合成示例.*经营周报/);
    assert.equal(t.status,'complete');
    assert.equal(t.office.phase,'complete');
    assert.equal(t.office.quality,'passed');
    assert.equal(t.office.selfCheck.passed,true);
    assert.ok(t.office.steps.every(s=>s.status==='complete'));
    assert.ok(t.files.some(f=>f.type==='doc'));
    assert.ok(t.files.some(f=>f.type==='sheet'));
    assert.equal(t.office.receipts.length,1);
    assert.match(t.office.receipts[0].status,/本地模拟/);
    assert.equal(t.office.approval.status,'executed');
    assert.ok(t.office.events.some(e=>e.kind==='delivery'));
    const thread=state.office.threads[t.office.conversationId];
    assert.equal(thread.activeTaskId,t.id);
    assert.ok(thread.messages.some(m=>m.kind==='delivery'&&m.taskId===t.id));
  }
  focusAgentTask(state,task);
  const c={state,currentTask:()=>task};
  assert.match(renderSkillDistillation(c,{id:'personal'},task),/保存为 Skill/);
  assert.equal(distillationCandidate(state,task).count,3);
});

test('the third example opens a natural multi-week conversation ending in a proactive Skill suggestion',()=>{
  const state=setup(),{task,tasks}=ensureSkillDistillationDemo(state);
  const thread=state.office.threads[task.office.conversationId],messages=thread.messages;
  assert.equal(task.title,'经营周报 · 重复工作识别示例');
  assert.equal(task.skillDistillationLongConversationExample,true);
  assert.equal(thread.title,task.title);
  assert.equal(messages.length,18);
  assert.deepEqual(messages.map(m=>m.role),Array.from({length:18},(_,i)=>i%2?'assistant':'user'));
  assert.deepEqual(messages.filter(m=>m.kind==='delivery').map(m=>m.taskId),tasks.map(t=>t.id));
  assert.equal(messages.filter(m=>m.text.includes('内置的合成对话示例')).length,1);
  assert.ok(messages[0].at<messages[4].at&&messages[4].at<messages[10].at);
  assert.match(messages.map(m=>m.text).join('\n'),/退款单单列/);
  assert.match(messages.map(m=>m.text).join('\n'),/百分点/);
  assert.match(messages.at(-1).text,/我注意到.*连续三次.*确认了同一套做法/);
  assert.match(messages.at(-1).text,/要不要.*保存成你的专属 Skill/);
  assert.equal(messages.at(-1).key,'skill-distillation-demo:repeat-work-v1:recognition');
  assert.equal(messages.at(-1).kind,'skill-recognition');
  assert.equal(thread.skillDistillationDemoRecognitionKey,messages.at(-1).key);
  assert.equal(thread.skillDistillationDemoHistoryVersion,2);
  const keys=messages.map(m=>m.key);
  syncAgentThreads(state);
  assert.deepEqual(thread.messages.map(m=>m.key),keys);
  assert.equal(new Set(thread.messages.map(m=>m.key)).size,messages.length);
});

test('v1 recognition metadata migrates without changing edited text, other messages or drafts',()=>{
  const state=setup(),{task}=ensureSkillDistillationDemo(state),thread=state.office.threads[task.office.conversationId];
  const recognition=thread.messages.at(-1);
  recognition.kind='delivery';recognition.text='用户后来修改过的识别建议，原样保留。';
  thread.skillDistillationDemoHistoryVersion=1;
  thread.draft='尚未发送的草稿';task.draft='任务中的草稿';
  const before=structuredClone(state);
  const result=ensureSkillDistillationDemo(state);
  assert.equal(result.created,false);
  assert.equal(recognition.kind,'skill-recognition');
  assert.equal(recognition.text,'用户后来修改过的识别建议，原样保留。');
  const expected=before.office.threads[thread.id];
  expected.skillDistillationDemoHistoryVersion=2;
  expected.messages.find(m=>m.key===recognition.key).kind='skill-recognition';
  assert.deepEqual(state,before);
  assert.equal(thread.messages.filter(m=>m.kind==='delivery').length,3);
});

test('recognition migration only changes marked built-in messages',()=>{
  const state=setup(),{task}=ensureSkillDistillationDemo(state),thread=state.office.threads[task.office.conversationId];
  const recognition=thread.messages.at(-1);
  recognition.kind='delivery';delete recognition.skillDistillationDemoMessage;
  thread.skillDistillationDemoHistoryVersion=1;
  ensureSkillDistillationDemo(state);
  assert.equal(recognition.kind,'delivery');
  assert.equal(thread.skillDistillationDemoHistoryVersion,2);
});

test('legacy demo histories upgrade once without replacing user edits, names, drafts or saved Skill',()=>{
  const state=setup(),{task}=ensureSkillDistillationDemo(state),thread=state.office.threads[task.office.conversationId];
  const originalIntro=thread.messages.find(m=>m.key===`task:${task.id}:intro`);
  const original=[
    {id:'old-welcome',key:`welcome:${thread.id}`,role:'assistant',text:'原先的欢迎语',kind:'welcome',at:task.createdAt-1},
    {id:'old-goal',key:`task:${task.id}:goal`,role:'user',text:'我后来改过的周报要求',kind:'goal',at:task.createdAt,taskId:task.id},
    {...originalIntro,id:'old-intro',text:'我后来编辑过的助理说明'},
    {id:'old-delivery',key:'old-delivery',role:'assistant',text:'之前的示例交付说明',kind:'delivery',at:task.createdAt+1,taskId:task.id},
    {id:'user-followup',key:'user-followup',role:'user',text:'我后续补充的要求，请保留。',at:Date.now()+10000,taskId:task.id}
  ];
  thread.messages=original;
  thread.title='我改过的会话标题';thread.customTitle=true;thread.draft='还没发送的输入';task.title='我改过的任务标题';task.draft='任务草稿';
  delete thread.skillDistillationDemoHistoryVersion;
  delete thread.skillDistillationDemoRecognitionKey;
  delete task.skillDistillationLongConversationExample;
  const saved=saveDistilledSkill(state,task,distillationSpec(task)),skillBefore=JSON.stringify(saved.skill);
  const result=ensureSkillDistillationDemo(state);
  assert.equal(result.created,false);
  for(const message of original)assert.equal(thread.messages.find(m=>m.id===message.id),message);
  assert.equal(thread.messages.find(m=>m.id==='old-goal').text,'我后来改过的周报要求');
  assert.equal(thread.messages.find(m=>m.id==='old-intro').text,'我后来编辑过的助理说明');
  assert.equal(thread.messages.at(-1).id,'user-followup');
  assert.ok(thread.messages[0].kind==='welcome');
  assert.equal(thread.title,'我改过的会话标题');assert.equal(task.title,'我改过的任务标题');
  assert.equal(thread.draft,'还没发送的输入');assert.equal(task.draft,'任务草稿');
  assert.equal(JSON.stringify(saved.skill),skillBefore);
  assert.equal(task.skillDistillationLongConversationExample,true);
  assert.equal(thread.messages.filter(m=>m.key===thread.skillDistillationDemoRecognitionKey).length,1);
  const before=JSON.stringify(state);
  ensureSkillDistillationDemo(state);
  assert.equal(JSON.stringify(state),before);
});

test('opening the demo preserves user work and its current conversation',()=>{
  const state=setup(),user=seedOfficeTask(newTask('分析我的经营周报'),'review',{conversationId:'my-existing-thread'});
  state.tasks.push(user);syncAgentThreads(state);focusAgentTask(state,user);
  agentThread(state,'personal').draft='尚未发送的真实要求';
  const oldTasks=state.tasks.map(t=>[t,JSON.stringify(t)]),oldThreads=JSON.stringify(state.office.threads),active=JSON.stringify(state.office.activeConversations);
  ensureSkillDistillationDemo(state);
  for(const [t,before] of oldTasks)assert.equal(JSON.stringify(t),before);
  const preserved=JSON.parse(oldThreads);
  for(const [id,thread] of Object.entries(preserved))assert.deepEqual(state.office.threads[id],thread);
  assert.equal(JSON.stringify(state.office.activeConversations),active);
});

test('a second entry reuses records and preserves edits, state, drafts and saved Skill',()=>{
  const state=setup(),first=ensureSkillDistillationDemo(state);
  first.task.draft='用户补充内容';
  state.office.threads[first.task.office.conversationId].draft='会话中未发送的输入';
  const saved=saveDistilledSkill(state,first.task,distillationSpec(first.task));
  assert.ok(saved.skill);
  first.task.office.phase='paused';
  const before=JSON.stringify(state),second=ensureSkillDistillationDemo(state);
  assert.equal(second.created,false);
  assert.equal(second.task,first.task);
  assert.ok(second.tasks.every((t,i)=>t===first.tasks[i]));
  assert.equal(JSON.stringify(state),before);
  assert.equal(state.catalog.skills.find(s=>s.id===saved.skill.id),saved.skill);
});

test('real work and separate synthetic groups never contribute to one another',()=>{
  const state=setup(),{task,tasks}=ensureSkillDistillationDemo(state);
  const real=Array.from({length:3},()=>{const t=newTask('整理经营周报');t.status='complete';return t;});
  const other=tasks.map((t,i)=>({...structuredClone(t),id:`another-synthetic-${i}`,skillDistillationDemoGroup:'another-demo'}));
  state.tasks.push(...real,...other);
  assert.equal(distillationCandidate(state,task).count,3);
  assert.equal(distillationCandidate(state,real[0]).count,3);
  assert.equal(distillationCandidate(state,other[0]).count,3);
  assert.equal(distillationCandidate(state,task).key,'demo:repeat-work-v1:weekly');
  assert.equal(distillationCandidate(state,real[0]).key,'user:weekly');
  assert.equal(distillationCandidate(state,other[0]).key,'demo:another-demo:weekly');
});

test('a reserved demo id or conversation collision never overwrites another record',()=>{
  const state=setup(),id='skill-distillation-demo-repeat-work-v1-1';
  const user=newTask('保留这个用户任务');user.id=id;state.tasks.push(user);
  const occupied='skill-distillation-demo-repeat-work-v1-2-conversation';
  state.office.threads[occupied]={id:occupied,draft:'保留这段输入'};
  const before=JSON.stringify(user),threadBefore=JSON.stringify(state.office.threads[occupied]);
  const first=ensureSkillDistillationDemo(state);
  assert.notEqual(first.tasks[0].id,id);
  assert.notEqual(first.tasks[1].office.conversationId,occupied);
  assert.equal(JSON.stringify(user),before);
  assert.equal(JSON.stringify(state.office.threads[occupied]),threadBefore);
  assert.equal(ensureSkillDistillationDemo(state).created,false);
});


test('default long-conversation Skill draft contains its explicit confirmed rules',()=>{
  const state=setup(),{task,tasks}=ensureSkillDistillationDemo(state),snapshot=task.skillDistillationConfirmedWorkflow;
  assert.equal(snapshot.confirmed,true);
  assert.ok(tasks.slice(0,2).every(t=>!Object.hasOwn(t,'skillDistillationConfirmedWorkflow')));
  const spec=distillationSpec(task);
  for(const term of ['已完成订单','含税收入','同成熟窗口','退款单单列','百分点不混增长率','结论—证据—下一步','来源置后','待核实','交付前检查'])assert.ok(spec.content.includes(term),term+' must survive into the editable draft');
  assert.ok(spec.content.includes('【本次时间范围】'));
  assert.ok(!spec.content.includes('合成示例周期 3'));
  assert.ok(!spec.content.includes('第三周'));
});

test('ordinary work keeps the existing fallback and does not infer rules from unconfirmed chat',()=>{
  const state=setup(),task=seedOfficeTask(newTask('整理我的经营周报'),'review');
  state.tasks.push(task);syncAgentThreads(state);
  state.office.threads[task.office.conversationId].messages.push({id:'unconfirmed-refund',role:'user',text:'退款单也许可以单列，先不要确定。',at:Date.now()});
  const spec=distillationSpec(task);
  assert.ok(spec.content.includes(task.prompt));assert.ok(spec.content.includes('研究资料与变化线索'));
  assert.ok(!spec.content.includes('退款单单列'));
  task.skillDistillationConfirmedWorkflow={confirmed:false,whenToUse:'不可使用的未确认草稿',scope:['退款单单列'],steps:['未确认步骤'],checks:['未确认检查']};
  assert.equal(distillationSpec(task).content,spec.content);
});

test('demo initialization preserves an edited confirmed-workflow snapshot exactly',()=>{
  const state=setup(),{task}=ensureSkillDistillationDemo(state);
  task.skillDistillationConfirmedWorkflow.scope[0]='人工确认的新范围：只看本期直营渠道。';
  task.skillDistillationConfirmedWorkflow.steps.push('我补充的交付步骤。');
  const before=JSON.stringify(state),snapshot=task.skillDistillationConfirmedWorkflow;
  ensureSkillDistillationDemo(state);
  assert.equal(task.skillDistillationConfirmedWorkflow,snapshot);assert.equal(JSON.stringify(state),before);
  assert.ok(distillationSpec(task).content.includes('人工确认的新范围：只看本期直营渠道。'));
  assert.ok(distillationSpec(task).content.includes('我补充的交付步骤。'));
});

test('adding the confirmed snapshot to a legacy demo never rewrites a saved Skill',()=>{
  const state=setup(),{task}=ensureSkillDistillationDemo(state);
  delete task.skillDistillationConfirmedWorkflow;
  const saved=saveDistilledSkill(state,task,distillationSpec(task)),before=JSON.stringify(saved.skill);
  ensureSkillDistillationDemo(state);
  assert.equal(task.skillDistillationConfirmedWorkflow.confirmed,true);
  assert.equal(JSON.stringify(saved.skill),before);
  const repeated=saveDistilledSkill(state,task,distillationSpec(task));
  assert.equal(repeated.already,true);assert.equal(repeated.skill,saved.skill);
  assert.equal(JSON.stringify(saved.skill),before);
  const after=JSON.stringify(state);ensureSkillDistillationDemo(state);assert.equal(JSON.stringify(state),after);
});
