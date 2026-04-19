var ie=Object.defineProperty;var se=(i,e,o)=>e in i?ie(i,e,{enumerable:!0,configurable:!0,writable:!0,value:o}):i[e]=o;var x=(i,e,o)=>se(i,typeof e!="symbol"?e+"":e,o);import{M as R}from"./messages-BGsBY0t2.js";import{j as r,c as N,r as c,s as B,F as ae,a as de,b as ce,D as H,d as G,S as F,v as U,X as le,u as K,C as Y,G as V,e as pe,P as fe,f as ge,t as ue,g as he}from"./sortable.esm-qd8fvc0V.js";const M="[Prompt-Script]",me=100,xe=['[data-testid="agent-message-input"]','[data-lexical-editor="true"]','div[contenteditable="true"][role="textbox"]','textarea[placeholder*="prompt"]','textarea[placeholder*="提示"]',".input-area textarea",'textarea[class*="input"]','textarea[class*="prompt"]'];class be{constructor(e){x(this,"observer",null);x(this,"navObserver",null);x(this,"debounceTimer");x(this,"inputElement",null);x(this,"onInputDetected");x(this,"originalPushState",null);x(this,"originalReplaceState",null);x(this,"boundPopstateHandler",null);x(this,"healthCheckInterval");this.onInputDetected=e}start(){this.tryDetect(),this.observer=new MutationObserver(e=>{this.debouncedDetect()}),this.observer.observe(document.body,{childList:!0,subtree:!0,attributes:!1}),this.watchNavigation(),this.healthCheckInterval=setInterval(()=>{this.inputElement||this.tryDetect()},3e4)}stop(){var e,o;(e=this.observer)==null||e.disconnect(),(o=this.navObserver)==null||o.disconnect(),this.debounceTimer!==void 0&&clearTimeout(this.debounceTimer),this.healthCheckInterval!==void 0&&(clearInterval(this.healthCheckInterval),this.healthCheckInterval=void 0),this.originalPushState&&(history.pushState=this.originalPushState),this.originalReplaceState&&(history.replaceState=this.originalReplaceState),this.boundPopstateHandler&&window.removeEventListener("popstate",this.boundPopstateHandler)}getInputElement(){return this.inputElement}debouncedDetect(){this.debounceTimer!==void 0&&clearTimeout(this.debounceTimer),this.debounceTimer=setTimeout(()=>{this.tryDetect()},me)}tryDetect(){const e=this.findLovartInput();e&&e!==this.inputElement&&(this.inputElement=e,console.log(M,"Input detected:",e),this.onInputDetected(e))}findLovartInput(){for(const e of xe){const o=document.querySelector(e);if(o&&this.isValidInputElement(o))return o}return null}isValidInputElement(e){return e.offsetWidth===0||e.offsetHeight===0?!1:!!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement||e.isContentEditable)}handleNavigation(){console.log(M,"Navigation detected via history API"),this.inputElement=null,this.tryDetect()}watchNavigation(){this.originalPushState=history.pushState,this.originalReplaceState=history.replaceState,history.pushState=(...o)=>{this.originalPushState.apply(history,o),this.handleNavigation()},history.replaceState=(...o)=>{this.originalReplaceState.apply(history,o),this.handleNavigation()},this.boundPopstateHandler=()=>this.handleNavigation(),window.addEventListener("popstate",this.boundPopstateHandler);let e=location.href;this.navObserver=new MutationObserver(()=>{location.href!==e&&(e=location.href,console.log(M,"Navigation detected:",e),this.inputElement=null,this.tryDetect())}),this.navObserver.observe(document.body,{childList:!0,subtree:!0})}}function we({isOpen:i,onClick:e}){const o=a=>{a.preventDefault(),a.stopPropagation(),e()},n=a=>{(a.key==="Enter"||a.key===" ")&&(a.preventDefault(),e())};return r.jsx("button",{className:`trigger-button${i?" open":""}`,onClick:o,onKeyDown:n,role:"button",tabIndex:0,"aria-label":"选择预设提示词","aria-expanded":i,title:"Prompt-Script",children:r.jsx("svg",{className:"trigger-icon",width:"18",height:"18",viewBox:"0 0 24 24",fill:"none",xmlns:"http://www.w3.org/2000/svg",children:r.jsx("path",{d:"M13 3L4 14h7l-1 7 9-11h-7l1-7z",fill:"currentColor",fillOpacity:"0.9"})})})}/**
 * @license lucide-react v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=[["path",{d:"M7 7h10v10",key:"1tivn9"}],["path",{d:"M7 17 17 7",key:"1vkiza"}]],ve=N("arrow-up-right",ye);/**
 * @license lucide-react v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ee=[["path",{d:"m11 10 3 3",key:"fzmg1i"}],["path",{d:"M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z",key:"p4q2r7"}],["path",{d:"M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031",key:"wy6l02"}]],ke=N("brush",Ee);/**
 * @license lucide-react v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Se=[["path",{d:"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",key:"usdka0"}]],W=N("folder-open",Se);/**
 * @license lucide-react v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ie=[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",key:"zw3jo"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",key:"1wduqc"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",key:"kqbvx6"}]],X=N("layers",Ie);/**
 * @license lucide-react v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const je=[["path",{d:"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915",key:"1i5ecw"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]],$e=N("settings",je);/**
 * @license lucide-react v1.8.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ce=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}]],Pe=N("sparkle",Ce),Te={design:ge,style:fe,default:pe},Re=[{id:"all",name:"全部分类",order:0},{id:"design",name:"设计",order:1},{id:"style",name:"风格",order:2},{id:"other",name:"其他",order:3}],t="prompt-script-dropdown-portal";function Ne(){let i=document.getElementById(t);if(!i){i=document.createElement("div"),i.id=t;const e=document.createElement("style");e.id="prompt-script-dropdown-styles",e.textContent=De(),document.head.appendChild(e),document.body.appendChild(i)}return i}function De(){return`
    #${t} .dropdown-container {
      position: fixed;
      width: 480px;
      max-height: 600px;
      background: #ffffff;
      border: 1px solid #E5E5E5;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      box-sizing: border-box;
      z-index: 2147483647;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
    }

    #${t} .dropdown-sidebar {
      width: 120px;
      background: #f8f8f8;
      border-right: 1px solid #E5E5E5;
      display: flex;
      flex-direction: column;
      padding: 12px 0;
      border-radius: 12px 0 0 12px;
    }

    #${t} .sidebar-categories {
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
    }

    #${t} .sidebar-category-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: transparent;
      border: none;
      border-radius: 0;
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      color: #171717;
      cursor: pointer;
      transition: background 0.15s ease;
      width: 100%;
      overflow: hidden;
    }

    #${t} .sidebar-category-item span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    #${t} .sidebar-category-item:hover {
      background: #f0f0f0;
    }

    #${t} .sidebar-category-item.selected {
      background: #ffffff;
      color: #A16207;
      border-left: 2px solid #A16207;
    }

    #${t} .sidebar-category-icon {
      width: 14px;
      height: 14px;
      color: #64748B;
    }

    #${t} .sidebar-category-item.selected .sidebar-category-icon {
      color: #A16207;
    }

    #${t} .dropdown-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 0 12px 12px 0;
    }

    #${t} .dropdown-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #E5E5E5;
    }

    #${t} .dropdown-header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #171717;
    }

    #${t} .dropdown-header-logo {
      width: 16px;
      height: 16px;
    }

    #${t} .dropdown-header-actions {
      display: flex;
      gap: 8px;
    }

    #${t} .dropdown-settings,
    #${t} .dropdown-close {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s ease;
      color: #171717;
    }

    #${t} .dropdown-settings:hover,
    #${t} .dropdown-close:hover {
      background: #f8f8f8;
    }

    #${t} .dropdown-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }

    #${t} .dropdown-items {
      display: flex;
      flex-direction: column;
    }

    #${t} .dropdown-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #E5E5E5;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    #${t} .dropdown-item:hover {
      background: #f8f8f8;
    }

    #${t} .dropdown-item.last {
      border-bottom: none;
    }

    #${t} .dropdown-item.selected {
      background: #fef3e2;
    }

    #${t} .dropdown-item-icon {
      width: 16px;
      height: 16px;
      color: #171717;
    }

    #${t} .dropdown-item-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    #${t} .dropdown-item-name {
      font-size: 12px;
      font-weight: 500;
      color: #171717;
    }

    #${t} .dropdown-item-preview {
      font-size: 10px;
      color: #64748B;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${t} .dropdown-item-arrow {
      width: 12px;
      height: 12px;
      color: #171717;
    }

    #${t} .empty-state {
      padding: 24px;
      text-align: center;
    }

    #${t} .empty-message {
      font-size: 12px;
      color: #64748B;
    }

    #${t} .dropdown-content::-webkit-scrollbar,
    #${t} .sidebar-categories::-webkit-scrollbar {
      width: 6px;
    }

    #${t} .dropdown-content::-webkit-scrollbar-track,
    #${t} .sidebar-categories::-webkit-scrollbar-track {
      background: transparent;
    }

    #${t} .dropdown-content::-webkit-scrollbar-thumb,
    #${t} .sidebar-categories::-webkit-scrollbar-thumb {
      background: #ddd;
      border-radius: 3px;
    }

    #${t} .dropdown-content::-webkit-scrollbar-thumb:hover,
    #${t} .sidebar-categories::-webkit-scrollbar-thumb:hover {
      background: #ccc;
    }

    #${t} .dropdown-item-drag-handle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      color: #64748B;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      z-index: 100;
      pointer-events: auto;
      background: #ffffff;
      border-radius: 3px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    #${t} .dropdown-item:hover .dropdown-item-drag-handle,
    #${t} .dropdown-item-drag-handle:hover {
      opacity: 1;
      visibility: visible;
    }

    #${t} .dropdown-item-drag-handle:active {
      cursor: grabbing;
    }

    #${t} .dropdown-item.dragging {
      opacity: 0.5;
      background: #f8f8f8;
    }

    #${t} .dropdown-item-icon-wrapper {
      position: relative;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    #${t} .dropdown-item-icon {
      width: 16px;
      height: 16px;
      color: #171717;
      transition: opacity 0.15s ease;
    }

    #${t} .dropdown-item:hover .dropdown-item-icon {
      opacity: 0;
    }

    #${t} .sidebar-category-drag-handle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      color: #64748B;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      z-index: 100;
      pointer-events: auto;
      background: #f8f8f8;
      border-radius: 3px;
    }

    #${t} .sidebar-category-item:hover .sidebar-category-drag-handle,
    #${t} .sidebar-category-drag-handle:hover {
      opacity: 1;
      visibility: visible;
    }

    #${t} .sidebar-category-drag-handle:active {
      cursor: grabbing;
    }

    #${t} .sidebar-category-icon-wrapper {
      position: relative;
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    #${t} .sidebar-category-icon {
      width: 14px;
      height: 14px;
      color: #64748B;
      transition: opacity 0.15s ease;
    }

    #${t} .sidebar-category-item.selected .sidebar-category-icon {
      color: #A16207;
    }

    #${t} .sidebar-category-item:hover .sidebar-category-icon {
      opacity: 0;
    }
  `}const ze={all:W,design:Pe,style:ke,other:X};function Le({category:i,isSelected:e,onSelect:o,showDragHandle:n,IconComponent:a}){const{attributes:d,listeners:b,setNodeRef:h,transform:k,transition:P,isDragging:p}=K({id:i.id}),$={transform:Y.Transform.toString(k),transition:P,opacity:p?.5:1};return r.jsxs("div",{ref:h,style:$,className:`sidebar-category-item ${e?"selected":""}`,onClick:()=>o(i.id),role:"button",tabIndex:0,onKeyDown:m=>{(m.key==="Enter"||m.key===" ")&&(m.preventDefault(),o(i.id))},children:[r.jsxs("div",{className:"sidebar-category-icon-wrapper",children:[n&&r.jsx("div",{className:"sidebar-category-drag-handle",...d,...b,children:r.jsx(V,{style:{width:12,height:12}})}),r.jsx(a,{className:"sidebar-category-icon"})]}),r.jsx("span",{children:i.name})]})}function Ae({prompt:i,isLast:e,isSelected:o,onSelect:n,showDragHandle:a}){const{attributes:d,listeners:b,setNodeRef:h,transform:k,transition:P,isDragging:p}=K({id:i.id}),$={transform:Y.Transform.toString(k),transition:P,opacity:p?.5:1},m=Te[i.categoryId==="design"?"design":i.categoryId==="style"?"style":"default"];return r.jsxs("div",{ref:h,style:$,className:`dropdown-item${o?" selected":""}${e?" last":""}${p?" dragging":""}`,onMouseDown:y=>y.preventDefault(),onClick:()=>n(i),role:"button",tabIndex:0,onKeyDown:y=>{(y.key==="Enter"||y.key===" ")&&(y.preventDefault(),n(i))},children:[r.jsxs("div",{className:"dropdown-item-icon-wrapper",children:[a&&r.jsx("div",{className:"dropdown-item-drag-handle",...d,...b,children:r.jsx(V,{style:{width:12,height:12}})}),r.jsx(m,{className:"dropdown-item-icon"})]}),r.jsxs("div",{className:"dropdown-item-text",children:[r.jsx("span",{className:"dropdown-item-name",children:i.name}),r.jsx("span",{className:"dropdown-item-preview",children:ue(i.content,40)})]}),r.jsx(ve,{className:"dropdown-item-arrow"})]})}function Me({prompts:i,categories:e,onSelect:o,isOpen:n,selectedPromptId:a,onClose:d,isLoading:b=!1}){const h=c.useRef(null),[k,P]=c.useState({top:0,right:0,isStickyTop:!1}),[p,$]=c.useState("all"),[m,y]=c.useState([]),[C,v]=c.useState([]),E=8,D=600;c.useEffect(()=>{y(i)},[i]),c.useEffect(()=>{v(e)},[e]),c.useEffect(()=>{if(!n)return;const s=()=>{const f=document.querySelector('[data-testid="prompt-script-trigger"]');if(!f)return;const g=f.getBoundingClientRect(),I=window.innerWidth-g.left,j=g.top-E,L=j-D<0;P({top:L?0:j,right:I,isStickyTop:L})};s();const l=()=>s();return window.addEventListener("scroll",l,{passive:!0}),window.addEventListener("resize",l),()=>{window.removeEventListener("scroll",l),window.removeEventListener("resize",l)}},[n,E,D]);const z=c.useMemo(()=>{const s={id:"all",name:"全部分类",order:0};if(C.length>0)return[s,...B(C)];const l=[...new Set(i.map(g=>g.categoryId))],f=[s];return l.forEach(g=>{const T=Re.find(I=>I.id===g);f.push(T||{id:g,name:g,order:ae})}),f},[C,i]),A=c.useMemo(()=>z.filter(s=>s.id!=="all"),[z]),Q=A.length>=2,S=c.useMemo(()=>{let s;return p==="all"?s=m:s=m.filter(l=>l.categoryId===p),de(s)},[m,p]),Z=S.length>=2&&p!=="all",ee=async s=>{const{active:l,over:f}=s;if(f&&l.id!==f.id&&p!=="all"){const g=S.findIndex(u=>u.id===l.id),T=S.findIndex(u=>u.id===f.id),I=[...S];I.splice(g,1),I.splice(T,0,S[g]);const j=m.map(u=>u.categoryId===p?{...u,order:I.map(w=>w.id).indexOf(u.id)}:u);y(j);try{await chrome.runtime.sendMessage({type:R.SET_STORAGE,payload:{prompts:j,categories:C,version:"1.0.0"}})}catch(u){console.error("[Prompt-Script] Failed to reorder prompts:",u)}}},te=async s=>{const{active:l,over:f}=s;if(f&&l.id!==f.id){const g=B(C),T=g.findIndex(w=>w.id===l.id),I=g.findIndex(w=>w.id===f.id),j=[...g];j.splice(T,1),j.splice(I,0,g[T]);const u=C.map(w=>({...w,order:j.map(L=>L.id).indexOf(w.id)}));v(u);try{await chrome.runtime.sendMessage({type:R.SET_STORAGE,payload:{prompts:m,categories:u,version:"1.0.0"}})}catch(w){console.error("[Prompt-Script] Failed to reorder categories:",w)}}};if(c.useEffect(()=>{if(!n)return;const s=l=>{const f=document.querySelector('[data-testid="prompt-script-trigger"]');h.current&&!h.current.contains(l.target)&&f&&!f.contains(l.target)&&(d==null||d())};return document.addEventListener("mousedown",s),()=>document.removeEventListener("mousedown",s)},[n,d]),!n)return null;const oe={top:k.top,right:k.right,transform:k.isStickyTop?"none":"translateY(-100%)"},re=()=>{chrome.runtime.sendMessage({type:R.OPEN_SETTINGS}),d==null||d()},ne=s=>ze[s]||X;return ce.createPortal(r.jsxs("div",{ref:h,className:"dropdown-container",style:oe,children:[r.jsx("div",{className:"dropdown-sidebar",children:r.jsxs("div",{className:"sidebar-categories",children:[r.jsxs("button",{className:`sidebar-category-item ${p==="all"?"selected":""}`,onClick:()=>$("all"),"aria-label":"全部分类",children:[r.jsx("div",{className:"sidebar-category-icon-wrapper",children:r.jsx(W,{className:"sidebar-category-icon"})}),r.jsx("span",{children:"全部分类"})]}),r.jsx(H,{collisionDetection:G,onDragEnd:te,children:r.jsx(F,{items:A.map(s=>s.id),strategy:U,children:A.map(s=>{const l=ne(s.id);return r.jsx(Le,{category:s,isSelected:p===s.id,onSelect:$,showDragHandle:Q,IconComponent:l},s.id)})})})]})}),r.jsxs("div",{className:"dropdown-main",children:[r.jsxs("div",{className:"dropdown-header",children:[r.jsxs("span",{className:"dropdown-header-title",children:[r.jsx("img",{className:"dropdown-header-logo",src:chrome.runtime.getURL("assets/icon-128.png"),alt:"Prompt Script"}),"Prompt Script"]}),r.jsxs("div",{className:"dropdown-header-actions",children:[r.jsx("button",{className:"dropdown-settings",onClick:re,"aria-label":"设置",children:r.jsx($e,{style:{width:14,height:14}})}),r.jsx("button",{className:"dropdown-close",onClick:d,"aria-label":"关闭",children:r.jsx(le,{style:{width:14,height:14}})})]})]}),r.jsx("div",{className:"dropdown-content",children:b?r.jsx("div",{className:"empty-state",children:r.jsx("div",{className:"empty-message",children:"加载中..."})}):S.length===0?r.jsx("div",{className:"empty-state",children:r.jsx("div",{className:"empty-message",children:p==="all"?"暂无提示词，请点击设置添加":"该分类暂无提示词"})}):r.jsx("div",{className:"dropdown-items",children:r.jsx(H,{collisionDetection:G,onDragEnd:ee,children:r.jsx(F,{items:S.map(s=>s.id),strategy:U,children:S.map((s,l)=>r.jsx(Ae,{prompt:s,isLast:l===S.length-1,isSelected:a===s.id,onSelect:o,showDragHandle:Z},s.id))})})})})]})]}),Ne())}const O="[Prompt-Script]";class Oe{insertPrompt(e,o){try{return e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement?this.insertIntoFormControl(e,o):this.insertIntoRichText(e,o),this.dispatchInputEvents(e),console.log(O,"Prompt inserted:",o),!0}catch(n){return console.error(O,"Insert failed:",n),!1}}insertIntoFormControl(e,o){const n=e.selectionStart??e.value.length,a=e.selectionEnd??n;e.value=e.value.substring(0,n)+o+e.value.substring(a);const d=n+o.length;e.selectionStart=d,e.selectionEnd=d}insertIntoRichText(e,o){document.activeElement!==e&&e.focus();const n=window.getSelection();if(!n||n.rangeCount===0||!e.contains(n.getRangeAt(0).commonAncestorContainer)){const d=document.createRange();d.selectNodeContents(e),d.collapse(!1),n==null||n.removeAllRanges(),n==null||n.addRange(d)}document.execCommand("insertText",!1,o)||(console.warn(O,"execCommand failed, using fallback method"),this.insertIntoRichTextFallback(e,o))}insertIntoRichTextFallback(e,o){const n=window.getSelection();if(!n||n.rangeCount===0){e.textContent+=o;return}const a=n.getRangeAt(0);if(!e.contains(a.commonAncestorContainer)){const h=document.createRange();h.selectNodeContents(e),h.collapse(!1),n.removeAllRanges(),n.addRange(h)}const d=n.getRangeAt(0);d.deleteContents();const b=document.createTextNode(o);d.insertNode(b),d.setStartAfter(b),d.setEndAfter(b),n.removeAllRanges(),n.addRange(d)}dispatchInputEvents(e){var o,n;if(e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0})),e instanceof HTMLInputElement){const a=(o=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value"))==null?void 0:o.set;a&&(a.call(e,e.value),e.dispatchEvent(new Event("input",{bubbles:!0})))}else if(e instanceof HTMLTextAreaElement){const a=(n=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value"))==null?void 0:n.set;a&&(a.call(e,e.value),e.dispatchEvent(new Event("input",{bubbles:!0})))}e.isContentEditable&&e.dispatchEvent(new InputEvent("beforeinput",{bubbles:!0,inputType:"insertText",data:null}))}}function _e({inputElement:i}){const[e,o]=c.useState(!1),[n,a]=c.useState(null),[d,b]=c.useState([]),[h,k]=c.useState([]),[P,p]=c.useState(!0),$=c.useRef(new Oe);c.useEffect(()=>{var v;if(!((v=chrome.runtime)!=null&&v.id)){console.log("[Prompt-Script] Extension context invalidated"),p(!1);return}try{chrome.runtime.sendMessage({type:R.GET_STORAGE},E=>{var D;if((D=chrome.runtime)!=null&&D.lastError){console.log("[Prompt-Script] Runtime error:",chrome.runtime.lastError.message),p(!1);return}if(E!=null&&E.success&&E.data){const z=E.data;b(z.prompts),k(z.categories)}p(!1)})}catch(E){console.log("[Prompt-Script] Extension context error:",E),p(!1)}},[]);const m=c.useCallback(()=>{o(v=>!v)},[]),y=c.useCallback(()=>{o(!1)},[]),C=c.useCallback(v=>{$.current.insertPrompt(i,v.content),a(v.id),setTimeout(()=>{a(null)},2e3)},[i]);return r.jsxs("div",{className:"dropdown-app",children:[r.jsx(we,{isOpen:e,onClick:m}),r.jsx(Me,{prompts:d,categories:h,onSelect:C,isOpen:e,selectedPromptId:n,onClose:y,isLoading:P})]})}class Be extends c.Component{constructor(e){super(e),this.state={hasError:!1,error:null}}static getDerivedStateFromError(e){var o,n;return(o=e.message)!=null&&o.includes("Extension context invalidated")||(n=e.message)!=null&&n.includes("Extension context invalidated")?{hasError:!0,error:e}:{hasError:!0,error:e}}componentDidCatch(e,o){console.log("[Prompt-Script] Error caught:",e.message),console.log("[Prompt-Script] Component stack:",o.componentStack)}render(){var e;return this.state.hasError?(console.log("[Prompt-Script] Component error:",(e=this.state.error)==null?void 0:e.message),null):this.props.children}}const q="[Prompt-Script]",He="prompt-script-host",Ge='[data-testid="agent-input-bottom-more-button"]';class Fe{constructor(){x(this,"hostElement",null);x(this,"shadowRoot",null);x(this,"reactRoot",null)}inject(e){var a;this.remove();const o=document.querySelector(Ge);if(!o){console.warn(q,"Target element not found, skipping injection");return}this.hostElement=document.createElement("span"),this.hostElement.id=He,this.hostElement.setAttribute("data-testid","prompt-script-trigger"),this.shadowRoot=this.hostElement.attachShadow({mode:"open"}),this.shadowRoot.innerHTML=`
      <style>
        ${this.getStyles()}
      </style>
      <div id="react-root"></div>
    `,(a=o.parentNode)==null||a.insertBefore(this.hostElement,o);const n=this.shadowRoot.querySelector("#react-root");n&&(this.reactRoot=he.createRoot(n),this.reactRoot.render(r.jsx(Be,{children:r.jsx(_e,{inputElement:e})}))),console.log(q,"UI injected before target element")}getStyles(){return`
      /* Container reset */
      #react-root {
        all: initial;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-sizing: border-box;
      }

      /* Dropdown app wrapper */
      .dropdown-app {
        display: inline-flex;
        position: relative;
      }

      /* Trigger button - Circular lightning icon matching Lovart style */
      .trigger-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        transition: background 0.15s ease;
        box-sizing: border-box;
        color: #171717;
      }

      .trigger-button:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      .trigger-button:active {
        background: rgba(0, 0, 0, 0.1);
      }

      .trigger-button:focus {
        outline: none;
      }

      .trigger-button.open {
        background: rgba(0, 0, 0, 0.08);
      }

      .trigger-icon {
        width: 18px;
        height: 18px;
        color: inherit;
      }

      /* Dropdown container */
      .dropdown-container {
        position: absolute;
        bottom: calc(100% + 8px);
        right: 0;
        width: 360px;
        max-height: 400px;
        overflow-y: auto;
        overflow-x: hidden;
        background: #ffffff;
        border: 1px solid #E5E5E5;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 150ms ease-out, transform 150ms ease-out;
        pointer-events: none;
        padding: 16px;
        box-sizing: border-box;
      }

      .dropdown-container.open {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }

      /* Dropdown items wrapper */
      .dropdown-items {
        display: flex;
        flex-direction: column;
      }

      /* Dropdown header */
      .dropdown-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px solid #E5E5E5;
        margin-bottom: 12px;
      }

      .dropdown-header-left {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }

      .dropdown-header-title {
        font-size: 10px;
        font-weight: 600;
        color: #64748B;
        letter-spacing: 1px;
        font-family: 'Inter', sans-serif;
      }

      /* Category Selector */
      .category-selector {
        position: relative;
        display: flex;
        align-items: center;
      }

      .category-selector-button {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: #f8f8f8;
        border: 1px solid #E5E5E5;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        color: #171717;
        font-family: 'Inter', sans-serif;
        transition: background 0.15s ease, border-color 0.15s ease;
        white-space: nowrap;
      }

      .category-selector-button:hover {
        background: #f0f0f0;
        border-color: #d0d0d0;
      }

      .category-icon {
        color: #64748B;
      }

      .category-name {
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .category-chevron {
        color: #64748B;
        transition: transform 0.15s ease;
      }

      .category-chevron.open {
        transform: rotate(180deg);
      }

      .category-menu {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        min-width: 120px;
        background: #ffffff;
        border: 1px solid #E5E5E5;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
        z-index: 1000;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .category-menu-item {
        display: block;
        width: 100%;
        padding: 8px 12px;
        background: transparent;
        border: none;
        border-radius: 4px;
        text-align: left;
        font-size: 12px;
        font-weight: 500;
        color: #171717;
        font-family: 'Inter', sans-serif;
        cursor: pointer;
        transition: background 0.15s ease;
        white-space: nowrap;
      }

      .category-menu-item:hover {
        background: #f8f8f8;
      }

      .category-menu-item.selected {
        background: #fef3e2;
        color: #A16207;
      }

      .dropdown-close {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .dropdown-close:hover {
        background: #f8f8f8;
      }

      .dropdown-close svg {
        color: #171717;
      }

      /* Dropdown header actions container */
      .dropdown-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Settings button */
      .dropdown-settings {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .dropdown-settings:hover {
        background: #f8f8f8;
      }

      .dropdown-settings svg {
        color: #171717;
      }

      /* Settings overlay */
      .settings-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      /* Settings popup */
      .settings-popup {
        width: 320px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
        padding: 16px;
        box-sizing: border-box;
      }

      /* Settings header */
      .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px solid #E5E5E5;
        margin-bottom: 16px;
      }

      .settings-title {
        font-size: 14px;
        font-weight: 600;
        color: #171717;
        font-family: 'Inter', sans-serif;
      }

      .settings-close {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .settings-close:hover {
        background: #f8f8f8;
      }

      .settings-close svg {
        color: #171717;
      }

      /* Settings content */
      .settings-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .settings-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .settings-section-title {
        font-size: 11px;
        font-weight: 600;
        color: #64748B;
        letter-spacing: 0.5px;
        font-family: 'Inter', sans-serif;
      }

      .settings-actions {
        display: flex;
        gap: 8px;
      }

      .settings-action-btn {
        flex: 1;
        padding: 10px 12px;
        background: #f8f8f8;
        border: 1px solid #E5E5E5;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        color: #171717;
        font-family: 'Inter', sans-serif;
        transition: background 0.15s ease, border-color 0.15s ease;
      }

      .settings-action-btn:hover {
        background: #f0f0f0;
        border-color: #d0d0d0;
      }

      .settings-info {
        font-size: 12px;
        color: #64748B;
        font-family: 'Inter', sans-serif;
      }

      .settings-version {
        font-size: 12px;
        color: #171717;
        font-family: 'Inter', sans-serif;
      }

      /* Dropdown item */
      .dropdown-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid #E5E5E5;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .dropdown-item:hover {
        background: #f8f8f8;
      }

      .dropdown-item.last {
        border-bottom: none;
      }

      .dropdown-item.selected {
        background: #fef3e2;
      }

      .dropdown-item-icon {
        width: 16px;
        height: 16px;
        color: #171717;
      }

      .dropdown-item-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .dropdown-item-name {
        font-size: 12px;
        font-weight: 500;
        color: #171717;
        font-family: 'Inter', sans-serif;
      }

      .dropdown-item-preview {
        font-size: 10px;
        color: #64748B;
        font-family: 'Inter', sans-serif;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dropdown-item-arrow {
        width: 12px;
        height: 12px;
        color: #171717;
      }

      /* Empty state */
      .empty-state {
        padding: 24px;
        text-align: center;
      }

      .empty-message {
        font-size: 12px;
        color: #64748B;
        font-family: 'Inter', sans-serif;
      }

      /* Scrollbar styling */
      .dropdown-container::-webkit-scrollbar {
        width: 6px;
      }

      .dropdown-container::-webkit-scrollbar-track {
        background: transparent;
      }

      .dropdown-container::-webkit-scrollbar-thumb {
        background: #ddd;
        border-radius: 3px;
      }

      .dropdown-container::-webkit-scrollbar-thumb:hover {
        background: #ccc;
      }

      /* Footer action area */
      .dropdown-footer {
        padding: 12px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }

      .dropdown-footer-btn {
        flex: 1;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #e0e0e0;
        background: #ffffff;
        cursor: pointer;
        font-size: 13px;
        color: #333;
        transition: background 0.15s ease, border-color 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .dropdown-footer-btn:hover {
        background: #f8f8f8;
        border-color: #d0d0d0;
      }

      .dropdown-footer-btn:active {
        background: #f0f0f0;
      }

      .dropdown-footer-btn.primary {
        background: #1890ff;
        border-color: #1890ff;
        color: #ffffff;
      }

      .dropdown-footer-btn.primary:hover {
        background: #40a9ff;
        border-color: #40a9ff;
      }

      .dropdown-footer-btn.primary:active {
        background: #096dd9;
        border-color: #096dd9;
      }

      .dropdown-footer-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Add prompt form */
      .add-prompt-form {
        padding: 12px;
      }

      .add-prompt-form-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .add-prompt-form-title {
        font-size: 14px;
        font-weight: 500;
        color: #333;
      }

      .add-prompt-form-close {
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
        border-radius: 4px;
      }

      .add-prompt-form-close:hover {
        background: #f0f0f0;
        color: #666;
      }

      .add-prompt-field {
        margin-bottom: 12px;
      }

      .add-prompt-label {
        display: block;
        font-size: 12px;
        color: #666;
        margin-bottom: 6px;
      }

      .add-prompt-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
      }

      .add-prompt-input:focus {
        outline: none;
        border-color: #1890ff;
      }

      .add-prompt-textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
        resize: vertical;
        min-height: 80px;
        font-family: inherit;
      }

      .add-prompt-textarea:focus {
        outline: none;
        border-color: #1890ff;
      }

      .add-prompt-category-select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        font-size: 14px;
        box-sizing: border-box;
        cursor: pointer;
        background: #ffffff;
      }

      .add-prompt-category-select:focus {
        outline: none;
        border-color: #1890ff;
      }

      .add-prompt-submit {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 6px;
        background: #1890ff;
        color: #ffffff;
        font-size: 14px;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .add-prompt-submit:hover {
        background: #40a9ff;
      }

      .add-prompt-submit:disabled {
        background: #d9d9d9;
        cursor: not-allowed;
      }

      /* Empty state with actions */
      .empty-state-actions {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 16px;
      }

      .empty-state-btn {
        padding: 10px 16px;
        border-radius: 6px;
        border: 1px solid #1890ff;
        background: #ffffff;
        cursor: pointer;
        font-size: 14px;
        color: #1890ff;
        transition: background 0.15s ease;
      }

      .empty-state-btn:hover {
        background: #e6f4ff;
      }

      /* Large dataset hint */
      .more-prompts-hint {
        padding: 8px 12px;
        font-size: 12px;
        color: #999;
        text-align: center;
      }
    `}remove(){this.reactRoot&&(this.reactRoot.unmount(),this.reactRoot=null),this.hostElement&&(this.hostElement.remove(),this.hostElement=null),this.shadowRoot=null}isInjected(){return this.hostElement!==null&&document.body.contains(this.hostElement)}}console.log("[Prompt-Script] Content script loaded on:",window.location.href);const J=new be(Ue),_=new Fe;function Ue(i){_.isInjected()&&console.log("[Prompt-Script] Cleaning up existing UI before re-injection"),console.log("[Prompt-Script] Injecting UI near input element"),_.inject(i)}J.start();chrome.runtime.sendMessage({type:R.PING},i=>{if(chrome.runtime.lastError){console.error("[Prompt-Script] Ping failed:",chrome.runtime.lastError.message);return}console.log("[Prompt-Script] Ping response:",i)});chrome.runtime.onMessage.addListener((i,e,o)=>(console.log("[Prompt-Script] Received message:",i.type),i.type===R.GET_STORAGE&&o({success:!0}),!0));window.addEventListener("unload",()=>{J.stop(),_.remove(),console.log("[Prompt-Script] Cleanup complete")});
//# sourceMappingURL=content-script.ts-DR04Zyb7.js.map
