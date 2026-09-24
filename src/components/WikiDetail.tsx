import type { ReactNode } from "react";
import { useStoryDetails, useTaskDetail } from "../lib/data";
import type { WikiBlock, WikiLine, WikiQuestItem } from "../types";

const WIKI = "https://escapefromtarkov.fandom.com/wiki/";

export const wikiUrl = (title: string) => `${WIKI}${encodeURIComponent(title.replace(/ /g, "_"))}`;

/**
 * A task's objectives, rewards, quest items and guide, as the wiki states them.
 *
 * The game-data feed carries objectives only where they have a map position,
 * so a hand-in, a kill count or a skill task had nothing to say about what it
 * actually asks. This fills that in for every task the wiki covers.
 */
export default function TaskDetails({
  taskId,
  compact = false,
}: {
  taskId: string;
  /** Tighter spacing, and the guide starts closed, for the map's side panel. */
  compact?: boolean;
}) {
  const detail = useTaskDetail(taskId);

  if (detail === undefined) {
    return <p className="text-[0.72rem] faint">Loading objectives and rewards…</p>;
  }
  if (!detail) return null;

  return (
    <div className={compact ? "wiki-detail wiki-detail-compact" : "wiki-detail"}>
      {detail.requirements.length > 0 && (
        <Part title="To start">
          <PlainLines text={detail.requirements.join("\n")} />
        </Part>
      )}

      {detail.objectives.length > 0 && (
        <Part title="Objectives">
          <Lines lines={detail.objectives} />
        </Part>
      )}

      {detail.items.length > 0 && (
        <Part title="Items">
          <ItemRows items={detail.items} />
        </Part>
      )}

      {detail.rewards.length > 0 && (
        <Part title="Rewards">
          <Lines lines={detail.rewards} />
        </Part>
      )}

      {detail.guide.length > 0 && (
        <details className="wiki-guide" open={!compact}>
          <summary>Guide</summary>
          <Blocks blocks={detail.guide} />
        </details>
      )}

      <WikiCredit title={detail.title} />
    </div>
  );
}

export function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="wiki-part">
      <h3 className="kicker">{title}</h3>
      {children}
    </section>
  );
}

/** A wiki list, nested items indented and optional ones marked. */
export function Lines({ lines }: { lines: WikiLine[] }) {
  return (
    <ul className="wiki-lines">
      {lines.map((line, i) => (
        <li key={i} data-depth={Math.min(line.depth, 3)}>
          {line.optional && <span className="chip mr-1.5">Optional</span>}
          {line.text}
        </li>
      ))}
    </ul>
  );
}

function ItemRows({ items }: { items: WikiQuestItem[] }) {
  return (
    <ul className="wiki-items">
      {items.map((item, i) => (
        <li key={`${item.name}-${i}`}>
          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="font-medium">{item.name}</span>
            {item.amount != null && <span className="tabular-nums faint">×{item.amount}</span>}
            {item.foundInRaid && <span className="chip chip-accent">Found in raid</span>}
            {item.requirement && <span className="faint">· {item.requirement}</span>}
          </p>
          {item.notes && <p className="mt-0.5 whitespace-pre-line text-meta">{item.notes}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Text the scraper flattened to lines, with its "•" / "◦" list markers. */
export function PlainLines({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((para, i) => {
        const lines = para.split("\n").filter(Boolean);
        const listy = lines.every((l) => /^[•◦] /.test(l));
        if (listy) {
          return (
            <ul key={i} className="wiki-lines">
              {lines.map((l, j) => (
                <li key={j} data-depth={l.startsWith("◦") ? 2 : 1}>
                  {l.slice(2)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="wiki-para">
            {lines.map((l, j) => (
              <span key={j} className="block">
                {l}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

export function Blocks({ blocks }: { blocks: WikiBlock[] }) {
  return (
    <div className="wiki-blocks">
      {blocks.map((block, i) => (
        <div key={i}>
          {block.heading && <h4 className="wiki-block-head">{block.heading}</h4>}
          <PlainLines text={block.text} />
        </div>
      ))}
    </div>
  );
}

export function WikiCredit({ title }: { title: string }) {
  return (
    <p className="wiki-credit">
      From the{" "}
      <a href={wikiUrl(title)} target="_blank" rel="noreferrer noopener" className="underline">
        Escape from Tarkov Wiki
      </a>{" "}
      · CC BY-SA
    </p>
  );
}

/**
 * A story chapter's page from the wiki: how it starts, every objective grouped
 * by path, rewards, and the guide. The site's own chapter data keeps only the
 * steps that decide an ending; this is the rest.
 */
export function ChapterWiki({ title }: { title: string }) {
  const details = useStoryDetails();
  const chapter = details.data?.chapters[title];
  if (!chapter) return null;
  const objectiveCount = chapter.objectives.reduce((n, g) => n + g.items.length, 0);

  return (
    <details className="wiki-guide mt-3 surface-2 px-2.5 py-2">
      <summary>
        Full chapter from the wiki · {objectiveCount} objectives
      </summary>
      <div className="wiki-detail wiki-detail-compact">
        {chapter.start && (
          <Part title="How it starts">
            <PlainLines text={chapter.start} />
          </Part>
        )}
        {chapter.objectives.length > 0 && (
          <Part title="Objectives">
            {chapter.objectives.map((group, i) => (
              <div key={i} className={i ? "mt-2" : undefined}>
                {group.heading && <h4 className="wiki-block-head">{group.heading}</h4>}
                <Lines lines={group.items} />
              </div>
            ))}
          </Part>
        )}
        {chapter.rewards.length > 0 && (
          <Part title="Rewards">
            {chapter.rewards.map((group, i) => (
              <div key={i} className={i ? "mt-2" : undefined}>
                {group.heading && <h4 className="wiki-block-head">{group.heading}</h4>}
                <Lines lines={group.items} />
              </div>
            ))}
          </Part>
        )}
        {chapter.guide.length > 0 && (
          <details className="wiki-guide">
            <summary>Guide</summary>
            <Blocks blocks={chapter.guide} />
          </details>
        )}
        <WikiCredit title={title} />
      </div>
    </details>
  );
}
