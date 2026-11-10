import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { utilityExtension } from '../core-ui/utilities';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const context={readOnly:false} as any;
test('autotext sends nothing merely by opening the page',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const View=utilityExtension.pages!.find(p=>p.id==='autotext')!.component;
 render(<View context={context}/>);
 expect(screen.getByLabelText('Article draft')).toBeTruthy();
 expect(fetcher).not.toHaveBeenCalled();
});
