/* popup.js */

(async () => {
  // Shorthand for query
  const $ = (sel) => document.querySelector(sel);

  // Elements
  const $global = $('#globalToggle');
  const $ignore = $('#ignoreSite');
  const $thr = $('#thr');
  const $sel = $('#sel');
  const $save = $('#saveBtn');
  const $domain = $('#domainLabel');
  const $siteSec = $('#siteSection');
  const $disabled = $('#disabledMsg');

  // Active tab + host (handle chrome:// etc.)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try {
    host = new URL(tab.url).hostname.replace(/^www\./, '');
  } catch {
    /* no host */
  }

  // Load stored settings
  const store = await chrome.storage.local.get([
    'llmDetectorEnabled',
    'llmDetectorIgnoredHosts',
    'llmSiteOverrides',
  ]);

  const enabled = store.llmDetectorEnabled !== false;
  const ignored = (store.llmDetectorIgnoredHosts || []).includes(host);
  const overrides = store.llmSiteOverrides || {};
  const siteCfg = overrides[host] || {};

  /* ---------- populate UI ---------- */
  $global.checked = enabled;
  $ignore.checked = ignored;
  $thr.value = siteCfg.threshold ?? '';
  $sel.value = (siteCfg.excludeSelectors || []).join(', ');
  $domain.textContent = host || '(no site)';

  function reflectGlobal() {
    const on = $global.checked;
    $siteSec.style.opacity = on ? '1' : '0.5';
    [...$siteSec.querySelectorAll('input,textarea,button')].forEach(
      (el) => (el.disabled = !on),
    );
    $disabled.style.display = on ? 'none' : 'block';
  }
  reflectGlobal();

  $global.addEventListener('change', async () => {
    await chrome.storage.local.set({ llmDetectorEnabled: $global.checked });
    reflectGlobal();
  });

  /* ---------- save & reload ---------- */
  $save.addEventListener('click', async () => {
    let somethingChanged = false;

    /* 1. global ignore list */
    let ignoreArr = store.llmDetectorIgnoredHosts || [];
    const wasIgnored = ignoreArr.includes(host);
    if ($ignore.checked && !wasIgnored) {
      ignoreArr.push(host);
      somethingChanged = true;
    } else if (!$ignore.checked && wasIgnored) {
      ignoreArr = ignoreArr.filter((h) => h !== host);
      somethingChanged = true;
    }

    /* 2. per‑site overrides */
    const newThr = parseFloat($thr.value);
    const newSel = $sel.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const prevThr = siteCfg.threshold;
    const prevSel = siteCfg.excludeSelectors || [];

    if (!isNaN(newThr) ? newThr !== prevThr : prevThr !== undefined) {
      somethingChanged = true;
      if (!overrides[host]) overrides[host] = {};
      if (!isNaN(newThr)) overrides[host].threshold = newThr;
      else delete overrides[host].threshold;
    }

    if (JSON.stringify(newSel) !== JSON.stringify(prevSel)) {
      somethingChanged = true;
      if (!overrides[host]) overrides[host] = {};
      if (newSel.length) overrides[host].excludeSelectors = newSel;
      else delete overrides[host].excludeSelectors;
    }

    // clean empty object
    if (overrides[host] && Object.keys(overrides[host]).length === 0)
      delete overrides[host];

    /* 3. persist */
    await chrome.storage.local.set({
      llmDetectorIgnoredHosts: ignoreArr,
      llmSiteOverrides: overrides,
    });

    /* 4. reload active tab if something changed and we have a normal URL */
    if (somethingChanged && /^https?:/.test(tab.url)) {
      chrome.tabs.reload(tab.id);
    }

    window.close();
  });
})();
