const DEFAULT_THRESHOLD = 0.5;

async function loadSiteConfig() {
  try {
    const response = await fetch(chrome.runtime.getURL('site_config.json'));
    return await response.json();
  } catch (err) {
    console.error('Failed to load site_config.json:', err);
    return { default: { threshold: DEFAULT_THRESHOLD } };
  }
}

(async function init() {
  /* ------------------------------ setup ------------------------------ */
  const defaults = await loadSiteConfig();
  const { llmSiteOverrides = {} } = await chrome.storage.local.get('llmSiteOverrides');
  const SITE_CONFIG = { ...defaults, ...llmSiteOverrides };

  const host = window.location.hostname.replace(/^www\./, '');
  const siteThreshold = (SITE_CONFIG[host] || SITE_CONFIG.default).threshold;
  const MIN_LENGTH = 20;

  const { llmDetectorEnabled, llmDetectorIgnoredHosts } = await chrome.storage.local.get({
    llmDetectorEnabled: true,
    llmDetectorIgnoredHosts: []
  });
  if (!llmDetectorEnabled || llmDetectorIgnoredHosts.includes(host)) return;

  /* -------------------------- helper functions ----------------------- */
  const isTypable = ch => {
    const c = ch.charCodeAt(0);
    return (
      c === 9 || c === 10 || c === 13 ||                    // tab / NL / CR
      (c >= 32 && c <= 126)   ||                            // basic ASCII
      (c >= 160 && c <= 255)  ||                            // Latin‑1 accents
      [0x20AC, 0x00A3, 0x00A5, 0x00A2].includes(c)          // €, £, ¥, ¢
    );
  };

  const untypableRatio = txt => txt.length
    ? [...txt].filter(ch => !isTypable(ch)).length * 100 / txt.length
    : 0;

  const isVisible = el => {
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && el.offsetHeight > 0;
  };

  const isEditing = () => {
    const a = document.activeElement;
    return a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/i.test(a.tagName));
  };

  /* ------------------------------ styles ----------------------------- */
  const style = document.createElement('style');
  style.textContent = `.llm-detected{background:rgba(255,0,0,.06);text-decoration-line:underline;text-decoration-style:dotted;text-decoration-color:#c00;cursor:help}`;
  document.head.appendChild(style);

  /* ----------------------- detection pipeline ----------------------- */
  function highlightBlocks() {
    if (isEditing()) return; // never scan while user is typing

    const candidates = document.querySelectorAll(
      'p, li, blockquote, div, h1, h2, h3, h4, h5, h6, span:not(:empty)'
    );

    for (const el of candidates) {
      // hierarchy / visibility filters
      if (
        el.classList.contains('llm-detected') ||                // already flagged
        !isVisible(el) ||                                       // invisible
        !el.innerText || el.innerText.trim().length < MIN_LENGTH || // too small
        el.innerText.split(/\s+/).length < 10 ||                // <10 words (UI bits)
        (el.tagName === 'DIV' &&                                // wrapper DIV with blocks
         el.querySelector('p, li, blockquote, h1, h2, h3, h4, h5, h6'))
      ) {
        continue;
      }

      // class / role based skip
      if (/(meta|timestamp|icon|badge|label|control|button)/i.test(el.className || '')) continue;
      if (el.closest('[role="button"], nav, header, footer')) continue;

      // site‑specific skips
      if ((SITE_CONFIG[host]?.excludeSelectors || []).some(sel => el.matches(sel) || el.closest(sel))) continue;

      // avoid double‑flag within ancestor chain
      if (el.closest('.llm-detected')) continue;

      const raw  = el.textContent || '';
      const ratio = untypableRatio(raw);
      if (ratio > siteThreshold) {
        el.classList.add('llm-detected');
        const bad = [...new Set([...raw].filter(ch => !isTypable(ch)))].slice(0,10)
          .map(ch => `"${ch}" (U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0')})`)
          .join(', ');
        el.title = `LLM‑like: ${ratio.toFixed(2)}% untypable. Found: ${bad}`;
      }
    }
  }

  highlightBlocks();
  for (let i=1;i<=5;i++) setTimeout(highlightBlocks, 300*i);

  const mo = new MutationObserver(() => {
    clearTimeout(mo._t); mo._t = setTimeout(highlightBlocks, 200);
  });
  mo.observe(document.body,{childList:true,subtree:true,characterData:true});

  /* ------------------------ fix‑button overlay ----------------------- */
  const REPLACEMENTS = { /* … full mapping (unchanged) … */ };
  function replaceUntypeable(t){return[...t].map(ch=>isTypable(ch)?ch:REPLACEMENTS[ch]??ch.normalize('NFKD').replace(/[^\x00-\x7F]/g,'')).join('');}

  function addFixButtons(){
    const inputs = document.querySelectorAll('textarea, [contenteditable="true"]');
    inputs.forEach(input=>{
      if(input.classList.contains('untypeable-checked')) return;

      // skip tiny areas
      if(input.matches('textarea')){
        const rows=parseInt(input.getAttribute('rows')||'0',10);
        if((rows&&rows<=2)||input.offsetHeight<60) return;
      }
      if(input.isContentEditable && input.offsetHeight<60 && input.offsetWidth<200) return;

      input.classList.add('untypeable-checked');

      const anchor = input.parentElement;
      if(getComputedStyle(anchor).position==='static') anchor.style.position='relative';

      const btn=document.createElement('button');
      btn.textContent='🧹';
      btn.title='Fix untypable characters';
      btn.type='button';
      Object.assign(btn.style,{
        position:'absolute',top:'2px',right:'2px',fontSize:'0.7em',padding:'2px 4px',
        border:'1px solid #ccc',background:'#eee',cursor:'pointer',zIndex:1000
      });

      btn.onclick=()=>{
        if(input.isContentEditable){input.innerText=replaceUntypeable(input.innerText);}else{input.value=replaceUntypeable(input.value);}        
        if(document.activeElement===input){input.dispatchEvent(new Event('input',{bubbles:true}));}
        btn.remove();
      };
      anchor.appendChild(btn);
    });
  }
  addFixButtons();
  setInterval(addFixButtons,3000);
})();
