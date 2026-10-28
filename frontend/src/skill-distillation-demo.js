import {newTask} from './core.js';
import {initOffice,seedOfficeTask,startRun,advance,repair,decide,execute,event} from './office-model.js';
import {syncAgentThreads} from './agent-conversations.js';

const GROUP='repeat-work-v1';
const TOTAL=3;
const HISTORY_VERSION=2;
const HISTORY_KEY=`skill-distillation-demo:${GROUP}:`;
const RECOGNITION_KEY=HISTORY_KEY+'recognition';
const CONVERSATION_TITLE='经营周报 · 重复工作识别示例';

function availableIdentity(state,index,reserved){
  const base=`skill-distillation-demo-${GROUP}-${index}`;
  let id=base,suffix=1;
  while(state.tasks.some(t=>t.id===id)||state.office?.threads?.[`${id}-conversation`]||reserved.has(id))id=`${base}-${++suffix}`;
  reserved.add(id);
  return {id,conversationId:`${id}-conversation`};
}

function completedExample(identity,index){
  const prompt=index===TOTAL?'合成示例 · 第三周：这周继续做经营周报，沿用我们前两次确认的口径和结构。先说结论，再放数据依据和下一步；没有核实的原因请单独标出来。':`合成示例：整理第 ${index} 次经营周报，按统一口径分析经营变化，保留来源并完成交付检查。`;
  const task=newTask(prompt,{origin:'sample'});
  task.id=identity.id;
  task.skillDistillationDemoGroup=GROUP;
  task.skillDistillationDemoIndex=index;
  seedOfficeTask(task,'review',{agentId:'personal',conversationId:identity.conversationId});
  task.title=index===TOTAL?CONVERSATION_TITLE:`经营周报 · 第 ${index} 次合成示例`;
  task.office.scope=`合成示例周期 ${index} · 已完成订单 · 含税金额 · 非真实业务数据`;
  task.office.target=`本地合成示例 / 经营周报 / 第 ${index} 期`;
  task.office.delivery='保存本地合成周报示例';
  task.office.steps.find(s=>s.id==='deliver').title=task.office.delivery;
  event(task,'合成示例说明','此任务、业务数据和交付记录全部用于本地交互演示，不计入真实工作完成次数。','demo');
  startRun(task);
  for(let attempts=0;attempts<20&&task.office.phase!=='ready';attempts++){
    if(task.office.phase==='review')repair(task);
    advance(task);
  }
  // The engine records an approval and a receipt for this synthetic fixture only.
  const approval=task.office.approval;
  if(task.office.phase!=='ready'||!approval||!decide(task,'approve',approval.id)||!execute(task,approval.id))throw new Error('合成周报示例未完成本地交付');
  task.progress=4;

  // Build only this new conversation; do not reconcile or edit existing user threads.
  const scratch={tasks:[task]};
  initOffice(scratch);
  syncAgentThreads(scratch);
  return {task,thread:scratch.office.threads[identity.conversationId]};
}

function addConversationHistory(state,tasks,fresh){
  const task=tasks[TOTAL-1],thread=state.office?.threads?.[task.office?.conversationId];
  if(!thread||thread.skillDistillationDemoHistoryVersion>=HISTORY_VERSION)return;
  if(thread.skillDistillationDemoHistoryVersion>=1){
    const recognition=thread.messages.find(m=>m.key===RECOGNITION_KEY&&m.skillDistillationDemoMessage);
    if(recognition)recognition.kind='skill-recognition';
    thread.skillDistillationDemoHistoryVersion=HISTORY_VERSION;
    return;
  }
  const originalGoal=thread.messages.find(m=>m.key===`task:${task.id}:goal`);
  const originalIntro=thread.messages.find(m=>m.key===`task:${task.id}:intro`);
  const completedAt=Math.max(task.createdAt,...task.office.events.map(e=>e.at))+3;
  const thirdStart=originalGoal?.at||task.createdAt;
  const thirdEnd=Math.max(completedAt,thirdStart+8);
  const day=86400000;
  const records=[
    ['user','第一周，帮我整理一份经营周报。我想先看这周最重要的变化，再看数据和接下来要跟进什么。',0,'chat',1],
    ['assistant','这是一段内置的合成对话示例。我们先把周报口径定下来：按自然周看已完成订单，收入用含税金额。你希望退款单放在核心指标里，还是另外说明？',0,'chat',1],
    ['user','退款单另列，不要混进已完成订单。收入和订单都跟上周同一个成熟窗口比，来源也保留，方便我复核。',0,'chat',1],
    ['assistant','第一周的周报已经整理好了：开头是经营结论，后面是同口径的数据核对表，最后列异常和下一步。退款单单独说明，每个结论都能找到来源。',0,'delivery',1],
    ['user','又到周五了，第二周也做一份经营周报，继续用上次确认的口径。这次渠道变化比较多，帮我多看一眼。',1,'chat',2],
    ['assistant','好，继续按已完成订单、含税收入和同成熟窗口比较。我会把渠道变化单独核对；结论还是放最前面。渠道原因如果资料里没写清，我先留成待确认，可以吗？',1,'chat',2],
    ['user','可以，别替我推测原因。来源和原始口径都放在后面，正文短一点；有异常就直接说清楚影响和谁来确认。',1,'chat',2],
    ['assistant','第二周的报告和核对表也完成了。仍然是“结论—数据依据—异常与下一步”的顺序，渠道原因分成已确认和待核实两类，没有把猜测写成结论。',1,'delivery',2],
    ['user','这个顺序很顺手。以后周报里的指标单位也统一一下，比例变化用百分点，别和增长率混在一起。',1,'chat',2],
    ['assistant','明白：比较范围保持一致，指标单位标清，百分点和增长率分开写。你每次补充的这些要求，我会在下一次周报交付前逐项检查。',1,'chat',2],
    ['user',task.prompt,2,'goal',3],
    ['assistant',originalIntro?.text||task.intake?.message||'好，我会沿用已经确认的口径，核对本期资料并完成周报和交付检查。',2,'task',3],
    ['user','对。还有上周说过的百分点、退款单单列、来源放在后面，都继续保留。我不想每周再解释一次。',2,'chat',3],
    ['assistant','这次已经沿用了这些要求，初稿和数据表也核对过了：指标单位统一，退款单单列，事实和待确认原因分开。交付前我再按我们确认过的清单检查一遍。',2,'chat',3],
    ['user','好，确认。周报就按这个版本交付，后续每周我给你本周资料，你照这个顺序整理就行。',2,'chat',3],
    ['assistant','第三周的周报已完成本地示例交付，报告、核对表和回执都保留在这条工作里。之后每周换成当期资料，具体时间范围和异常仍会重新核对。',2,'delivery',3],
    ['user','这样挺省事的。不过换个对话以后，这些口径和检查步骤也能一起带过去吗？',2,'chat',3],
    ['assistant','我注意到，我们连续三次都确认了同一套做法：已完成订单、含税收入、同成熟窗口比较，先写结论，再放证据和下一步，最后检查来源、单位和待确认项。要不要把这套方法保存成你的专属 Skill？以后换个对话、换一周资料，也能直接复用，你只需要补充本次变化。',2,'skill-recognition',3]
  ];
  const history=records.map(([role,text,period,kind,source],index)=>{
    const key=index===10?`task:${task.id}:goal`:index===11?`task:${task.id}:intro`:index===records.length-1?RECOGNITION_KEY:HISTORY_KEY+`history-${index+1}`;
    const at=period===2?thirdStart+(thirdEnd-thirdStart)*(index-10)/7:task.createdAt-(2-period)*7*day+index;
    return {id:`${task.id}-history-${index+1}`,key,role,text,at,kind,taskId:tasks[source-1].id,conversationId:thread.id,skillDistillationDemoMessage:true,skillDistillationDemoPeriod:source};
  });
  if(fresh){
    // Execution evidence remains in task.office.events; the chat tells the human story.
    for(const e of task.office.events)e.conversationHandled=true;
    thread.messages=history;
  }else{
    // A prior demo may already contain user edits. Add missing keys without replacing them.
    const keys=new Set(thread.messages.map(m=>m.key));
    thread.messages.push(...history.filter(m=>!keys.has(m.key)));
    const welcome=thread.messages.find(m=>m.kind==='welcome'&&m.key===`welcome:${thread.id}`);
    if(welcome&&welcome.at>=history[0].at)welcome.at=history[0].at-1;
    thread.messages.sort((a,b)=>a.at-b.at);
  }
  const recognition=thread.messages.find(m=>m.key===RECOGNITION_KEY&&m.skillDistillationDemoMessage);
  if(recognition)recognition.kind='skill-recognition';
  if(task.title==='经营周报 · 第 3 次合成示例')task.title=CONVERSATION_TITLE;
  if(!thread.customTitle){thread.title=task.title;thread.customTitle=true;}
  thread.skillDistillationDemoHistoryVersion=HISTORY_VERSION;
  thread.skillDistillationDemoRecognitionKey=RECOGNITION_KEY;
  thread.updatedAt=Math.max(thread.updatedAt||0,thirdEnd);
  task.skillDistillationLongConversationExample=true;
}

function ensureConfirmedWorkflow(task){
  if(Object.prototype.hasOwnProperty.call(task,'skillDistillationConfirmedWorkflow'))return;
  task.skillDistillationConfirmedWorkflow={
    version:1,
    confirmed:true,
    source:'内置长对话中三次周报已确认的约定 · 合成示例',
    whenToUse:'每周经营复盘，沿用已确认的周报口径和结构；每次重新确认本期资料、比较窗口与异常。',
    scope:[
      '每次确认【本次时间范围】，按自然周统计已完成订单，收入采用含税收入。',
      '本期与上期采用同成熟窗口比较，先确认资料与指标可比。',
      '退款单单列，不混入已完成订单和核心指标。',
      '比例变化使用百分点；增长率单独列示，百分点不混增长率。'
    ],
    steps:[
      '核对当期经营数据、订单状态、含税收入与比较窗口，先对齐数据口径。',
      '核对渠道变化和异常；区分已确认事实与待核实原因，未确认原因标为待核实，不自行推测。',
      '按“结论—证据—下一步”组织图文周报，正文简短，异常说明影响与待确认负责人。',
      '来源置后：把资料来源和原始口径放在报告后部，保留每个结论对应的可追溯依据。'
    ],
    checks:[
      '交付前检查已完成订单范围、退款单单列和含税收入口径。',
      '检查同成熟窗口、指标单位、百分点与增长率，复算摘要与核对表。',
      '检查结论—证据—下一步结构、来源置后，以及未确认原因的待核实标注。'
    ]
  };
}

export function ensureSkillDistillationDemo(state){
  state.tasks||=[];
  const tasks=Array.from({length:TOTAL},(_,i)=>state.tasks.find(t=>t.skillDistillationDemoGroup===GROUP&&t.skillDistillationDemoIndex===i+1));
  const reserved=new Set(),created=[];
  for(let i=0;i<TOTAL;i++){
    if(tasks[i])continue;
    const example=completedExample(availableIdentity(state,i+1,reserved),i+1);
    tasks[i]=example.task;
    created.push(example);
  }
  if(created.length){
    initOffice(state);
    state.office.threads||={};
    for(const {task,thread} of created)state.office.threads[task.office.conversationId]=thread;
    state.tasks.unshift(...created.map(x=>x.task).reverse());
  }
  addConversationHistory(state,tasks,created.some(x=>x.task===tasks[TOTAL-1]));
  ensureConfirmedWorkflow(tasks[TOTAL-1]);
  return {task:tasks[TOTAL-1],tasks,created:created.length>0};
}
