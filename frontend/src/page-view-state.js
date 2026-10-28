// Preserve each open page's reading position without copying its business data.
const selectors=['.tc-main-scroll','.nav-market-body','.page-scroll','.cv-chat-scroll','.cv-panel-scroll','.chat-scroll','.of-work-scroll','.talk-scroll','[data-child-view]'];
const owner=node=>node?.dataset?.tcMainKey||node?.dataset?.childView||node?.dataset?.officeView||'';
export function capturePageView(root){
 const scrolls=selectors.flatMap(selector=>Array.from(root.querySelectorAll(selector)).map((node,index)=>({selector,index,top:node.scrollTop||0,left:node.scrollLeft||0,owner:owner(node)})));
 const cv=root.querySelector('[data-agent-conversation]');
 return {scrolls,agentId:cv?.dataset?.agentConversation||'',conversationId:cv?.dataset?.conversationId||'',panelMode:cv?.classList?.contains('cv-work-active')?'work':'summary',panelOpen:cv?!cv.classList?.contains('cv-panel-hidden'):true};
}
// A generic Agent tab needs its own conversation identity. Task routes already
// identify their conversation; never replace that identity with a stale snapshot.
export function restorePageConversation(state,route,snapshot,{activate=false}={}){
 const {agentId,conversationId}=snapshot||{},office=state.office,thread=office?.threads?.[conversationId];
 if(!agentId||!conversationId||!office?.agents?.some(a=>a.id===agentId)||!thread||thread.id!==conversationId||thread.agentId!==agentId)return false;
 if(route.startsWith('chat/')){
  const task=state.tasks.find(t=>t.id===route.slice(5));
  return task?.office?.agentId===agentId&&(task.office.conversationId||agentId)===conversationId;
 }
 if(route!=='agent/'+agentId)return false;
 if(activate){office.activeConversations||={};office.activeConversations[agentId]=conversationId;return true;}
 return office.activeConversations?.[agentId]===conversationId;
}
export function restorePageView(root,snapshot){
 if(snapshot?.agentId||snapshot?.conversationId){const cv=root.querySelector('[data-agent-conversation]');if(cv?.dataset?.agentConversation!==snapshot.agentId||cv?.dataset?.conversationId!==snapshot.conversationId)return;}
 for(const saved of snapshot?.scrolls||[]){const node=root.querySelectorAll(saved.selector)[saved.index];if(!node||owner(node)!==saved.owner)continue;node.scrollTop=saved.top;node.scrollLeft=saved.left;}
}
