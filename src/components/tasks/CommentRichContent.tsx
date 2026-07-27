import type { ClipboardEvent, ReactNode } from "react";
import { parseCommentMessage, type MentionUser } from "@/lib/task-comment-mentions";
import {
  dedupeMediaInRichBody,
  getCommentClipboardPayload,
  htmlToFormattedPlainText,
  parseStoredCommentMessage,
  sanitizeRichCommentHtml,
  splitRichBodySegments,
  type CommentMediaRef,
} from "@/lib/rich-comment";
import { CommentMediaBlock } from "@/components/tasks/CommentMediaBlock";
import { cn } from "@/lib/utils";

type BodySegment = ReturnType<typeof splitRichBodySegments>[number];

type RenderBlock =
  | { type: "html"; html: string }
  | { type: "media-grid"; media: CommentMediaRef[] };

function isBlankHtml(html: string) {
  const text = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
  return text.length === 0;
}

/** Collapse consecutive media (images + files) into one uniform 150×150 grid. */
function groupSegmentsForDisplay(segments: BodySegment[]): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  let mediaBuffer: CommentMediaRef[] = [];

  const flushMedia = () => {
    if (mediaBuffer.length === 0) return;
    blocks.push({ type: "media-grid", media: mediaBuffer });
    mediaBuffer = [];
  };

  for (const segment of segments) {
    if (segment.type === "media") {
      if (segment.media.id <= 0) continue;
      mediaBuffer.push(segment.media);
      continue;
    }

    if (isBlankHtml(segment.value)) {
      continue;
    }

    flushMedia();
    blocks.push({ type: "html", html: segment.value });
  }

  flushMedia();
  return blocks;
}

function renderPlainMentions(message: string, mentionUsers: MentionUser[]) {
  const parts = parseCommentMessage(message, mentionUsers);
  const nodes: ReactNode[] = [];

  for (const [index, part] of parts.entries()) {
    if (part.type === "mention") {
      nodes.push(
        <span
          key={`mention-${index}`}
          className="block font-medium text-[#2563EB]"
        >
          {part.name}
        </span>,
      );
      continue;
    }

    if (!part.value) continue;
    nodes.push(
      <span key={`text-${index}`} className="whitespace-pre-wrap break-words">
        {part.value}
      </span>,
    );
  }

  return nodes;
}

function handleCommentCopy(event: ClipboardEvent<HTMLDivElement>, message: string) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;

  let html = "";
  let text = "";

  try {
    const range = selection.getRangeAt(0);
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    html = sanitizeRichCommentHtml(container.innerHTML);
    text = htmlToFormattedPlainText(html);
  } catch {
    const payload = getCommentClipboardPayload(message);
    html = payload.html;
    text = payload.text;
  }

  if (!html && !text) return;

  event.preventDefault();
  event.clipboardData.setData("text/html", html || `<div>${text}</div>`);
  event.clipboardData.setData("text/plain", text);
}

type CommentRichContentProps = {
  message: string;
  mentionUsers: MentionUser[];
  className?: string;
  /** Description/comment layout: text blocks + uniform media grid. */
  inlineMedia?: boolean;
};

export function CommentRichContent({
  message,
  mentionUsers,
  className,
}: CommentRichContentProps) {
  const parsed = parseStoredCommentMessage(message);

  if (!parsed.isRich) {
    return (
      <div
        className={cn("break-words", className)}
        onCopy={(event) => handleCommentCopy(event, message)}
      >
        {renderPlainMentions(message, mentionUsers)}
      </div>
    );
  }

  const segments = splitRichBodySegments(dedupeMediaInRichBody(parsed.body));
  // Always use uniform 150×150 tiles in a wrapping grid (composer + sent comments).
  const blocks = groupSegmentsForDisplay(segments);

  return (
    <div
      className={cn("break-words", className)}
      onCopy={(event) => handleCommentCopy(event, message)}
    >
      {parsed.mentionPrefix ? (
        <div className="mb-2">{renderPlainMentions(parsed.mentionPrefix, mentionUsers)}</div>
      ) : null}

      {blocks.length > 0 ? (
        <div className="rich-comment-content space-y-3 text-sm text-gray-800">
          {blocks.map((block, index) => {
            if (block.type === "html") {
              return (
                <div
                  key={`html-${index}`}
                  className="[&_a]:text-[#2563EB] [&_a]:underline [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeRichCommentHtml(block.html),
                  }}
                />
              );
            }

            return (
              <div
                key={`media-grid-${index}`}
                className="flex flex-wrap gap-2"
              >
                {block.media.map((media) => (
                  <CommentMediaBlock
                    key={`media-${media.id}`}
                    media={media}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
