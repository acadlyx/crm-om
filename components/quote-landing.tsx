"use client";

import { useEffect, useRef, useState } from "react";
import "./quote-landing.css";

const quotes = [
  "You do not need the whole map\nto take the next step.",
  "Somewhere between trying\nand trying again, you grow.",
  "Make a little room\nfor the life you keep imagining.",
  "Nothing blooms on command.\nKeep the light close.",
  "Be where your feet are.\nLet the rest arrive.",
  "The quiet work is still work.\nTrust what it is building.",
  "A softer heart can still\nmake a very brave life.",
  "Leave enough silence\nto hear yourself becoming.",
  "You are allowed to begin\nbefore you feel ready.",
  "Not every beautiful thing\nneeds to be hurried.",
  "Let today be a beginning,\nnot a verdict.",
  "The world changes a little\nwhen you look at it gently.",
];

const designs = ["paper", "atelier", "citrus", "midnight", "rose", "gallery"] as const;

function differentIndex(current: number, length: number) {
  return (current + 1 + Math.floor(Math.random() * (length - 1))) % length;
}

export function QuoteLanding() {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [designIndex, setDesignIndex] = useState(0);

  useEffect(() => {
    // Randomize after hydration so server HTML and the first client render match.
    const frame = window.requestAnimationFrame(() => {
      setQuoteIndex(Math.floor(Math.random() * quotes.length));
      setDesignIndex(Math.floor(Math.random() * designs.length));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  function nextQuote() {
    setQuoteIndex((current) => differentIndex(current, quotes.length));
    setDesignIndex((current) => (current + 1) % designs.length);
  }

  function previousQuote() {
    setQuoteIndex((current) => (current - 1 + quotes.length) % quotes.length);
    setDesignIndex((current) => (current + designs.length - 1) % designs.length);
  }

  function changeDesign() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setDesignIndex((current) => (current + 1) % designs.length);
  }

  return (
    <main className={"quote-landing design-" + designs[designIndex]}>
      <button
        type="button"
        className="quote-canvas"
        aria-label="Change the quote design. Swipe left for another quote."
        onClick={changeDesign}
        onPointerDown={(event) => {
          pointerStart.current = { x: event.clientX, y: event.clientY };
          suppressClick.current = false;
        }}
        onPointerUp={(event) => {
          if (!pointerStart.current) return;
          const dx = event.clientX - pointerStart.current.x;
          const dy = event.clientY - pointerStart.current.y;
          pointerStart.current = null;
          if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.15) {
            suppressClick.current = true;
            if (dx < 0) nextQuote();
            else previousQuote();
          }
        }}
        onPointerCancel={() => { pointerStart.current = null; }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            nextQuote();
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            previousQuote();
          }
        }}
      >
        <span className="quote-decoration" aria-hidden="true" />
        <span className="quote-text" key={quoteIndex}>{quotes[quoteIndex]}</span>
      </button>
    </main>
  );
}
