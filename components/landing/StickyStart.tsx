'use client';

import { useEffect, useState } from 'react';
import { OpenAppLink } from './OpenAppLink';
import { PRIMARY } from './SiteChrome';

/**
 * On phones, keeps "Start my plan" in reach while reading: a bar at the bottom
 * that shows only when none of the page's other start buttons is on screen.
 */
export function StickyStart() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const ctas = [...document.querySelectorAll('[data-cta]')].filter((el) => el.getAttribute('data-cta') !== 'sticky');
    if (!ctas.length || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target);
        else visible.delete(e.target);
      }
      setShow(visible.size === 0);
    });
    ctas.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground/95 px-4 pt-3 backdrop-blur transition-transform duration-200 motion-reduce:transition-none sm:hidden ${show ? 'translate-y-0' : 'pointer-events-none translate-y-full'}`}
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      aria-hidden={!show}
      inert={!show}
    >
      <OpenAppLink className={`${PRIMARY} w-full`} where="sticky" />
    </div>
  );
}
