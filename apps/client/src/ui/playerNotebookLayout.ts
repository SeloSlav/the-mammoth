import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import { UI_FONT_NOTEBOOK } from "@the-mammoth/ui-theme";
import {
  NOTEBOOK_OWNER,
  PLAYER_NOTEBOOK_PAGES,
  type PlayerNotebookSection,
} from "./playerNotebookTipsContent";

/** Matches ruled line height in {@link MammothNotebookTipsHud}. */
export const NOTEBOOK_RULE_STEP_PX = 32;

/** Body lines that fit in the fixed content pane (no scrollbar). */
export const NOTEBOOK_CONTENT_LINES_PER_PAGE = 16;

/** Notebook shell width — keep in sync with `MammothNotebookTipsHud`. */
export const NOTEBOOK_SHELL_WIDTH_PX = 540;
export const NOTEBOOK_SPINE_WIDTH_PX = 38;
export const NOTEBOOK_CONTENT_PAD_LEFT_PX = 64;
export const NOTEBOOK_CONTENT_PAD_RIGHT_PX = 28;
export const NOTEBOOK_BULLET_INDENT_PX = 18;

export const NOTEBOOK_TEXT_WIDTH_PX =
  NOTEBOOK_SHELL_WIDTH_PX -
  NOTEBOOK_SPINE_WIDTH_PX -
  NOTEBOOK_CONTENT_PAD_LEFT_PX -
  NOTEBOOK_CONTENT_PAD_RIGHT_PX;

export const NOTEBOOK_BULLET_TEXT_WIDTH_PX =
  NOTEBOOK_TEXT_WIDTH_PX - NOTEBOOK_BULLET_INDENT_PX;

const FONT_FAMILY = UI_FONT_NOTEBOOK;

export const NOTEBOOK_FONT_REF_HEADING = `400 24px ${FONT_FAMILY}`;
export const NOTEBOOK_FONT_REF_BULLET = `400 20px ${FONT_FAMILY}`;
export const NOTEBOOK_FONT_DIARY_DATE = `400 18px ${FONT_FAMILY}`;
export const NOTEBOOK_FONT_DIARY_HEADING = `400 26px ${FONT_FAMILY}`;
export const NOTEBOOK_FONT_DIARY_BODY = `400 20px ${FONT_FAMILY}`;
export const NOTEBOOK_FONT_DIVIDER = `400 20px ${FONT_FAMILY}`;

export type NotebookLayoutBlock =
  | { type: "ref-heading"; text: string }
  | { type: "ref-heading-rule" }
  | { type: "ref-bullet"; text: string }
  | { type: "diary-divider-bar" }
  | { type: "diary-divider-label"; text: string }
  | { type: "diary-date"; text: string }
  | { type: "diary-heading"; text: string }
  | { type: "diary-line"; text: string };

/** One layout block = exactly one ruled row in the HUD. */
export function blockLineCount(_block: NotebookLayoutBlock): number {
  return 1;
}

function wrapTextLines(text: string, font: string, maxWidth: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const prepared = prepareWithSegments(trimmed, font);
  const { lines } = layoutWithLines(prepared, maxWidth, NOTEBOOK_RULE_STEP_PX);
  return lines.map((line) => line.text);
}

function pushWrappedLines(
  blocks: NotebookLayoutBlock[],
  type: "ref-bullet" | "diary-line",
  text: string,
  font: string,
  maxWidth: number,
): void {
  for (const line of wrapTextLines(text, font, maxWidth)) {
    blocks.push({ type, text: line });
  }
}

function flattenSection(section: PlayerNotebookSection, showDiaryDivider: boolean): NotebookLayoutBlock[] {
  const blocks: NotebookLayoutBlock[] = [];

  if (showDiaryDivider) {
    blocks.push({ type: "diary-divider-bar" });
    blocks.push({ type: "diary-divider-label", text: "private pages" });
  }

  if (section.kind === "reference") {
    for (const line of wrapTextLines(section.heading, NOTEBOOK_FONT_REF_HEADING, NOTEBOOK_TEXT_WIDTH_PX)) {
      blocks.push({ type: "ref-heading", text: line });
    }
    blocks.push({ type: "ref-heading-rule" });
    for (const line of section.lines) {
      pushWrappedLines(blocks, "ref-bullet", line, NOTEBOOK_FONT_REF_BULLET, NOTEBOOK_BULLET_TEXT_WIDTH_PX);
    }
    return blocks;
  }

  if (section.dateLabel) {
    for (const line of wrapTextLines(section.dateLabel, NOTEBOOK_FONT_DIARY_DATE, NOTEBOOK_TEXT_WIDTH_PX)) {
      blocks.push({ type: "diary-date", text: line });
    }
  }

  for (const line of wrapTextLines(section.heading, NOTEBOOK_FONT_DIARY_HEADING, NOTEBOOK_TEXT_WIDTH_PX)) {
    blocks.push({ type: "diary-heading", text: line });
  }

  for (const paragraph of section.lines) {
    pushWrappedLines(blocks, "diary-line", paragraph, NOTEBOOK_FONT_DIARY_BODY, NOTEBOOK_TEXT_WIDTH_PX);
    blocks.push({ type: "diary-line", text: "" });
  }

  const last = blocks.at(-1);
  if (last?.type === "diary-line" && last.text === "") {
    blocks.pop();
  }

  return blocks;
}

export function flattenNotebookSections(): NotebookLayoutBlock[] {
  const blocks: NotebookLayoutBlock[] = [];
  for (let i = 0; i < PLAYER_NOTEBOOK_PAGES.length; i++) {
    const section = PLAYER_NOTEBOOK_PAGES[i]!;
    const prev = i > 0 ? PLAYER_NOTEBOOK_PAGES[i - 1]! : null;
    const showDiaryDivider = section.kind === "diary" && prev?.kind === "reference";
    blocks.push(...flattenSection(section, showDiaryDivider));
  }
  return blocks;
}

/** Split wrapped blocks across fixed-height pages without mid-line breaks. */
export function paginateNotebookBlocks(
  blocks: readonly NotebookLayoutBlock[],
  linesPerPage: number = NOTEBOOK_CONTENT_LINES_PER_PAGE,
): NotebookLayoutBlock[][] {
  const pages: NotebookLayoutBlock[][] = [];
  let current: NotebookLayoutBlock[] = [];
  let usedLines = 0;

  const flush = () => {
    if (current.length > 0) pages.push(current);
    current = [];
    usedLines = 0;
  };

  for (const block of blocks) {
    const cost = blockLineCount(block);
    if (cost > linesPerPage) {
      flush();
      pages.push([block]);
      continue;
    }
    if (usedLines + cost > linesPerPage && current.length > 0) flush();
    current.push(block);
    usedLines += cost;
  }

  flush();
  return pages.length > 0 ? pages : [[]];
}

export type NotebookSpread =
  | {
      /** Cover page with owner name + date. */
      cover: true;
    }
  | {
      cover: false;
      blocks: readonly NotebookLayoutBlock[];
    };

export function buildNotebookSpreads(
  linesPerPage: number = NOTEBOOK_CONTENT_LINES_PER_PAGE,
): NotebookSpread[] {
  const contentPages = paginateNotebookBlocks(flattenNotebookSections(), linesPerPage);
  return [{ cover: true }, ...contentPages.map((blocks) => ({ cover: false as const, blocks }))];
}

export function notebookSpreadCount(spreads: readonly NotebookSpread[]): number {
  return spreads.length;
}

export { NOTEBOOK_OWNER };
