'use client';

import { DAY_NAMES, DAY_SHORT } from '@/lib/engine/dates';
import { DayCheck } from '../ui/icons';

export interface StripDay {
  date: string;
  tag: string;
  done: boolean;
  aria: string;
}

export function WeekStrip({ days, selected, today, onPick }: { days: StripDay[]; selected: string; today: string; onPick: (d: string) => void }) {
  return (
    <nav aria-label="Days of the week" className="week">
      {days.map((d, i) => {
        const isSel = d.date === selected;
        const isToday = d.date === today;
        return (
          <button
            key={d.date}
            type="button"
            className={`day-btn${d.done ? ' done' : ''}${isToday ? ' today' : ''}`}
            aria-pressed={isSel}
            aria-label={`${DAY_NAMES[i]}${isToday ? ' (today)' : ''}, ${d.aria}${d.done ? ', done' : ''}`}
            onClick={() => onPick(d.date)}
          >
            <span className="d-short">{DAY_SHORT[i]}</span>
            <span className="d-tag">{isToday ? 'Today' : d.tag}</span>
            {d.done && <DayCheck fill={isSel ? '#E4C79A' : '#A63D63'} ink={isSel ? '#3B1F2E' : '#FFFFFF'} />}
          </button>
        );
      })}
    </nav>
  );
}
