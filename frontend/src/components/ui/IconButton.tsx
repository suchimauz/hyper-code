import { Button, type ButtonProps } from './Button';
export type IconButtonProps = Omit<ButtonProps, 'aria-label'> & { label: string };
export function IconButton({ label, className = '', ...props }: IconButtonProps) {
  return <Button variant="ghost" {...props} aria-label={label} title={label} className={`icon-button ${className}`} />;
}
