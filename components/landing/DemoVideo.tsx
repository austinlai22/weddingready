'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A short looping screen recording. Loads only when near the screen and plays
 * only while visible. With reduced motion it waits for a tap instead.
 */
export function DemoVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const rm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setReduced(rm);
    if (rm || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (video.preload === 'none') video.preload = 'auto';
          void video.play().catch(() => undefined);
        } else video.pause();
      },
      { threshold: 0.35 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative">
      <video
        ref={ref}
        className="block aspect-[390/844] w-full"
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
