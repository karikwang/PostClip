const el = id => document.getElementById(id);
const key = location.hash.slice(1);
let draft, config, localURL, saving = false;

function defaultTitle(draft) {
  const title = draft.title || draft.url;
  const url = new URL(draft.url);
  const isPost = /(^|\.)instagram\.com$/i.test(url.hostname) &&
    (draft.reel || /^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/[\w-]+\/?$/i.test(url.pathname));
  if (!isPost) return title;

  // Instagram localizes the byline, while the caption can itself contain quotes and colons.
  const text = title.trim();
  const wrapper = /^([^\r\n]*?)[:：]\s*(["“„”«‹‘「『])/u.exec(text);
  let caption = text;
  if (wrapper && /instagram/i.test(wrapper[1])) {
    const endings = {'"':'"', '“':'”', '„':'“”', '”':'”', '«':'»', '‹':'›', '‘':'’', '「':'」', '『':'』'};
    if (endings[wrapper[2]].includes(text.slice(-1))) {
      caption = text.slice(wrapper[0].length, -1).trim();
    }
  }
  return caption.replace(/\s*[\r\n]\s*/gu, ' ');
}

async function api(c,path,method='GET',body) {
  const headers={'Authorization':'Bearer '+c.token,'Notion-Version':'2026-03-11'};
  if(body && !(body instanceof FormData)) {
    headers['Content-Type']='application/json';
    body=JSON.stringify(body);
  }
  const response=await fetch('https://api.notion.com/v1'+path,{method,headers,body,redirect:'error'});
  const data=await response.json();
  if(!response.ok) throw Error('Notion '+response.status+' · '+(data.message||'请求失败'));
  return data;
}
function update(){
  el('save').disabled=saving || !(config && draft?.url && !draft.saved && (el('file').files[0]||el('choice').value));
}
function preview(){
  if(localURL) URL.revokeObjectURL(localURL);
  const file=el('file').files[0];
  localURL=file ? URL.createObjectURL(file) : '';
  const url=localURL||el('choice').value;
  el('preview').hidden=!url;
  if(url) {
    if(!draft?.saved && !saving) el('status').textContent='';
    el('preview').src=url;
  } else el('preview').removeAttribute('src');
  update();
}
el('file').onchange=preview;
el('choice').onchange=()=>{el('file').value='';preview();};
el('preview').onerror=()=>{
  if(!saving && !draft?.saved) el('status').textContent='图片无法预览，请回到帖子重新读取封面，或选择本地图片。';
};
el('bind').onclick=async()=>{
  try{
    const c={token:el('token').value.trim()||config?.token,id:el('ds').value.trim()};
    if(!c.token||!/^([a-f\d]{32}|[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(c.id)) throw Error('请填写令牌和数据源 ID。');
    const ds=await api(c,'/data_sources/'+c.id);
    const props=Object.values(ds.properties);
    const find=(type,name)=>props.find(p=>p.type===type&&p.name===name)|| (props.filter(p=>p.type===type).length===1 && props.find(p=>p.type===type));
    const title=find('title'),link=find('url','Instagram 链接'),image=find('files','封面');
    if(!title||!link||!image) throw Error('请添加 URL 属性「Instagram 链接」和文件与媒体属性「封面」，再点验证。');
    Object.assign(c,{title:title.id,link:link.id,image:image.id,name:ds.title.map(t=>t.plain_text).join('')});
    await chrome.storage.local.set({config:c});
    config=c;el('token').value='';el('binding').textContent='已绑定 '+c.name;update();
  }catch(e){el('binding').textContent=e.message;}
};
el('forget').onclick=async()=>{await chrome.storage.local.remove('config');config=null;el('token').value='';el('ds').value='';el('binding').textContent='已解除绑定';update();};
async function save(){
  const c=config,title=el('title').value.trim();
  if(!title) throw Error('请填写标题。');
  let blob=el('file').files[0];
  if(!blob && draft.frame && el('choice').value===draft.frame) {
    blob=await (await fetch(draft.frame)).blob();
  }
  if(!blob){
    const url=new URL(el('choice').value);
    const granted=await chrome.permissions.request({origins:[url.origin+'/*']});
    if(!granted) throw Error('读取封面需要此图片域名的权限，也可以选择本地图片。');
    const response=await fetch(url.href,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    if(!response.ok) throw Error('封面下载失败，请换图或选本地图片。');
    blob=await response.blob();
  }
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[blob.type];
  if(!ext||!blob.size||blob.size>=5000000) throw Error('请选择小于 5 MB 的 JPG、PNG 或 WebP 图片。');
  const filename='cover.'+ext;
  const upload=await api(c,'/file_uploads','POST',{filename,content_type:blob.type});
  const form=new FormData();form.append('file',blob,filename);
  const sent=await api(c,'/file_uploads/'+upload.id+'/send','POST',form);
  if(sent.status!=='uploaded')throw Error('图片尚未上传完成。');
  const page=await api(c,'/pages','POST',{parent:{type:'data_source_id',data_source_id:c.id},properties:{
    [c.title]:{title:[{text:{content:title}}]},[c.link]:{url:draft.url},
    [c.image]:{files:[{name:filename,type:'file_upload',file_upload:{id:upload.id}}]}
  }});
  draft.saved=page.url;
  showSaved();
  await chrome.storage.session.set({[key]:draft});
}
function showSaved(){el('status').textContent='已保存到 Notion';el('result').href=draft.saved;el('result').hidden=false;}
el('save').onclick=async()=>{
  if(saving || draft?.saved) return;
  saving=true;el('save').disabled=true;el('status').textContent='正在保存…';
  try{await save();}catch(e){el('status').textContent=e.message;}finally{saving=false;update();}
};
async function init(){
  draft=(await chrome.storage.session.get(key))[key];
  config=(await chrome.storage.local.get('config')).config;
  el('settings').open=!config;
  if(config){el('ds').value=config.id;el('binding').textContent='已绑定 '+config.name;}
  if(!draft?.url){el('status').textContent=draft?.error||'请回到原网页重新点扩展。';return;}
  el('source').textContent=draft.url;el('title').value=defaultTitle(draft).slice(0,1800);
  if(draft.frame) el('choice').add(new Option('当前可见画面（截图）',draft.frame));
  draft.urls.forEach((url,i)=>el('choice').add(new Option(draft.reel ? 'Instagram Reel 封面' : '候选图片 '+(i+1),url)));
  if(!draft.frame && !draft.urls.length)el('status').textContent=draft.reel
    ? 'Instagram 未返回这条 Reel 的封面。可重新打开帖子后再试，或选择本地封面。'
    : '当前页面没有可用的候选图片，请选本地封面。';
  preview();if(draft.saved)showSaved();
}
init().catch(e=>el('status').textContent=e.message);
