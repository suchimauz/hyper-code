import type { LoginDiagnostics } from '../../lib/llmConnections';

const PHASE = { 'ssh-preflight': 'SSH / preflight', 'cli-login': 'CLI login waiting', 'credential-check': 'Credential save / file check', 'login-status': 'Login status check' };
const REASON = { network: 'Network error', tls: 'TLS / certificate error', permission: 'Permission denied', http: 'HTTP error', 'missing-credentials': 'Credential file missing or empty', 'cli-exit': 'Process exited unsuccessfully', timeout: 'Time limit reached', interrupted: 'Authorization interrupted' };
const duration = (start: number, end: number | null) => `${Math.max(0, Math.floor(((end ?? Date.now()) - start) / 1000))}s`;

/** Render bounded remote CLI phase metadata, never raw logs or credential material. */
export function RemoteLoginDiagnostics({ diagnostics: d }: { diagnostics?: LoginDiagnostics }) {
  if (!d) return <p className="settings-note">Detailed diagnostics are unavailable for this attempt.</p>;
  return <details className="settings-note">
    <summary>Safe login diagnostics</summary>
    <p>Started: <time dateTime={new Date(d.startedAt).toISOString()}>{new Date(d.startedAt).toISOString()}</time>{d.endedAt != null && <> · Ended: <time dateTime={new Date(d.endedAt).toISOString()}>{new Date(d.endedAt).toISOString()}</time></>}</p>
    <p>Duration: {duration(d.startedAt, d.endedAt)} · Process exit: {d.exitCode ?? 'pending'}</p>
    <ol>{d.stages.map((stage, index) => <li key={`${stage.phase}-${index}`}>{PHASE[stage.phase]} · {duration(stage.startedAt, stage.endedAt)} · {stage.endedAt == null ? 'in progress' : `exit ${stage.exitCode ?? 'unknown'}`}</li>)}</ol>
    {d.reason && <p role="status">{REASON[d.reason]}{d.reason === 'http' && d.httpCode ? ` (${d.httpCode})` : ''}. Classification is a hint, not a confirmed cause.</p>}
    <p>Browser completion is not observable until the CLI reports it. No provider logs are displayed. History is lost on server restart.</p>
  </details>;
}
