for (const form of document.querySelectorAll('[data-aria-public-comment-form]')) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const textarea = form.querySelector('textarea[name="body"]');
    const status = form.querySelector('[data-aria-public-comment-status]');
    if (!(textarea instanceof HTMLTextAreaElement) || !status) return;
    let target;
    try {
      target = JSON.parse(form.dataset.ariaPublicCommentTarget ?? '');
    } catch {
      status.textContent = 'Unable to submit comment';
      return;
    }
    const idempotencyKey = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    status.textContent = 'Submitting…';
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...target, body: textarea.value, idempotencyKey }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to submit comment');
      textarea.value = '';
      status.textContent = 'Thanks — your comment is awaiting moderation.';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Unable to submit comment';
    }
  });
}
