import {esc,icon} from './core.js';

const text=(value,max=140)=>String(value??'').slice(0,max);
const list=value=>Array.isArray(value)?value:[];
const labels={doc:'文档',pdf:'PDF',sheet:'表格',html:'网页',ppt:'演示文稿'};
const fileIcon=f=>icon(f.type==='html'?'code':f.type==='sheet'?'chart':'file',19);

// The last result-bearing reply owns the preview. Earlier receipts stay intact.
export function artifactMessageAnchors(messages){
  const latest=new Map();
  for(const m of messages)if(m.role==='assistant'&&m.taskId&&(m.kind==='delivery'||m.kind==='approval'&&m.eventTitle==='准备操作确认'))latest.set(m.taskId,m.id);
  return new Set(latest.values());
}

function documentPreview(f){
  const pages=list(f.content?.pages),page=pages[0];if(!page)return '';
  return `<span class="db-preview db-document-preview" aria-hidden="true"><span class="db-preview-toc"><b>目录</b>${pages.slice(0,4).map(p=>`<span>${esc(text(p.heading,22))}</span>`).join('')}</span><span class="db-preview-paper"><strong>${esc(text(f.content.title||f.name,50))}</strong>${f.content.subtitle?`<small>${esc(text(f.content.subtitle,70))}</small>`:''}<b>${esc(text(page.heading,42))}</b>${list(page.paragraphs).slice(0,2).map(p=>`<span>${esc(text(p,150))}</span>`).join('')}</span></span>`;
}
function dashboardPreview(f){
  const content=f.content;if(!content||typeof content!=='object'||!Array.isArray(content.projects))return '';
  return `<span class="db-preview db-dashboard-preview" aria-hidden="true"><span class="db-preview-dashboard-heading"><small>${esc(text(content.owner||'网页成果',40))}</small><strong>${esc(text(content.title||f.name,55))}</strong><span>${esc(text(content.subtitle,80))}</span></span><span class="db-preview-projects">${content.projects.slice(0,3).map(p=>{const value=Number(p.progress),progress=Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;return `<span><b>${esc(text(p.name,35))}</b><small>${esc(text(p.status,15))}</small><span class="db-preview-progress"><i style="width:${progress}%"></i></span><em>${esc(text(p.note,68))}</em></span>`;}).join('')}</span></span>`;
}
function slidesPreview(f){
  const slide=list(f.content?.slides)[0];if(!slide)return '';
  return `<span class="db-preview db-slide-preview" aria-hidden="true"><small>${esc(text(slide.eyebrow||'演示文稿',50))}</small><strong>${esc(text(slide.title||f.name,55))}</strong><span>${esc(text(slide.subtitle||slide.body,115))}</span>${slide.metric?`<b>${esc(text(slide.metric,35))}</b>`:''}</span>`;
}
function preview(f){return f.type==='html'?dashboardPreview(f):f.type==='ppt'?slidesPreview(f):documentPreview(f);}
function card(task,f,compact){
  const content=compact?'':preview(f),version=f.version||1;
  return `<button type="button" class="db-artifact-card ${content?'has-preview':'is-compact'} ${f.type==='html'?'is-web':f.type==='sheet'?'is-sheet':'is-document'}" data-action="cv:file" data-task="${esc(task.id)}" data-file="${esc(f.id)}" aria-label="预览${esc(f.name)}，当前版本 v${esc(version)}"><span class="db-artifact-heading"><span class="db-artifact-icon">${fileIcon(f)}</span><span><strong>${esc(f.name)}</strong><small>${labels[f.type]||'成果'} · 当前版本 v${esc(version)}</small></span>${icon('chevron',15)}</span>${content}${content?'<span class="db-artifact-footer"><span>当前内容预览</span><span>打开成果 '+icon('arrow',14)+'</span></span>':''}</button>`;
}

export function renderConversationArtifacts(task){
  const files=list(task?.files).filter(f=>f&&f.id&&f.name);if(!files.length)return '';
  const primary=files.filter(f=>f.id.endsWith('-report')||['html','ppt'].includes(f.type)).slice(0,2);
  if(!primary.length)primary.push(files.find(f=>f.type==='doc'||f.type==='pdf')||files[0]);
  const support=files.filter(f=>f.type==='sheet'&&!primary.includes(f)).slice(0,1);
  return `<div class="db-artifact-cards" aria-label="本次工作成果">${primary.map(f=>card(task,f,false)).join('')}${support.map(f=>card(task,f,true)).join('')}</div>`;
}
