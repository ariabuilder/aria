import type { PublicCommentProjection } from "./schemas";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderPublicCommentSection(input: {
  collectionId: string;
  entryId: string;
  locale: string;
  comments: readonly PublicCommentProjection[];
}): string {
  const target = escapeHtml(JSON.stringify({
    collectionId: input.collectionId,
    entryId: input.entryId,
    locale: input.locale,
  }).replaceAll("<", "\\u003c"));
  const rows = input.comments
    .map(
      (comment) => `<article class="aria-public-comment" data-comment-id="${escapeHtml(comment.id)}">
  <p class="aria-public-comment__meta"><strong>${escapeHtml(comment.authorName)}</strong> <time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(new Date(comment.createdAt).toLocaleDateString())}</time></p>
  <p class="aria-public-comment__body">${escapeHtml(comment.body).replaceAll("\n", "<br>")}</p>
</article>`,
    )
    .join("\n");
  return `<section class="aria-public-comments" aria-labelledby="aria-public-comments-title">
  <h2 id="aria-public-comments-title">Comments</h2>
  <div class="aria-public-comments__list">${rows || "<p>No comments yet.</p>"}</div>
  <form class="aria-public-comments__form" data-aria-public-comment-form data-aria-public-comment-target="${target}">
    <label for="aria-public-comment-body">Add a comment</label>
    <textarea id="aria-public-comment-body" name="body" maxlength="4000" required></textarea>
    <button type="submit">Submit for moderation</button>
    <p aria-live="polite" data-aria-public-comment-status></p>
  </form>
</section>
<script type="module" src="/scripts/aria-public-comments.js"></script>`;
}
