'use client';

import { useEffect, useRef, useState } from 'react';

// Every demo on the page reports how much of it is on screen; only the most
// visible one plays, so there's never more than one moving at a time.
const visible = new Map<HTMLVideoElement, number>();

function playMostVisible() {
  let best: HTMLVideoElement | null = null;
  let bestRatio = 0.5;
  for (const [v, r] of visible) {
    if (r >= bestRatio) {
      best = v;
      bestRatio = r;
    }
  }
  for (const v of visible.keys()) {
    if (v === best) {
      if (v.preload === 'none') v.preload = 'auto';
      if (v.paused) void v.play().catch(() => undefined);
    } else if (!v.paused) v.pause();
  }
}

/**
 * A short looping screen recording. Loads only when it's the one on screen.
 * With reduced motion it waits for a tap instead.
 */
export function DemoVideo({ src, poster, label, aspect = 'aspect-[390/844]' }: { src: string; poster: string; label: string; aspect?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const rm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setReduced(rm);
    if (rm || typeof IntersectionObserver === 'undefined') return;
    visible.set(video, 0);
    const io = new IntersectionObserver(
      ([entry]) => {
        visible.set(video, entry.isIntersecting ? entry.intersectionRatio : 0);
        playMostVisible();
      },
      { threshold: [0, 0.25, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );
    io.observe(video);
    // Start loading a little before it arrives, so it never starts blank.
    const near = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && video.preload === 'none') video.preload = 'auto';
      },
      { rootMargin: '400px 0px' },
    );
    near.observe(video);
    return () => {
      io.disconnect();
      near.disconnect();
      visible.delete(video);
      video.pause();
    };
  }, []);

  return (
    <div className="relative">
      <video
        ref={ref}
        className={`block w-full bg-cover bg-top ${aspect}`}
        // The poster stays behind the video while the first frame loads.
        style={{ backgroundImage: `url(${poster})` }}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={label}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {reduced && !playing && (
        <button
          type="button"
          onClick={() => void ref.current?.play()}
          className="absolute inset-0 flex items-center justify-center bg-ink/10"
          aria-label={`Play: ${label}`}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-plum text-ground shadow-lg">
            <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6" fill="currentColor" aria-hidden="true">
              <path d="M7 5v14l12-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
