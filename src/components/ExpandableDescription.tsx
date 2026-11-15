"use client";

import { useEffect, useRef, useState } from "react";

export function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;
    const measure = () => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
      const collapsedLimit = Number.isFinite(lineHeight) ? lineHeight * 5 : 120;
      setCanExpand(element.scrollHeight > collapsedLimit + 2);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  return <div className="expandable-description">
    <p ref={descriptionRef} className={`detail-description expandable-description-text${expanded ? " is-expanded" : ""}`}>{text}</p>
    {canExpand && <button type="button" className="description-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Show Less" : "Show More"}</button>}
  </div>;
}
