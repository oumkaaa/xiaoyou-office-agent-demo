// Local demonstration estimates; replace these rules with measured model output
// when a real execution service is connected. Never promise an exact deadline.
export function estimateTaskIntake(prompt,context=[]){
 const text=String(prompt||'').trim(),sources=Array.isArray(context)?context.length:0;
 const research=/深度|全面|深入|调研|研究|竞品|跨系统|多渠道|多份|不同来源/.test(text);
 const analysis=/分析|核对|复盘|数据|指标|归因/.test(text);
 const visual=/PPT|幻灯片|图文|图表|看板|网页|演示文稿/i.test(text);
 const structured=/报告|方案|周报|汇报|文档/.test(text);
 const short=/^(帮我|请)?(润色|翻译|改写|提炼|精简|总结|整理)/.test(text)&&text.length<90&&!research&&!analysis&&!visual;
 const score=Number(research)*2+Number(analysis)+Number(visual)+Number(structured)+Number(sources>=3);
 const level=(short&&sources<3)||score===0?'low':score>=3?'high':'medium';
 const label={low:'较低',medium:'中等',high:'较高'}[level],duration={low:'1–3 分钟',medium:'5–15 分钟',high:'20–40 分钟'}[level];
 const reasons=[research?'多份资料梳理与交叉核对':sources>=3?'多份附件整理':'',analysis?'数据分析与口径检查':'',visual?'图文成果制作':'',structured?'结构化内容整理':''].filter(Boolean);
 const reason=level==='low'?'处理范围比较集中':(reasons.slice(0,3).join('、')||'需要梳理要求并检查交付内容');
 const plan=level==='low'?'我会直接整理一版结果，并保留需要你确认的地方。':level==='medium'?'我会先梳理重点，再整理初稿并检查遗漏。':'我会先核对资料和口径，再分步完成分析与图文初稿，最后统一检查。';
 return {version:1,level,label,duration,reason,simulated:true,message:`收到。这项任务复杂度${label}，${reason}，初步预计需要 ${duration}。\n${plan}有进展或需要补充资料时，我会在这里告诉你。`,delivery:visual?'图文初稿与可编辑成果':structured?'结构化初稿与待确认事项':'整理后的结果'};
}

export function createTaskIntakeMessage(task){
 return {role:'assistant',text:taskIntakeText(task),time:task.createdAt+1,kind:'task-intake'};
}

export function taskIntakeText(task){
 const intake=task.intake||estimateTaskIntake(task.prompt,task.context||[]);
 const expectation=task.office?'确认计划并开始后计时；执行期间可以切换标签页，回来继续查看进展。':'处理期间可以切换标签页，回来继续查看进展。';
 return `${intake.message}\n${expectation}`;
}
