async function inspectPage() {
  // Chrome serializes this function when injecting it into the active tab.
  const current = new URL(location.href);
  const isInstagram = host => /(^|\.)instagram\.com$/i.test(host);
  const meta = (doc, name) => doc.querySelector('meta[property="' + name + '"]')?.content;
  const secureImage = value => typeof value === 'string' && /^https:\/\//i.test(value);
  const visible = el => {
    const r = el.getBoundingClientRect();
    return r.width > 90 && r.height > 80 && r.right > 0 && r.left < innerWidth &&
      r.bottom > 0 && r.top < innerHeight;
  };

  function postAt(value) {
    if (!value) return null;
    try {
      const url = new URL(value, current.origin);
      if (!isInstagram(url.hostname) || url.protocol !== 'https:') return null;
      const parts = url.pathname.match(/^\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)\/?$/i);
      if (parts) return {kind:parts[1].toLowerCase(), code:parts[2], url:url.origin + url.pathname};
    } catch { /* A malformed page link cannot identify the post. */ }
    return null;
  }

  function metadata(doc, post) {
    const identity = postAt(meta(doc, 'og:url') || doc.querySelector('link[rel~="canonical"]')?.getAttribute('href'));
    if (identity?.code !== post.code) return null;
    const image = [meta(doc, 'og:image:secure_url'), meta(doc, 'og:image')].find(secureImage);
    return {kind:identity.kind, image, title:meta(doc, 'og:title')};
  }

  // A bare Reels feed can expose an individual permalink beside the active video.
  function feedPost() {
    const videos = [...document.querySelectorAll('video')].filter(visible);
    const area = video => {
      const r = video.getBoundingClientRect();
      return (Math.min(innerHeight,r.bottom)-Math.max(0,r.top)) *
        (Math.min(innerWidth,r.right)-Math.max(0,r.left));
    };
    videos.sort((a,b) => area(b)-area(a));
    if (!videos.length || (videos[1] && area(videos[0]) === area(videos[1]))) return null;
    for (let group = videos[0].parentElement; group && group !== document.body; group = group.parentElement) {
      if (group.querySelectorAll('video').length > 1) break;
      const links = [...group.querySelectorAll('a[href]')].filter(a => a.contains(videos[0]) || a.querySelector('time'));
      const posts = links.map(a => postAt(a.href)).filter(Boolean);
      if (posts.length) return posts.every(p => p.code === posts[0].code) ? posts[0] : null;
    }
    return null;
  }

  const instagram = isInstagram(current.hostname);
  const feed = instagram && /^\/reels?\/?$/i.test(current.pathname);
  const post = instagram && (postAt(current.href) || (feed && feedPost()));
  if (feed && !post) return {error:'请打开当前 Reel 的分享链接，再点 PostClip，以便识别这条视频的封面。'};

  let info = post ? metadata(document, post) : null;
  if (post && !info?.image) {
    // Client-side navigation can leave the previous post's metadata in the live document.
    const kind = post.kind === 'reels' ? 'reel' : post.kind;
    try {
      const response = await fetch('/' + kind + '/' + post.code + '/', {
        credentials:'omit', mode:'same-origin', cache:'no-store', signal:AbortSignal.timeout(6500)
      });
      if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
        const html = await response.text();
        const end = html.search(/<\/head\s*>/i);
        const doc = new DOMParser().parseFromString(end < 0 ? html : html.slice(0, end), 'text/html');
        info = metadata(doc, post) || info;
      }
    } catch { /* A matching card in the current page can still supply the cover. */ }
  }
  if (current.pathname !== location.pathname || (feed && feedPost()?.code !== post.code)) {
    return {error:'当前帖子已切换，请在要收藏的 Reel 上再点一次 PostClip。'};
  }

  if (post && (feed || post.kind.startsWith('reel') || info?.kind.startsWith('reel'))) {
    let image = info?.image;
    if (!image) {
      const cards = [...document.querySelectorAll('a[href]')].filter(a => postAt(a.href)?.code === post.code);
      for (const card of cards) {
        const tile = card.querySelector('[style*="background-image"]');
        const background = tile?.style.backgroundImage.match(/^url\(["']?(https:\/\/.*?)["']?\)$/i)?.[1];
        const img = card.querySelector('img');
        image = [background, img?.currentSrc || img?.src].find(secureImage);
        if (image) break;
      }
    }
    return {
      url:feed ? post.url : current.href,
      title:info?.title || document.querySelector('h1')?.innerText || document.title,
      reel:true, urls:image ? [image] : []
    };
  }

  const root = document.querySelector('[role="dialog"] article, [role="dialog"]') ||
    document.querySelector('article') || document.querySelector('main') || document.body;
  const nodes = [...root.querySelectorAll('img, video')].filter(visible)
    .sort((a,b) => b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight);
  const inline = nodes.map(el => el.tagName === 'VIDEO' ? el.poster : el.currentSrc || el.src);
  const samePage = !instagram || meta(document,'og:url')?.split(/[?#]/)[0].replace(/\/$/,'') ===
    current.href.split(/[?#]/)[0].replace(/\/$/,'');
  const og = info?.image || (samePage && meta(document,'og:image'));
  const urls = [...new Set([og, ...inline].filter(secureImage))].slice(0,16);
  const target = nodes.find(el => {
    const r = el.getBoundingClientRect();
    return r.width >= 180 && r.height >= 120;
  });
  let crop;
  if (instagram && target) {
    const r = target.getBoundingClientRect();
    crop = {left:Math.max(0,r.left)/innerWidth, top:Math.max(0,r.top)/innerHeight,
      right:Math.min(innerWidth,r.right)/innerWidth, bottom:Math.min(innerHeight,r.bottom)/innerHeight};
  }
  return {crop,url:current.href,title:info?.title || (samePage && meta(document,'og:title')) ||
    root.querySelector('h1')?.innerText || document.title,urls};
}
async function visibleCover(tab, crop) {
  const active = async () => (await chrome.tabs.query({active:true,windowId:tab.windowId}))[0]?.id === tab.id;
  if (!await active()) return;
  const shot = await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});
  if (!await active()) return;
  const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
  try {
    const x = Math.round(crop.left*bitmap.width), y = Math.round(crop.top*bitmap.height);
    const w = Math.round(crop.right*bitmap.width)-x, h = Math.round(crop.bottom*bitmap.height)-y;
    if (w < 80 || h < 80) return;
    const scale = Math.min(1,960/Math.max(w,h));
    const canvas = new OffscreenCanvas(Math.round(w*scale),Math.round(h*scale));
    canvas.getContext('2d').drawImage(bitmap,x,y,w,h,0,0,canvas.width,canvas.height);
    const blob = await canvas.convertToBlob({type:'image/jpeg',quality:0.86});
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } finally {bitmap.close();}
}
chrome.action.onClicked.addListener(async tab => {
  let draft;
  try {
    const [entry] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:inspectPage});
    draft = entry.result;
    if (draft.crop) {
      try { draft.frame = await visibleCover(tab,draft.crop); } catch { /* Keep URL candidates. */ }
    }
  } catch { draft = {error:'请在已打开的 HTTPS 网页上点击扩展。'}; }
  const key = crypto.randomUUID();
  await chrome.storage.session.set({[key]:draft});
  const editor = await chrome.tabs.create({url:chrome.runtime.getURL('clip.html#'+key)});
  await chrome.storage.session.set({['editor-'+editor.id]:key});
});

chrome.tabs.onRemoved.addListener(async id=>{
  const ref='editor-'+id;
  const key=(await chrome.storage.session.get(ref))[ref];
  if(key) await chrome.storage.session.remove([ref,key]);
});
