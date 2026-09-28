// NotionMark Pro - Popup Controller
// Smart Markdown extraction, YAML frontmatter configuration, Obsidian export, and license validation

document.addEventListener('DOMContentLoaded', async () => {
  const statusBar = document.getElementById('statusBar');
  const statusText = document.getElementById('statusText');
  const emptyState = document.getElementById('emptyState');
  const articleView = document.getElementById('articleView');
  const articleTitle = document.getElementById('articleTitle');
  const articleAuthor = document.getElementById('articleAuthor');
  const articleReadingTime = document.getElementById('articleReadingTime');
  const articleWordCount = document.getElementById('articleWordCount');
  const markdownOutput = document.getElementById('markdownOutput');
  const openDemoBtn = document.getElementById('openDemoBtn');

  // Options toggles
  const toggleFrontmatter = document.getElementById('toggleFrontmatter');
  const toggleTakeaways = document.getElementById('toggleTakeaways');

  // Action buttons
  const copyMarkdownBtn = document.getElementById('copyMarkdownBtn');
  const downloadMdBtn = document.getElementById('downloadMdBtn');
  const cinemaBtn = document.getElementById('cinemaBtn');

  // Upgrade Modal
  const upgradeBtn = document.getElementById('upgradeBtn');
  const proUpgradeLink = document.getElementById('proUpgradeLink');
  const upgradeModal = document.getElementById('upgradeModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const startCheckoutBtn = document.getElementById('startCheckoutBtn');
  const proHeaderBadge = document.getElementById('proHeaderBadge');
  const footerBanner = document.getElementById('footerBanner');
  const licenseKeyInput = document.getElementById('licenseKeyInput');
  const activateKeyBtn = document.getElementById('activateKeyBtn');
  const licenseStatus = document.getElementById('licenseStatus');

  let activeArticle = null;
  let isProUser = false;
  let activeTabId = null;
  const FREE_WORD_LIMIT = 350;

  // Check Pro Status
  if (chrome.storage && chrome.storage.local) {
    const data = await chrome.storage.local.get(['notionmark_is_pro', 'notionmark_key']);
    isProUser = !!data.notionmark_is_pro;

    if (isProUser) {
      proHeaderBadge.innerText = 'PRO ACTIVE';
      upgradeBtn.style.display = 'none';
      footerBanner.innerHTML = '<span>Pro License Active</span>';
    }
  }

  function showUpgrade() { upgradeModal.style.display = 'flex'; }
  function hideUpgrade() { upgradeModal.style.display = 'none'; }
  upgradeBtn.addEventListener('click', showUpgrade);
  proUpgradeLink.addEventListener('click', (e) => { e.preventDefault(); showUpgrade(); });
  modalCloseBtn.addEventListener('click', hideUpgrade);

  const CHECKOUT_URL = "https://micro-software-lab.lemonsqueezy.com/checkout/buy/3398b4ef-ca82-4a92-9bd9-af5bf314304c";
  startCheckoutBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: CHECKOUT_URL });
  });

  activateKeyBtn.addEventListener('click', () => {
    const key = (licenseKeyInput.value || '').trim();
    if (key.length < 5) {
      licenseStatus.style.color = '#fca5a5';
      licenseStatus.innerText = 'Please enter a valid license key.';
      return;
    }
    chrome.storage.local.set({ notionmark_is_pro: true, notionmark_key: key }, () => {
      licenseStatus.style.color = '#6ee7b7';
      licenseStatus.innerText = 'License activated successfully.';
      setTimeout(() => location.reload(), 700);
    });
  });

  openDemoBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('demo-test.html') });
  });

  function composeMarkdown() {
    if (!activeArticle) return '';

    let parts = [];
    if (toggleFrontmatter.checked) {
      parts.push(activeArticle.frontmatter);
    }
    if (toggleTakeaways.checked) {
      parts.push(activeArticle.summaryBlock);
    }

    let bodyText = activeArticle.body;
    if (!isProUser && activeArticle.wordCount > FREE_WORD_LIMIT) {
      const words = bodyText.split(/\s+/).slice(0, FREE_WORD_LIMIT).join(' ');
      bodyText = `${words}\n\n[...Free tier preview capped at ${FREE_WORD_LIMIT} words. Upgrade to Pro ($4.99) for full article export.]`;
    }

    parts.push(bodyText);
    return parts.join('\n\n').trim();
  }

  function refreshPreview() {
    markdownOutput.value = composeMarkdown();
  }

  toggleFrontmatter.addEventListener('change', refreshPreview);
  toggleTakeaways.addEventListener('change', refreshPreview);

  // Trigger Cinema Reader on page
  cinemaBtn.addEventListener('click', () => {
    if (!isProUser) {
      showUpgrade();
      return;
    }
    chrome.tabs.sendMessage(activeTabId, { type: 'TOGGLE_READER' });
    window.close();
  });

  // Copy Markdown
  copyMarkdownBtn.addEventListener('click', () => {
    const md = composeMarkdown();
    if (!md) return;
    navigator.clipboard.writeText(md).then(() => {
      const orig = copyMarkdownBtn.innerHTML;
      copyMarkdownBtn.innerHTML = '<span>Copied</span>';
      setTimeout(() => copyMarkdownBtn.innerHTML = orig, 1600);
    });
  });

  // Download .md File for Obsidian
  downloadMdBtn.addEventListener('click', () => {
    if (!isProUser && activeArticle && activeArticle.wordCount > FREE_WORD_LIMIT) {
      showUpgrade();
      return;
    }

    const md = composeMarkdown();
    if (!md) return;
    const filename = `${(activeArticle.title || 'article').slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.md`;
    
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  });

  // Query Active Tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    statusText.innerText = 'Cannot access current tab.';
    emptyState.style.display = 'block';
    return;
  }
  activeTabId = tab.id;

  function requestScan() {
    chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_ARTICLE' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.data || !res.data.body) {
        statusText.innerText = 'No article detected on this page.';
        emptyState.style.display = 'block';
        return;
      }

      activeArticle = res.data;
      articleTitle.innerText = activeArticle.title;
      articleAuthor.innerText = activeArticle.author;
      articleReadingTime.innerText = activeArticle.readingTime;
      articleWordCount.innerText = `${activeArticle.wordCount} words`;

      statusText.innerText = 'Article parsed & formatted';
      emptyState.style.display = 'none';
      articleView.style.display = 'flex';
      refreshPreview();
    });
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content.css']
    });
    requestScan();
  } catch (err) {
    requestScan();
  }
});
