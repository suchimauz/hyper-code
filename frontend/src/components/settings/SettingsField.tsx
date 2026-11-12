import { useId, type InputHTMLAttributes } from 'react';

/** Labelled native settings input shared by connection editors. */
export function SettingsField({ label, hint, ...input }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return <label className="settings-field" htmlFor={id}><span id={`${id}-label`} className="settings-field-label">{label}</span><input id={id} aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />{hint && <span id={`${id}-hint`} className="settings-field-hint">{hint}</span>}</label>;
}
