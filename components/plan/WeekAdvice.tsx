import type { WeekSuggestion } from '@/lib/engine/suggest';

/** One-tap fix for a week that can't follow the recovery rules as entered. Never applied without the tap. */
export function WeekAdvice({ suggestion, onApply, onDismiss }: { suggestion: WeekSuggestion; onApply?: () => void; onDismiss?: () => void }) {
  const action = suggestion.kind === 'moves' ? 'Move them' : suggestion.kind === 'days' ? `Switch to ${suggestion.strengthDays} days` : null;
  return (
    <div className="card-lg" role="note" aria-label="Suggestion for your week" style={{ borderColor: '#A63D63' }}>
      <p className="kicker-rose">A better week for recovery</p>
      <p className="note-line">{suggestion.text}</p>
      {(action || onDismiss) && (
        <div className="row" style={{ gap: 8 }}>
          {action && onApply && (
            <button type="button" className="btn" onClick={onApply}>
              {action}
            </button>
          )}
          {onDismiss && (
            <button type="button" className="btn-text" onClick={onDismiss}>
              Keep my week
            </button>
          )}
        </div>
      )}
    </div>
  );
}
