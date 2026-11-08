export type DeskSpriteStatus = 'idle' | 'working' | 'done' | 'error';
export interface DeskSpriteController {
  setStatus(status: DeskSpriteStatus, label?: string): void;
  say(text: string): void;
  destroy(): void;
  el: HTMLDivElement | null;
}
declare global {
  interface Window {
    DeskSprite: {
      start(options: {
        mount: HTMLElement; roam: false; clock: false; lunch: false; scale: number;
        status?: DeskSpriteStatus;
        messages: { working: string; done: string; error: string; seat: string };
      }): DeskSpriteController;
    };
  }
}
