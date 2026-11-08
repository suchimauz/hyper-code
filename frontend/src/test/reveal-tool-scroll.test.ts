import { afterEach, expect, it, vi } from 'vitest';
import { revealToolScroll } from '../components/hyper/revealToolScroll';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ''; });
function fixture() {
 const scroll = document.createElement('div'), target = document.createElement('section');
 target.innerHTML = '<button class="tool-row-summary" aria-expanded="true"></button>';
 scroll.append(target); document.body.append(scroll);
 Object.defineProperties(scroll, {clientHeight:{value:400},scrollHeight:{value:1600}});
 vi.spyOn(scroll,'getBoundingClientRect').mockReturnValue({top:0} as DOMRect);
 vi.spyOn(target,'getBoundingClientRect').mockReturnValue({bottom:1000} as DOMRect);
 vi.spyOn(target,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
 return {scroll,target};
}
it('waits for expansion, scrolls gradually once and releases ownership', () => {
 vi.useFakeTimers(); const {scroll,target}=fixture(), done=vi.fn();
 revealToolScroll(scroll,target,done);
 expect(scroll.scrollTop).toBe(0);
 vi.advanceTimersByTime(90); expect(scroll.scrollTop).toBe(0);
 vi.advanceTimersByTime(100); expect(scroll.scrollTop).toBeGreaterThan(0); expect(scroll.scrollTop).toBeLessThan(612);
 vi.advanceTimersByTime(400); expect(scroll.scrollTop).toBe(612); expect(done).toHaveBeenCalledOnce();
});
it('cancels without a final jump when the reader interrupts', () => {
 vi.useFakeTimers(); const {scroll,target}=fixture(), done=vi.fn();
 const cancel=revealToolScroll(scroll,target,done);
 vi.advanceTimersByTime(180); cancel(); const at=scroll.scrollTop;
 vi.advanceTimersByTime(500); expect(scroll.scrollTop).toBe(at); expect(done).not.toHaveBeenCalled();
});
function nestedFixture(groupTop: number) {
 const {scroll,target}=fixture();
 const group=document.createElement('div'); group.style.overflowY='auto';
 scroll.append(group); group.append(target);
 Object.defineProperties(group,{clientHeight:{value:200},scrollHeight:{value:1200}});
 vi.spyOn(group,'getBoundingClientRect').mockImplementation(()=>({top:groupTop-scroll.scrollTop} as DOMRect));
 vi.spyOn(target,'getBoundingClientRect').mockImplementation(()=>({bottom:groupTop+900-group.scrollTop-scroll.scrollTop} as DOMRect));
 return {scroll,target,group};
}
it('reveals inside a group without moving an already visible outer viewport',()=>{
 vi.useFakeTimers(); const {scroll,target,group}=nestedFixture(100),done=vi.fn();
 revealToolScroll(scroll,target,done);
 vi.advanceTimersByTime(190); expect(group.scrollTop).toBeGreaterThan(0); expect(scroll.scrollTop).toBe(0);
 vi.advanceTimersByTime(600); expect(group.scrollTop).toBe(712); expect(scroll.scrollTop).toBe(0);
 expect(done).toHaveBeenCalledOnce(); expect(group.dataset.toolRevealing).toBeUndefined();
});
it('scrolls the outer viewport only after the inner group and measures the clipped bottom',()=>{
 vi.useFakeTimers(); const {scroll,target,group}=nestedFixture(500),done=vi.fn();
 revealToolScroll(scroll,target,done);
 vi.advanceTimersByTime(250); expect(group.scrollTop).toBeGreaterThan(0); expect(scroll.scrollTop).toBe(0);
 vi.advanceTimersByTime(650); expect(group.scrollTop).toBe(712); expect(scroll.scrollTop).toBe(300);
 expect(done).toHaveBeenCalledOnce();
});
it('cancels both nested stages without starting the outer scroll',()=>{
 vi.useFakeTimers(); const {scroll,target,group}=nestedFixture(500),done=vi.fn();
 const cancel=revealToolScroll(scroll,target,done);
 vi.advanceTimersByTime(200); cancel(); const at=group.scrollTop;
 vi.advanceTimersByTime(900); expect(group.scrollTop).toBe(at); expect(scroll.scrollTop).toBe(0);
 expect(group.dataset.toolRevealing).toBeUndefined(); expect(done).not.toHaveBeenCalled();
});
