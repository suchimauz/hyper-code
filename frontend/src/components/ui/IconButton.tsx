import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { Tooltip } from './Tooltip';
export type IconButtonProps = Omit<ButtonProps, 'aria-label'> & {
  label: string;
  /** Visible hint shown in the shared tooltip instead of the native title; defaults to the native title = label. */
  tooltip?: ReactNode;
};
/** Shared icon-only control: accessible label, standard sizes, optional shared tooltip. */
export function IconButton({ label, tooltip, className = '', ...props }: IconButtonProps) {
  const button = <Button variant="ghost" {...props} aria-label={label} title={tooltip === undefined ? label : undefined} className={`icon-button ${className}`} />;
  return tooltip === undefined ? button : <Tooltip label={tooltip} side="bottom" delay={500}>{button}</Tooltip>;
}
