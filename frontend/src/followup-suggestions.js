import {esc} from './core.js';

// Local prototype heuristic. A production implementation can replace this pure
// function with a model result keyed to the completed turn, without changing send.
export function nextMessageSuggestion(owner,task=null){
 const messages=owner?.messages||[],last=messages.at(-1);
 const userIndex=messages.findLastIndex(m=>m.role==='user');
 if(userIndex<0||!last||last.role!=='assistant'||last.kind==='welcome'||messages.length<=userIndex+1)return '';
 if(task?.status==='running'||task?.office?.phase==='running'||last.streaming||last.pending)return '';
 const user=String(messages[userIndex].text||''),reply=String(last.text||''),phase=task?.office?.phase;
 let suggestion;
 if(last.kind==='retrieval-pending'||/尚未.*(?:执行|提交)|未连接真实|等待.*接入/.test(reply))suggestion='先帮我列一下需要补充哪些资料，哪些必须有、哪些可以后补，也说说各自用来做什么。暂时拿不到的先标出来，别替我猜。';
 else if(/^(你好|您好|嗨|hello|hi)[！!。\s]*$/i.test(user))suggestion='你能帮我做哪些工作？就拿日常办公举几个例子吧，顺便告诉我需要准备什么、你会怎么做，以及哪些地方要我确认。';
 else if(phase==='blocked')suggestion='这次卡在哪里了？先保留已经完成的部分，告诉我最少需要补充什么，或者有没有别的办法，补齐后可以从哪里继续。';
 else if(phase==='review'||phase==='ready'||phase==='approved')suggestion='帮我再检查一遍这份结果，重点看看数据口径、结论依据和有没有遗漏。需要改的地方按轻重排一下，给我具体改法。';
 else if(phase==='paused')suggestion='先帮我说说现在做到哪了，还剩哪些问题需要处理。要我决定的事情单独列出来，再建议一下接下来先做什么比较合适。';
 else if(phase==='plan')suggestion='这份计划我想先看清楚怎么落地。帮我说明每步需要什么、最后会交付什么，哪些地方还得我确认，再挑一个起点。';
 else if(/会议|纪要/.test(user))suggestion='帮我把待办、负责人和截止时间整理成表格，再附上对应的会议结论。没说清楚的先标成待确认，也提醒我先跟进哪几件事。';
 else if(/代码|编程|报错|bug|调试/i.test(user))suggestion='再帮我检查一下边界情况，像空数据、权限不足或者重复操作时会怎样。按影响大小列出问题，也告诉我怎么复现和验证。';
 else if(/对比|竞品|选型/.test(user))suggestion='结合这些差异，你会更推荐哪个方案？帮我说清楚取舍、适用场景和主要成本，还没验证的地方标出来，再给个下一步建议。';
 else if(/数据|分析|复盘/.test(user))suggestion='把关键发现和下一步行动帮我理一下，每条结论带上依据，猜测的原因单独说明。再按优先级排好，告诉我接下来重点看哪些数据。';
 else if(/方案|需求|产品|设计/.test(user))suggestion='帮我把方案拆成几步，标清优先级、交付物和怎么验收。第一版必须做的先列出来，再提醒我哪些地方有依赖或容易遗漏。';
 else if(/总结|整理|报告|文档/.test(user))suggestion='再帮我精简一版，保留关键结论和依据，让没参与的人也能看懂。还没确认的事情单独列出，整理成我能直接同步给团队的内容。';
 else if(/能.*(?:做|帮)|可以.*(?:做|帮)/.test(user))suggestion='那先帮我理一下今天的工作吧，按重要程度和截止时间排个顺序。缺什么信息可以先问我，再给一个现在就能开始的建议。';
 else suggestion='可以结合一个具体例子展开说说吗？就用日常工作的场景，讲讲要准备什么、怎么一步步做，以及最后能拿到什么结果。';
 // Do not keep recommending the sentence the user has just used.
 return suggestion===user.trim()?'还有哪些容易遗漏的细节？帮我换个实际场景再看看，把需要提前准备和要我确认的事情列出来，也说说下一步可以怎么做。':suggestion;
}
export function suggestionKey(owner,task){const last=owner?.messages?.at(-1);return JSON.stringify([owner?.id,last?.id,last?.text,owner?.messages?.length,task?.status,task?.office?.phase]);}
export function renderFollowupField(textarea,owner,task=null){
 const suggestion=nextMessageSuggestion(owner,task);if(!suggestion)return textarea;
 const field=textarea.replace(/placeholder="[^"]*"/,`placeholder="${esc(suggestion)}" data-next-suggestion="${esc(suggestion)}" data-next-key="${esc(suggestionKey(owner,task))}"`);
 return `<div class="followup-field">${field}<button type="button" class="followup-accept" data-action="followup:accept" aria-label="填入下一句建议" title="填入后可以修改，确认发送才会提交"><kbd>Tab</kbd><span>填入建议</span></button></div>`;
}
function currentOwner(input,c){
 if(input.dataset.live==='cv:draft'){
  const thread=c.state.office?.threads?.[input.dataset.conversation];
  if(!thread||thread.agentId!==input.dataset.agent||(c.state.office.activeConversations?.[thread.agentId]||thread.agentId)!==thread.id)return [];
  return [thread,c.state.tasks.find(t=>t.id===thread.activeTaskId)];
 }
 if(input.dataset.live==='local:draft')return [c.state.localAgents?.connections?.[input.dataset.agent]];
 if(input.dataset.live==='chat:draft'){const task=c.currentTask();return [task,task];}
 return [];
}
export function acceptFollowup(input,c){
 if(!input||input.isConnected===false||input.value||c.ui.modal)return false;
 const [owner,task]=currentOwner(input,c),suggestion=nextMessageSuggestion(owner,task);
 if(!suggestion||owner?.draft||suggestion!==input.dataset.nextSuggestion||suggestionKey(owner,task)!==input.dataset.nextKey)return false;
 input.value=suggestion;
 // Reuse the ordinary input path: persist a draft, update send affordance, and
 // preserve selected retrieval scopes. Never call send or reorder assistants.
 input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange(suggestion.length,suggestion.length);return true;
}
export function handleFollowup(action,el,c){if(action!=='followup:accept')return false;acceptFollowup(el.closest('.followup-field')?.querySelector('textarea'),c);return true;}
export function keyFollowup(e,c){if(e.key!=='Tab'||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||!e.target.dataset?.nextSuggestion)return false;if(!acceptFollowup(e.target,c))return false;e.preventDefault();return true;}
