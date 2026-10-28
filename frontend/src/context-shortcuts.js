import {esc,icon,uid} from './core.js';
import {agentThread,addAgentMessage} from './agent-conversations.js';

// Capability identifiers are internal routing contracts, not shell commands.
export const retrievalScopes=[
  {id:'chat',label:'查飞书消息',name:'飞书聊天记录',icon:'message',capability:'chat.search',resource:'messages'},
  {id:'docs',label:'查飞书文档',name:'飞书文档',icon:'book',capability:'docs.search',resource:'documents'},
  {id:'meetings',label:'查会议纪要',name:'飞书智能会议纪要',icon:'calendar',capability:'docs.search',resource:'documents',filter:'meeting-notes'},
  {id:'artnova',label:'查 ArtNova 数据',name:'ArtNova',icon:'chart',provider:'artnova',capability:'data.search',resource:'authorized-data'},
  {id:'todos',label:'查找我的待办',name:'飞书待办',icon:'checkCircle',capability:'task.search',resource:'tasks'},
  {id:'calendar',label:'查日程与空闲时间',name:'日程与空闲时间',icon:'calendar',capability:'calendar.freebusy',resource:'calendar'},
  {id:'base',label:'查询多维表格',name:'多维表格',icon:'grid',capability:'base.search',resource:'records'},
  {id:'approval',label:'查看审批进度',name:'审批进度',icon:'shield',capability:'approval.query',resource:'approvals'},
  {id:'drive',label:'查找云盘文件',name:'云盘文件',icon:'folder',capability:'drive.search',resource:'files'}
];
export function normalizeRetrievalScopes(ids=[]){return retrievalScopes.filter(s=>Array.isArray(ids)&&ids.includes(s.id)).map(s=>s.id);}
export function scopeSelection(owner,target='agent'){return normalizeRetrievalScopes(owner?.[target==='home'?'homeRetrievalScopes':'retrievalScopes']);}
export function renderContextShortcuts({target='home',agentId='',conversationId='',owner,inputId=target==='agent'?'cv-message':'task-prompt'}={}){
  const selected=scopeSelection(owner,target);
  return `<div class="context-shortcuts" role="group" aria-label="选择资料来源，可多选"><div class="context-shortcuts-heading"><span>资料来源</span><small>${selected.length?`已选 ${selected.length} 项，发送时按这些来源查找`:'可多选，发送时按所选来源查找'}</small></div><div class="context-shortcuts-items">${retrievalScopes.filter((s,i)=>i<4||selected.includes(s.id)).map(s=>{const active=selected.includes(s.id);return `<button type="button" class="context-shortcut${active?' is-active':''}" aria-pressed="${active}" data-action="retrieval:toggle" data-id="${s.id}" data-target="${target}" data-input="${inputId}" data-agent="${esc(agentId)}" data-conversation="${esc(conversationId)}" title="${active?'已选择，点击取消':'选中后，发送消息时从'+s.name+'中查找资料'}">${icon(active?'check':s.icon,14)}<span>${s.label}</span></button>`;}).join('')}<button type="button" class="context-shortcut" data-action="retrieval:more" data-target="${target}" data-input="${inputId}" data-agent="${esc(agentId)}" data-conversation="${esc(conversationId)}" aria-label="更多资料来源">${icon('plus',14)}更多</button></div></div>`;
}
export function renderRetrievalScopes(ids){const selected=normalizeRetrievalScopes(ids);return selected.length?`<div class="context-message-scopes" aria-label="本条消息选择的资料来源">${retrievalScopes.filter(s=>selected.includes(s.id)).map(s=>`<span>${icon(s.icon,13)}${s.name}</span>`).join('')}</div>`:'';}
export function handleContextShortcut(action,el,c){
  if(action==='retrieval:more'){const target=el.dataset.target,owner=target==='agent'?agentThread(c.state,el.dataset.agent):target==='task'?c.currentTask():c.state,selected=scopeSelection(owner,target);c.popover(el,`<div class="context-menu-caption">再选几个资料来源，可多选</div>${retrievalScopes.slice(4).map(s=>`<button data-action="retrieval:toggle" data-id="${s.id}" data-target="${target}" data-input="${el.dataset.input}" data-agent="${esc(el.dataset.agent||'')}" data-conversation="${esc(el.dataset.conversation||'')}" role="menuitemcheckbox" aria-checked="${selected.includes(s.id)}">${icon(s.icon,16)}${s.label}${selected.includes(s.id)?icon('check',14):''}</button>`).join('')}<div class="context-menu-caption">只查找你有权限查看的资料</div>`,260);return true;}
  if(action!=='retrieval:toggle')return false;
  if(!retrievalScopes.some(s=>s.id===el.dataset.id))return true;
  const target=el.dataset.target,owner=target==='agent'?agentThread(c.state,el.dataset.agent):target==='task'?c.currentTask():c.state;
  if(!owner||(target==='agent'&&el.dataset.conversation&&owner.id!==el.dataset.conversation))return true;
  const key=target==='home'?'homeRetrievalScopes':'retrievalScopes',selected=scopeSelection(owner,target);
  owner[key]=selected.includes(el.dataset.id)?selected.filter(id=>id!==el.dataset.id):normalizeRetrievalScopes([...selected,el.dataset.id]);
  c.save();c.render();return true;
}
export function createRetrievalRequest(text,ids,{conversationId=null,taskId=null,mentions=[],context=[]}={}){
  const scopes=normalizeRetrievalScopes(ids),query=String(text||'').trim();
  if(!query||!scopes.length)return null;
  return {id:uid('retrieval'),query,scopes,conversationId,taskId,mentions:structuredClone(mentions),context:structuredClone(context),createdAt:Date.now(),status:'awaiting-connection',
    operations:retrievalScopes.filter(s=>scopes.includes(s.id)).map(s=>({provider:s.provider||'feishu',capability:s.capability,resource:s.resource,filters:s.filter?{kind:s.filter}:{},query,scope:s.id,status:'awaiting-connection'})),
    policy:{access:'current-user',requireAuthorization:true,citeSources:true},results:[]};
}
export function retrievalPendingText(request){return `已选择${retrievalScopes.filter(s=>request.scopes.includes(s.id)).map(s=>'「'+s.name+'」').join('、')}，要查找的内容是“${request.query}”。\n\n这段演示尚未接入真实资料服务，本次没有读取真实资料。接入并授权后，只查找你有权限查看的内容，并附上来源。`;}
export function sendScopedConversation(c,id,text,{mentions=[]}={}){
  const thread=agentThread(c.state,id),request=createRetrievalRequest(text,thread.retrievalScopes,{conversationId:thread.id,taskId:thread.activeTaskId,mentions,context:[...(thread.context||[]),...(c.state.tasks.find(t=>t.id===thread.activeTaskId)?.context||[])]});
  if(!request)return false;
  const message=addAgentMessage(c.state,id,'user',text,{conversationId:thread.id,taskId:thread.activeTaskId,mentions,retrievalScopes:[...request.scopes],retrievalRequestId:request.id});
  if(!message)return false;
  thread.retrievalRequests||=[];thread.retrievalRequests.push(request);
  addAgentMessage(c.state,id,'assistant',retrievalPendingText(request),{conversationId:thread.id,taskId:thread.activeTaskId,at:message.at+1,kind:'retrieval-pending',retrievalRequestId:request.id});
  thread.draft='';thread.mentions=[];c.ui.cvMentionAgent=null;c.ui.cvSkillAgent=null;c.ui.cvScrollBottom=true;
  return true;
}
