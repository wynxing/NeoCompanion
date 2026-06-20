<script setup lang="ts">
import { computed } from "vue";
import { marked } from "marked";

interface Props {
  body: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  linkClick: [label: string];
}>();

const WIKI_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

interface WikiLinkToken {
  target: string;
  display: string;
}

const renderedHtml = computed(() => {
  const tokens: WikiLinkToken[] = [];

  const preprocessed = (props.body || "").replace(WIKI_LINK_REGEX, (_match, target: string, display?: string) => {
    const tokenIndex = tokens.length;
    tokens.push({
      target: target.trim(),
      display: (display ?? target).trim(),
    });
    return `__NEO_WIKI_LINK_${tokenIndex}__`;
  });

  const rawHtml = marked.parse(preprocessed, { async: false }) as string;
  const sanitized = sanitizeHtml(rawHtml);

  return sanitized.replace(/__NEO_WIKI_LINK_(\d+)__/g, (_match, index: string) => {
    const token = tokens[Number(index)];
    if (!token) return "";
    const safeTarget = escapeHtml(token.target);
    const safeDisplay = escapeHtml(token.display);
    return `<a class="kw-link" href="#" data-label="${safeTarget}" onclick="event.preventDefault()">${safeDisplay}</a>`;
  });
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "");
}

function handleClick(event: MouseEvent): void {
  const target = (event.target as HTMLElement).closest(".kw-link");
  if (!target) return;
  event.preventDefault();
  const label = target.getAttribute("data-label");
  if (label) {
    emit("linkClick", label);
  }
}
</script>

<template>
  <div class="kw-markdown-preview" v-html="renderedHtml" @click="handleClick" />
</template>
