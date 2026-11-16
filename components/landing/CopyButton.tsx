'use client';

import { useState } from 'react';

/** Copies `text`; the text is also on screen, so a blocked clipboard just means copying by hand. */
export function CopyButton({ text, className }: { text: string; className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
