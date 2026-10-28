import test from 'node:test';
import assert from 'node:assert/strict';
import {initSidebarLayout,pinDefaultSkillExample,addNavigationProject,moveConversation,toggleConversationPin,projectTasks,draftProject,assignDraftProject,renderFunctionRail} from '../frontend/src/sidebar-layout.js';

const setup=()=>({tasks:[{id:'a',title:'自己的会话',project:'legacy',messages:[{text:'保留原内容'}]},{id:'b',title:'另一段会话'}]});
test('navigation migration preserves conversations, legacy projects and team state',()=>{
 const s=setup();s.projects=[{id:'legacy'}];s.teamSpace={version:3};const before=JSON.stringify(s);
 initSidebarLayout(s);const {sidebarLayout,...rest}=s;
 assert.equal(JSON.stringify(rest),before);assert.deepEqual(sidebarLayout.assignments,{});
 assert.deepEqual(sidebarLayout.pinnedTaskIds,[]);
});
test('only identified demo tasks receive demo project placement and initial pin',()=>{
 const s=setup();s.tasks.push({id:'sample',center:{example:true},scheduleId:'tc-weekly'});
 const n=initSidebarLayout(s);assert.equal(n.assignments.sample,'nav-business');assert.equal(n.assignments.a,undefined);
 n.pinnedTaskIds=[];initSidebarLayout(s);assert.deepEqual(n.pinnedTaskIds,[]);
});
test('pinning a conversation persists order without reordering or altering source tasks',()=>{
 const s=setup(),before=JSON.stringify(s.tasks);toggleConversationPin(s,'b');toggleConversationPin(s,'a');
 assert.deepEqual(s.sidebarLayout.pinnedTaskIds,['b','a']);toggleConversationPin(s,'b');
 assert.deepEqual(s.sidebarLayout.pinnedTaskIds,['a']);assert.equal(JSON.stringify(s.tasks),before);
 assert.equal(toggleConversationPin(s,'missing'),false);
});
test('the built-in Skill conversation is pinned once and respects later manual removal',()=>{
 const s=setup();toggleConversationPin(s,'a');const sample={id:'skill-example',title:'内置对话示例'};s.tasks.push(sample);const before=JSON.stringify(s.tasks);
 assert.equal(pinDefaultSkillExample(s,sample),true);assert.deepEqual(s.sidebarLayout.pinnedTaskIds,['skill-example','a']);
 assert.equal(pinDefaultSkillExample(s,sample),false);toggleConversationPin(s,sample.id);
 const reloaded=JSON.parse(JSON.stringify(s));assert.equal(pinDefaultSkillExample(reloaded,reloaded.tasks.at(-1)),false);
 assert.deepEqual(reloaded.sidebarLayout.pinnedTaskIds,['a']);assert.equal(JSON.stringify(s.tasks),before);
});
test('project creation validates names and retains project instructions',()=>{
 const s=setup();assert.ok(addNavigationProject(s,' ').error);assert.ok(addNavigationProject(s,'x'.repeat(41)).error);
 const {project}=addNavigationProject(s,'  新项目  ',' 项目约定 ');
 assert.equal(project.name,'新项目');assert.equal(project.instructions,'项目约定');assert.ok(addNavigationProject(s,'新项目').error);
});
test('moving a conversation changes organization only, with default-project round trip',()=>{
 const s=setup(),{project}=addNavigationProject(s,'项目 A');
 assert.equal(moveConversation(s,'a',project.id),true);assert.deepEqual(projectTasks(s,project.id).map(t=>t.id),['a']);
 assert.equal(s.tasks[0].project,'legacy');assert.equal(s.tasks[0].messages[0].text,'保留原内容');
 assert.equal(moveConversation(s,'a','unknown'),false);assert.equal(moveConversation(s,'unknown',project.id),false);
 moveConversation(s,'a','');assert.deepEqual(projectTasks(s,'').map(t=>t.id),['a','b']);
});
test('new task assignment uses only an explicitly selected valid project',()=>{
 const s=setup();const n=initSidebarLayout(s);assert.equal(assignDraftProject(s,s.tasks[0]),null);
 const {project}=addNavigationProject(s,'项目 B');n.composeProjectId=project.id;assert.equal(draftProject(s),project);
 assignDraftProject(s,s.tasks[1]);assert.equal(n.assignments.b,project.id);n.composeProjectId='missing';assert.equal(draftProject(s),null);
});
test('deleted conversations cannot leave orphan pin entries',()=>{
 const s=setup();toggleConversationPin(s,'a');s.tasks=s.tasks.filter(t=>t.id!=='a');initSidebarLayout(s);
 assert.deepEqual(s.sidebarLayout.pinnedTaskIds,[]);
});
test('rail unifies marketplace routes and keeps remote control out of primary navigation',()=>{
 const s=setup();const html=renderFunctionRail({state:s,ui:{route:'plugins'}});
 assert.match(html,/aria-label="市场"/);assert.match(html,/aria-current="page"/);
 assert.ok(!html.includes('data-route="remote"'));assert.ok(!html.includes('aria-label="插件"'));
});
