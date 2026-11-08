import type { ButtonHTMLAttributes } from 'react';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'default' | 'compact';
};
/** Shared control: semantic button, keyboard focus, disabled and pressed feedback. */
export function Button({ variant = 'secondary', size = 'default', className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`button button--${variant} ${size === 'compact' ? 'button--compact' : ''} ${className}`} {...props} />;
}
