import { PLACEHOLDER_EXAMPLES, PLACEHOLDER_LOOKUP } from './constants';

export function insertTokenAtCursor(value: string, token: string, start: number, end: number) {
  const prefix = value.slice(0, start);
  const suffix = value.slice(end);
  return `${prefix}${token}${suffix}`;
}

export function renderPreviewText(body: string) {
  return body.replace(/\{[a-zA-Z0-9_]+\}/g, (token) => PLACEHOLDER_EXAMPLES[token] ?? token);
}

export function getUsedPlaceholders(body: string) {
  const matches = body.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
  const unique = Array.from(new Set(matches));
  return unique.filter((token) => PLACEHOLDER_LOOKUP[token]);
}
