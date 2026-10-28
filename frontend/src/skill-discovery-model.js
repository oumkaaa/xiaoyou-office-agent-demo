import {uid} from './core.js';

// Curated, synthetic examples. Counts and matching rules are prototype data.
export const DISCOVERY_SKILLS=[
  {id:'discover-weekly',name:'经营复盘周报',scene:'weekly',icon:'chart',tone:'blue',calls:4823,publisher:'经营协作团队',description:'财务周口径、异常标注与周报模板，一次准备好。',reason:'内置指标口径与周报模板，省去每次重新说明。',prompt:'分析上周经营变化，按统一口径生成周报，标注异常并保留来源。',strong:/周报|经营复盘|销售趋势|经营变化|运营数据|销售报表/,weak:/经营|销售|复盘|数据趋势/,inputs:'经营数据、指标定义与本周变化',output:'经营结论 → 指标与口径 → 异常及下一步',example:['核心变化：已完成订单较上周增长 9.4%。','口径：按自然周、已完成订单与含税金额统计。','异常：渠道 B 收入下降，保留为待核实项。'],method:'1. 核对数据来源、财务周与订单状态。\n2. 复算核心变化，区分事实与推断。\n3. 按模板生成周报，标注异常与缺失项。\n4. 引用来源，写回前由用户确认。'},
  {id:'discover-slides',name:'汇报 PPT 制作',scene:'slides',icon:'panel',tone:'amber',calls:3610,publisher:'内容体验团队',description:'从汇报结论组织叙事，按模板生成可编辑页面。',reason:'先组织汇报故事，再统一页面结构与视觉规范。',prompt:'把项目复盘整理成一份汇报 PPT，先给出叙事结构，再生成可编辑页面。',strong:/PPT|幻灯片|演示文稿|汇报材料/i,weak:/汇报|展示方案/,inputs:'报告、数据图表与目标听众',output:'结论页 → 证据页 → 行动页',example:['01 先给结论：本周最值得关注的三个变化。','02 用证据展开：指标图表保留来源和单位。','03 落到行动：列出责任人和待确认事项。'],method:'1. 确认听众、目的和核心结论。\n2. 先列叙事结构，逐页只保留一个主判断。\n3. 使用统一版式，图表标明单位与来源。\n4. 检查排版和可编辑性，交付前自核。'},
  {id:'discover-meetings',name:'会议知识沉淀',scene:'meeting',icon:'book',tone:'violet',calls:1770,publisher:'知识协作团队',description:'把会议纪要变成决策、待办和可追溯的知识。',reason:'按决策、待办、未决问题整理，并保留原始来源。',prompt:'整理这次会议纪要，提取已确认决定、待办与责任人，保留来源，写入前让我确认。',strong:/会议纪要|会议总结|会议记录|会议.*待办|会议.*沉淀|整理.*会议/,weak:/会议|沟通记录|讨论结论/,inputs:'飞书纪要、聊天摘录或转写文本',output:'已确认决定 → 待办责任人 → 未决问题',example:['已确认决定：复核结果保留人工确认。','待办：林沐补充异常样例，周五前评审。','未决问题：数据更新频率待技术确认。'],method:'1. 读取用户提供或获准访问的会议资料。\n2. 区分已确认决定、提议与未决问题。\n3. 提取待办、责任人和时间，缺失信息不补写。\n4. 结果附来源；写入知识库前确认内容。'},
  {id:'discover-risk',name:'项目风险清单',scene:'risk',icon:'shield',tone:'teal',calls:0,publisher:'项目协作团队',description:'按影响、证据与负责人整理项目风险。',reason:'把风险、假设和待确认事项分开列清。',prompt:'根据项目资料整理风险清单，列出证据、影响、负责人和待确认项。',strong:/风险清单|项目风险|风险评审/,weak:/项目进展|项目计划/,inputs:'项目资料与已确认决定',output:'风险 → 证据 → 影响 → 负责人',example:['风险：上游数据延迟，影响周报时效。','证据：最近两次更新晚于约定时间。','下一步：由示例负责人确认更新承诺。'],method:'1. 对齐项目目标和已确认决定。\n2. 按事实识别风险，不将假设写成结论。\n3. 列出影响、负责人和下一步验证。\n4. 提交评审前保留人工确认。'}
];
export const discoverySkill=id=>DISCOVERY_SKILLS.find(s=>s.id===id);
export function initSkillDiscovery(state){return state.skillDiscovery||={version:1,offers:{},dismissed:{},distilled:{},distillDismissed:{},events:[]};}
const log=(state,type,details,now=Date.now())=>{const d=initSkillDiscovery(state);d.events.push({id:uid('skill-event'),type,...details,at:now});if(d.events.length>300)d.events.splice(0,d.events.length-300);};
export const installedSkill=(state,id)=>state.catalog?.skills?.find(s=>s.id===id);
export function matchDiscoverySkill(state,text,now=Date.now()){
  const d=initSkillDiscovery(state);
  const candidates=DISCOVERY_SKILLS.filter(s=>!installedSkill(state,s.id)&&!(d.dismissed[s.id]>now)).map(s=>({skill:s,tier:s.strong.test(text)?'high':s.weak.test(text)?'medium':null})).filter(x=>x.tier);
  return candidates.sort((a,b)=>(a.tier==='high'?0:1)-(b.tier==='high'?0:1)||b.skill.calls-a.skill.calls)[0]||null;
}
export function registerSkillOffer(state,agentId,text,taskId,now=Date.now()){
  if(!taskId)return null;const d=initSkillDiscovery(state);if(d.offers[taskId])return d.offers[taskId];
  const hit=matchDiscoverySkill(state,text,now);if(!hit)return null;
  const offer={skillId:hit.skill.id,agentId,taskId,tier:hit.tier,status:'pending',reason:hit.skill.reason,at:now};d.offers[taskId]=offer;
  log(state,'recommended',{moment:'in_conversation',skillId:hit.skill.id,taskId,tier:hit.tier,matchedBy:'prototype-rules',executionOutcome:null},now);return offer;
}
export function dismissSkillOffer(state,taskId,now=Date.now()){
  const d=initSkillDiscovery(state),o=d.offers[taskId];if(!o||o.status!=='pending')return false;
  o.status='ignored';d.dismissed[o.skillId]=now+24*60*60*1000;log(state,'ignored',{skillId:o.skillId,taskId},now);return true;
}
export function installDiscoverySkill(state,id,{moment='entry',taskId=null}={}){
  const skill=discoverySkill(id);if(!skill)return {error:'这个技能不在当前可用目录中'};
  if(installedSkill(state,id))return {skill:installedSkill(state,id),already:true};
  state.catalog||={};state.catalog.skills||=[];
  const installed={id:skill.id,name:skill.name,description:skill.description,scope:'全局',content:`## 适用场景\n${skill.inputs}\n\n## 工作方法\n${skill.method}\n\n## 结果\n${skill.output}`,enabled:true,installed:true,custom:false,source:'企业技能市场 · 示例',publisher:skill.publisher,version:'v1',callCount:skill.calls};
  state.catalog.skills.push(installed);const offer=initSkillDiscovery(state).offers[taskId];if(offer?.skillId===id)offer.status='adopted';
  log(state,'adopted',{moment,skillId:id,taskId,executionOutcome:null});return {skill:installed,already:false};
}
export function recordSkillDetail(state,id,moment){if(discoverySkill(id))log(state,'detail_viewed',{skillId:id,moment});}
const workflow=t=>DISCOVERY_SKILLS.find(s=>s.strong.test(t.prompt||''))?.scene||t.office?.scenario;
export function distillationCandidate(state,t,now=Date.now()){
  if(!t||(t.office?t.office.phase!=='complete':t.status!=='complete'))return null;const d=initSkillDiscovery(state),scene=workflow(t),demoGroup=t.skillDistillationDemoGroup||'',key=demoGroup?'demo:'+demoGroup+':'+scene:'user:'+scene;if(!scene)return null;
  // Synthetic demonstration records never increase a user's completion count.
  const peers=state.tasks.filter(x=>(x.office?x.office.phase==='complete':x.status==='complete')&&workflow(x)===scene&&(x.skillDistillationDemoGroup||'')===demoGroup);
  if(peers.length<3||d.distillDismissed[key]>now)return null;
  return {key,scene,count:peers.length,taskIds:peers.map(x=>x.id),savedId:d.distilled[key]||null};
}
export function distillationSpec(t){
  const title=({weekly:'经营复盘周报',slides:'汇报 PPT 制作',meeting:'会议知识沉淀',review:'经营复盘周报',proposal:'项目评审准备',reconcile:'订单异常复核',builder:'业务助手试跑'})[workflow(t)]||'我的工作流程';
  const confirmed=t.skillDistillationConfirmedWorkflow,lines=value=>Array.isArray(value)?value.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()):[];
  if(confirmed?.confirmed===true&&typeof confirmed.whenToUse==='string'&&confirmed.whenToUse.trim()){
    const scope=lines(confirmed.scope),steps=lines(confirmed.steps),checks=lines(confirmed.checks);
    if(scope.length&&steps.length&&checks.length)return {name:'我的'+title,description:'复用已确认的资料口径、处理步骤与交付检查。',content:`## 什么时候使用\n${confirmed.whenToUse.trim()}\n\n## 所需资料与口径\n${scope.map(x=>'- '+x).join('\n')}\n每次重新确认本次时间范围，不固化历史示例周期。\n\n## 工作方法\n${steps.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\n## 交付前检查\n${checks.map(x=>'- '+x).join('\n')}\n\n## 人工确认\n发送、写回和发布前，列出对象、内容与版本，由用户按次确认。`};
  }
  const scope=(t.office?.scope||'按本次任务确认资料与时间范围').replace(/\d{4}-\d{2}-\d{2}\s*(?:至|—|~|到)\s*(?:\d{4}-)?\d{2}-\d{2}/g,'【本次时间范围】');
  return {name:'我的'+title,description:'复用已确认的资料口径、处理步骤与交付检查。',content:`## 什么时候使用\n${t.prompt}\n\n## 所需资料与口径\n${scope}\n每次重新确认本次时间范围，不固化历史示例周期。\n\n## 工作方法\n${(t.office?.steps||[{id:'prepare',title:'梳理资料',output:'确认输入与口径'},{id:'produce',title:'整理成果',output:'按工作方法生成初稿'}]).filter(s=>!['check','lead','deliver'].includes(s.id)).map((s,i)=>`${i+1}. ${s.title}：${s.output}`).join('\n')}\n\n## 交付前检查\n核对事实、来源、指标计算和输出要求；Lead 交付前自核。\n\n## 人工确认\n发送、写回和发布前，列出对象、内容与版本，由用户按次确认。`};
}
export function saveDistilledSkill(state,t,values){
  const candidate=distillationCandidate(state,t);if(!candidate)return {error:'需要至少三次已完成的同类工作'};
  if(!values.name?.trim()||!values.description?.trim()||!values.content?.trim())return {error:'请补全名称、简介和工作方法'};
  const d=initSkillDiscovery(state),existing=(state.catalog.skills||[]).find(s=>s.id===candidate.savedId);
  if(existing)return {skill:existing,already:true};
  const skill={id:uid('distilled-skill'),name:values.name.trim(),description:values.description.trim(),content:values.content.trim(),scope:'全局',enabled:false,installed:true,custom:true,reviewStatus:'pending',visibility:'private',source:t.skillDistillationDemoGroup?'从合成示例工作沉淀':'从已完成工作沉淀',demoSource:!!t.skillDistillationDemoGroup,sourceTaskIds:candidate.taskIds,version:'v1'};
  state.catalog.skills.push(skill);d.distilled[candidate.key]=skill.id;log(state,'distilled',{moment:'after_completion',skillId:skill.id,sourceTaskIds:candidate.taskIds,reviewStatus:'pending'});return {skill,already:false};
}
