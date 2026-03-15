function searchInRoot(root: Document | DocumentFragment | ShadowRoot, target: string, exactMatch: boolean): HTMLElement | null {
  const startNode = root instanceof Document ? root.body : root;
  if (!startNode) return null;
  const walker = document.createTreeWalker(startNode, NodeFilter.SHOW_TEXT);
  let node: Text | null = walker.nextNode() as Text | null;
  while (node) {
    const text = (node.nodeValue || '').trim();
    const isMatch = exactMatch ? text === target : text.includes(target);
    if (isMatch) {
      const el = (node.parentElement as HTMLElement | null) ?? null;
      if (el) return el;
    }
    node = walker.nextNode() as Text | null;
  }
  return null;
}

export function getElementByTextInDocument(doc: Document, searchText: string, exactMatch = false): HTMLElement | null {
  const target = (searchText || '').trim();
  if (!target) return null;
  return searchInRoot(doc, target, exactMatch);
}

export function getElementByText(searchText: string, exactMatch = false): HTMLElement | null {
  const target = (searchText || '').trim();
  if (!target) return null;
  return searchInRoot(document, target, exactMatch);
}

/** 在文档及所有 shadow-root 内查找文本，用于发表按钮等在 shadow 中的元素 */
export function getElementByTextIncludingShadow(searchText: string, exactMatch = false): HTMLElement | null {
  const target = (searchText || '').trim();
  if (!target) return null;

  const found = searchInRoot(document, target, exactMatch);
  if (found) return found;

  const walk = (root: Document | ShadowRoot): HTMLElement | null => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const inShadow = searchInRoot(el.shadowRoot, target, exactMatch);
        if (inShadow) return inShadow;
        const deeper = walk(el.shadowRoot);
        if (deeper) return deeper;
      }
    }
    return null;
  };
  return walk(document);
}