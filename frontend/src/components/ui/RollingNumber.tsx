import './rolling-number.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Formatted number whose digits roll vertically to their new value (odometer style).
 * Non-digit characters (separators, $, %, "—") render statically. Digits are keyed
 * from the right so units stay in place when the number grows. Screen readers get
 * the plain text only; reduced motion disables the transition in CSS.
 */
export function RollingNumber({ value, className }: { value: string; className?: string }) {
  const chars = [...value];
  return <span className={className ? `rolling-number ${className}` : 'rolling-number'}>
    <span className="rolling-number-sr">{value}</span>
    <span className="rolling-number-glyphs" aria-hidden="true">
      {chars.map((ch, i) => {
        const key = chars.length - i;
        const digit = DIGITS.indexOf(ch);
        if (digit < 0) return <span key={`c${key}`} className="rolling-char">{ch}</span>;
        return <span key={`d${key}`} className="rolling-digit">
          <span className="rolling-digit-sizer">0</span>
          <span className="rolling-digit-strip" style={{ transform: `translateY(${-digit * 10}%)` }}>
            {DIGITS.map(d => <span key={d}>{d}</span>)}
          </span>
        </span>;
      })}
    </span>
  </span>;
}
