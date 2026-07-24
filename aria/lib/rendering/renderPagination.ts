import { z } from "zod";
import type { BuilderNode } from "../types/nodes";
import {
  PaginationDataSourceSchema,
  PaginationNodePropsSchema,
} from "../cms/resolvePagination";

export const RenderPaginationInputSchema = z
  .object({
    node: z.custom<BuilderNode>(
      (value) => value !== null && typeof value === "object",
    ),
    pagination: PaginationDataSourceSchema,
    currentPage: z.int().positive(),
    totalItems: z.int().nonnegative(),
    perPage: z.int().positive(),
    basePath: z.string().trim().min(1),
  })
  .strict();

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPageHref(
  basePath: string,
  pageParam: string,
  page: number,
): string {
  const url = new URL(basePath, "https://aria.local");
  if (page <= 1) {
    url.searchParams.delete(pageParam);
  } else {
    url.searchParams.set(pageParam, String(page));
  }
  return `${url.pathname}${url.search}`;
}

function renderNumberPagination(input: {
  currentPage: number;
  totalPages: number;
  maxPageButtons: number;
  basePath: string;
  pageParam: string;
  labels: { prev: string; next: string };
}): string {
  if (input.totalPages <= 1) {
    return "";
  }

  const halfWindow = Math.floor(input.maxPageButtons / 2);
  let start = Math.max(1, input.currentPage - halfWindow);
  let end = Math.min(input.totalPages, start + input.maxPageButtons - 1);
  start = Math.max(1, end - input.maxPageButtons + 1);

  const links: string[] = [];
  if (input.currentPage > 1) {
    links.push(
      `<a href="${escapeHtmlText(buildPageHref(input.basePath, input.pageParam, input.currentPage - 1))}" rel="prev">${escapeHtmlText(input.labels.prev)}</a>`,
    );
  }

  for (let page = start; page <= end; page += 1) {
    if (page === input.currentPage) {
      links.push(`<span aria-current="page">${page}</span>`);
    } else {
      links.push(
        `<a href="${escapeHtmlText(buildPageHref(input.basePath, input.pageParam, page))}">${page}</a>`,
      );
    }
  }

  if (input.currentPage < input.totalPages) {
    links.push(
      `<a href="${escapeHtmlText(buildPageHref(input.basePath, input.pageParam, input.currentPage + 1))}" rel="next">${escapeHtmlText(input.labels.next)}</a>`,
    );
  }

  return `<nav aria-label="Pagination">${links.join("")}</nav>`;
}

export function renderPaginationHtml(
  input: z.input<typeof RenderPaginationInputSchema>,
): string {
  const parsed = RenderPaginationInputSchema.parse(input);
  const props = PaginationNodePropsSchema.parse(parsed.node.props ?? {});
  const totalPages = Math.max(
    1,
    Math.ceil(parsed.totalItems / parsed.perPage),
  );
  const labels = props.labels ?? { prev: "Previous", next: "Next" };

  if (props.style === "loadMore") {
    return "";
  }

  if (props.style === "prevNext") {
    const links: string[] = [];
    if (parsed.currentPage > 1) {
      links.push(
        `<a href="${escapeHtmlText(buildPageHref(parsed.basePath, props.pageParam, parsed.currentPage - 1))}" rel="prev">${escapeHtmlText(labels.prev)}</a>`,
      );
    }
    if (parsed.currentPage < totalPages) {
      links.push(
        `<a href="${escapeHtmlText(buildPageHref(parsed.basePath, props.pageParam, parsed.currentPage + 1))}" rel="next">${escapeHtmlText(labels.next)}</a>`,
      );
    }
    if (links.length === 0) {
      return "";
    }
    return `<nav aria-label="Pagination">${links.join("")}</nav>`;
  }

  return renderNumberPagination({
    currentPage: parsed.currentPage,
    totalPages,
    maxPageButtons: props.maxPageButtons,
    basePath: parsed.basePath,
    pageParam: props.pageParam,
    labels,
  });
}
