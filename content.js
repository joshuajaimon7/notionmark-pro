// NotionMark Pro - Content Script
// Advanced HTML-to-Markdown conversion, Readability engine, YAML frontmatter, and Reader Cinema Mode

(function () {
  function cleanText(txt) {
    if (!txt) return '';
    return txt.replace(/\s+/g, ' ').trim();
  }

  // Strip UTM and tracking parameters from URLs
  function cleanUrl(rawUrl) {
    try {
      const u = new URL(rawUrl, window.location.href);
      const stripParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
      stripParams.forEach(p => u.searchParams.delete(p));
      return u.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  // HTML to Markdown recursive converter
  function nodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(nodeToMarkdown).join('');

    // Headings
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      return `\n\n${'#'.repeat(level)} ${cleanText(children)}\n\n`;
    }

    // Paragraphs & Divs
    if (tag === 'p') return `\n\n${children.trim()}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n\n---\n\n';

    // Formatting
    if (tag === 'strong' || tag === 'b') return `**${children.trim()}**`;
    if (tag === 'em' || tag === 'i') return `*${children.trim()}*`;
    if (tag === 'del' || tag === 's') return `~~${children.trim()}~~`;

    // Code & Pre
    if (tag === 'code') {
      if (node.parentNode && node.parentNode.tagName.toLowerCase() === 'pre') return children;
      return `\`${children.trim()}\``;
    }
    if (tag === 'pre') {
      const codeEl = node.querySelector('code');
      const lang = codeEl ? (codeEl.className.match(/language-(\w+)/)?.[1] || '') : '';
      return `\n\n\`\`\`${lang}\n${node.textContent.trim()}\n\`\`\`\n\n`;
    }

    // Quotes
    if (tag === 'blockquote') {
      return `\n\n> ${children.trim().replace(/\n/g, '\n> ')}\n\n`;
    }

    // Links
    if (tag === 'a') {
      const href = node.getAttribute('href');
      if (!href) return children;
      return `[${children.trim() || 'Link'}](${cleanUrl(href)})`;
    }

    // Images
    if (tag === 'img') {
      const src = node.getAttribute('src');
      if (!src) return '';
      const alt = node.getAttribute('alt') || 'Image';
      return `\n\n![${alt}](${cleanUrl(src)})\n\n`;
    }

    // Lists
    if (tag === 'ul') return `\n\n${children.trim()}\n\n`;
    if (tag === 'ol') return `\n\n${children.trim()}\n\n`;
    if (tag === 'li') {
      const isOrdered = node.parentNode && node.parentNode.tagName.toLowerCase() === 'ol';
      const prefix = isOrdered ? '1. ' : '- ';
      return `${prefix}${children.trim()}\n`;
    }

    // Tables
    if (tag === 'table') {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return '';

      let mdTable = '\n\n';
      const headerCells = Array.from(rows[0].querySelectorAll('th, td')).map(c => cleanText(c.innerText));
      if (headerCells.length === 0) return '';

      mdTable += `| ${headerCells.join(' | ')} |\n`;
      mdTable += `| ${headerCells.map(() => '---').join(' | ')} |\n`;

      for (let i = 1; i < rows.length; i++) {
        const cells = Array.from(rows[i].querySelectorAll('td')).map(c => cleanText(c.innerText));
        if (cells.length > 0) {
          mdTable += `| ${cells.join(' | ')} |\n`;
        }
      }
      return mdTable + '\n';
    }

    return children;
  }

  // Article Extraction
  function extractArticle() {
    // Detect candidate container
    const candidates = [
      document.querySelector('article'),
      document.querySelector('main'),
      document.querySelector('.post-content, .article-content, #article-body, .entry-content, [role="main"]'),
      document.body
    ].filter(Boolean);

    const target = candidates[0];
    const clone = target.cloneNode(true);

    // Remove unwanted clutter
    const junkSelectors = [
      'nav', 'header', 'footer', 'script', 'style', 'noscript', 'iframe',
      '.ad', '.ads', '.advertisement', '.social-share', '.newsletter-signup',
      '.cookie-banner', '#comments', '.comments', '.sidebar', 'aside'
    ];
    clone.querySelectorAll(junkSelectors.join(',')).forEach(el => el.remove());

    const title = cleanText(document.querySelector('h1')?.innerText || document.title);
    const authorEl = document.querySelector('[rel="author"], .author-name, .byline, meta[name="author"]');
    const author = cleanText(authorEl?.getAttribute?.('content') || authorEl?.innerText || 'Unknown');
    const wordCount = clone.innerText.split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Convert to markdown
    const bodyMarkdown = nodeToMarkdown(clone).replace(/\n{3,}/g, '\n\n').trim();

    // Auto-generate 3 Key Takeaways
    const paragraphs = bodyMarkdown.split('\n\n').filter(p => p.length > 40 && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('```'));
    const takeaways = paragraphs.slice(0, 3).map(p => `• ${p.slice(0, 120).trim()}...`);

    const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
author: "${author}"
source: "${cleanUrl(window.location.href)}"
clipped: "${new Date().toISOString().slice(0, 10)}"
reading_time: "${readingTime} mins"
tags: ["#clipped", "#research"]
---`;

    const summaryBlock = `> **Key Takeaways:**\n> ${takeaways.join('\n> ')}`;

    return {
      title,
      author,
      readingTime: `${readingTime} min read`,
      wordCount,
      frontmatter,
      summaryBlock,
      body: bodyMarkdown,
      fullMarkdown: `${frontmatter}\n\n${summaryBlock}\n\n${bodyMarkdown}`
    };
  }

  // Reader Cinema Mode
  function toggleReaderMode() {
    const existing = document.getElementById('notionmark-reader-overlay');
    if (existing) {
      existing.remove();
      return;
    }

    const data = extractArticle();
    const overlay = document.createElement('div');
    overlay.id = 'notionmark-reader-overlay';

    overlay.innerHTML = `
      <div class="notionmark-reader-content">
        <div class="notionmark-reader-bar">
          <button class="notionmark-reader-close" id="readerCloseBtn">Close (Esc)</button>
          <div class="notionmark-reader-actions">
            <button class="notionmark-reader-action-btn" id="readerCopyBtn">Copy Markdown</button>
            <button class="notionmark-reader-action-btn" id="readerDownloadBtn">Download .md</button>
          </div>
        </div>
        <div style="margin-bottom: 24px;">
          <h1 style="font-size: 28px; font-weight: 700; margin-bottom: 8px;">${data.title}</h1>
          <div style="font-size: 13px; color: #86868b;">${data.author} • ${data.readingTime}</div>
        </div>
        <div style="padding: 16px; background: #121214; border: 1px solid #242426; border-radius: 8px; margin-bottom: 30px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #f5f5f7;">Key Takeaways</div>
          <div style="font-size: 13px; color: #86868b; line-height: 1.6;">${data.summaryBlock.replace(/> \*\*Key Takeaways:\*\*\n>/g, '').replace(/>/g, '<br>')}</div>
        </div>
        <div style="font-size: 15px; color: #d1d5db; line-height: 1.7; white-space: pre-wrap;">${data.body}</div>
      </div>
    `;

    overlay.querySelector('#readerCloseBtn').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#readerCopyBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(data.fullMarkdown).then(() => {
        showToast('Copied full Markdown with frontmatter');
      });
    });
    overlay.querySelector('#readerDownloadBtn').addEventListener('click', () => {
      downloadFile(data.fullMarkdown, `${data.title.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.md`, 'text/markdown');
    });

    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && document.getElementById('notionmark-reader-overlay')) {
        document.getElementById('notionmark-reader-overlay')?.remove();
        document.removeEventListener('keydown', escHandler);
      }
    });

    document.body.appendChild(overlay);
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function showToast(message) {
    const existing = document.getElementById('notionmark-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'notionmark-toast';
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 250);
      }
    }, 2400);
  }

  function showInPagePill() {
    if (document.getElementById('notionmark-pill')) return;
    const pill = document.createElement('div');
    pill.id = 'notionmark-pill';
    pill.innerHTML = `
      <span style="color: #86868b; padding-right: 6px; border-right: 1px solid #242426;">Article</span>
      <button class="notionmark-btn" id="notionmark-clip-btn">Clip Markdown</button>
    `;

    pill.querySelector('#notionmark-clip-btn').addEventListener('click', () => {
      const data = extractArticle();
      navigator.clipboard.writeText(data.fullMarkdown).then(() => {
        showToast('Clipped clean Markdown to clipboard');
      });
    });

    document.body.appendChild(pill);
  }

  setTimeout(() => {
    if (document.querySelector('article, .post-content, #article-body, main')) {
      showInPagePill();
    }
  }, 1200);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXTRACT_ARTICLE') {
      const data = extractArticle();
      sendResponse({ success: true, data });
      return true;
    }
    if (request.type === 'TOGGLE_READER') {
      toggleReaderMode();
      sendResponse({ success: true });
      return true;
    }
  });
})();
