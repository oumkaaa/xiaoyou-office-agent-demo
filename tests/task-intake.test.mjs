import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateTaskIntake,taskIntakeText} from '../frontend/src/task-intake.js';
import {initialState,newTask,esc,icon} from '../frontend/src/core.js';
import {initCatalog} from '../frontend/src/catalog.js';
import {initOffice,seedOfficeTask} from '../frontend/src/office-model.js';
import {syncAgentThreads,agentThread} from '../frontend/src/agent-conversations.js';
import {registerSkillOffer,distillationCandidate} from '../frontend/src/skill-discovery-model.js';
import {renderConversationSkillOffer,handleSkillDiscovery} from '../frontend/src/skill-discovery-ui.js';

test('task receipts distinguish focused edits, synthesis and complex visual work',()=>{
 assert.equal(estimateTaskIntake('请润色这段通知').level,'low');
 assert.equal(estimateTaskIntake('制作一份汇报 PPT').level,'medium');
 assert.equal(estimateTaskIntake('总结这些资料',[{name:'一'},{name:'二'},{name:'三'}]).level,'medium');
 const high=estimateTaskIntake('深度调研竞品，交叉核对多份数据，分析差异并制作图文报告和 PPT');
 assert.equal(high.level,'high');assert.match(high.message,/预计需要.*20–40 分钟/);assert.match(high.message,/有进展或需要补充资料/);
 assert.equal(high.simulated,true);assert.ok(!high.message.includes('保证'));
 assert.match(taskIntakeText({intake:high,office:{phase:'plan'}}),/确认计划并开始后计时/);
 assert.match(taskIntakeText({intake:high}),/切换标签页/);
});
function setup(){const s=initialState();initCatalog(s);initOffice(s);syncAgentThreads(s);const t=newTask('生成一份汇报 PPT');s.tasks.push(t);registerSkillOffer(s,'personal',t.prompt,t.id);const c={state:s,ui:{route:'chat/'+t.id},esc,icon,currentTask:()=>t,save(){},render(){},go(route){this.ui.route=route;},toast(){},closeModal(){},modal(){}};return {s,t,c};}
test('ordinary file tasks expose Skill recommendations, not only Agent tasks',()=>{
 const {t,c}=setup();assert.equal(t.office,undefined);
 const html=renderConversationSkillOffer(c,{id:'personal'},t);assert.match(html,/Skill 建议/);assert.match(html,/汇报 PPT 制作/);
});
test('accepting a regular-task Skill attaches it to that task without starting another',()=>{
 const {s,t,c}=setup(),count=s.tasks.length;
 handleSkillDiscovery('skillrec:use',{dataset:{id:'discover-slides',task:t.id,agent:'personal',moment:'in_conversation'}},c);
 assert.equal(s.tasks.length,count);assert.ok(t.context.some(r=>r.id==='discover-slides'));assert.equal(c.ui.route,'chat/'+t.id);
 assert.match(renderConversationSkillOffer(c,{id:'personal'},t),/已采用工作方法/);
 assert.ok(!s.tasks[0].context.some(r=>r.id==='discover-slides'));
});
test('completed-task reuse prepares a new conversation instead of changing delivered work',()=>{
 const {s,t,c}=setup();t.status='complete';const before=JSON.stringify(t);
 assert.match(renderConversationSkillOffer(c,{id:'personal'},t),/下次可以复用/);
 handleSkillDiscovery('skillrec:use',{dataset:{id:'discover-slides',task:t.id,agent:'personal'}},c);
 assert.equal(JSON.stringify(t),before);assert.ok(agentThread(s,'personal').draft.includes('PPT'));assert.equal(c.ui.route,'agent/personal');
});
test('three completed regular workflows qualify for distillation, unfinished work does not',()=>{
 const {s,t}=setup();s.tasks=[t];t.status='complete';const b=newTask('制作汇报 PPT'),d=newTask('生成演示文稿');b.status='complete';d.status='running';s.tasks.push(b,d);
 assert.equal(distillationCandidate(s,t),null);d.status='complete';assert.equal(distillationCandidate(s,t).count,3);
});

test('a new task conversation greets first, then receives the goal and task estimate',()=>{
 const s=initialState();initCatalog(s);initOffice(s);
 const t=seedOfficeTask(newTask('分析经营变化并生成图文周报'),'review',{agentId:'personal',conversationId:'intake-order'});
 t.createdAt=1000;s.tasks.push(t);syncAgentThreads(s);
 const messages=s.office.threads['intake-order'].messages;
 assert.deepEqual(messages.slice(0,3).map(m=>m.kind),['welcome','goal','task']);
 assert.match(messages[2].text,/复杂度/);
});
