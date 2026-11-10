import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ContextDetailsPanel } from './ContextDetailsPanel';
test('renders measured values with explicit partial history coverage', () => {
 render(<ContextDetailsPanel budget={{estimatedTokens:100,contextWindow:1000,mode:'full',fallback:null,lastReportedTokens:90}} details={{breakdown:{systemPrompt:20,toolDefinitions:30,messages:50},session:{llmTimeMs:7000,toolTimeMs:250,avgTtftMs:1000,tokensPerSecond:20},usage:{requests:3,inputTokens:310,outputTokens:105,cachedInputTokens:180,uncachedInputTokens:120,cacheHitRatio:.6},coverage:{requests:3,tokenRequests:3,timedRequests:2,ttftRequests:2,cacheRequests:2,tools:2,timedTools:1}}}/>);
 expect(screen.getByText('20 tok/s')).toBeTruthy();expect(screen.getByText('60%')).toBeTruthy();expect(screen.getByText('180 tok')).toBeTruthy();expect(screen.getByText(/Неполная история/)).toBeTruthy();
});
