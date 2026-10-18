// Microphone dictation only: append to the original composer's draft, never submit.
(() => {
  if (window.__hyperDictation) return;
  window.__hyperDictation = true;
  let active = null;
  const status = (form, text, cancellable = true) => {
    const bar = form.querySelector('[data-dictation-bar]');
    if (!bar) return;
    bar.hidden = !text;
    bar.querySelector('[data-dictation-status]').textContent = text;
    bar.querySelector('[data-dictation-cancel]').hidden = !cancellable;
  };
  const buttonState = (s, recording) => {
    const b = s.form.querySelector('[data-dictate]');
    b.disabled = s.phase === 'permission' || s.phase === 'upload';
    b.setAttribute('aria-pressed', String(recording));
    b.setAttribute('aria-label', recording ? 'Остановить запись' : 'Голосовой ввод');
    b.title = recording ? 'Остановить запись' : 'Голосовой ввод';
    s.form.classList.toggle('is-recording', recording);
    const panel = s.form.querySelector('[data-recording-panel]');
    if (panel) panel.hidden = !recording;
    b.classList.toggle('text-error', recording);
    b.querySelector('i').className = recording ? 'ph ph-stop-circle' : 'ph ph-microphone';
  };
  const release = s => {
    clearTimeout(s.timer);
    if (s.frame) cancelAnimationFrame(s.frame);
    if (s.audio) { void s.audio.close().catch(() => {}); s.audio = null; }
    s.stream?.getTracks().forEach(t => t.stop());
    s.stream = null;
  };
  const cancel = () => {
    const s = active;
    if (!s) return;
    active = null;
    s.cancelled = true;
    s.abort.abort();
    if (s.recorder?.state === 'recording') s.recorder.stop();
    release(s);
    s.phase = 'idle'; buttonState(s, false); status(s.form, '');
  };
  const valid = s => active === s && !s.cancelled && s.form.isConnected && s.input.isConnected;
  async function transcribe(s) {
    release(s);
    if (!valid(s)) return;
    s.phase = 'upload'; buttonState(s, false); status(s.form, 'Распознаю речь…');
    try {
      const blob = new Blob(s.chunks, {type: s.recorder.mimeType || s.chunks[0]?.type || 'audio/webm'});
      if (!blob.size) throw Error('Запись пуста. Попробуй ещё раз.');
      if (blob.size > 8 * 1024 * 1024) throw Error('Запись слишком большая. Запиши более короткую фразу.');
      const timeout = setTimeout(() => s.abort.abort(), 150000);
      let response;
      try { response = await fetch('/whisper/dictate', {method:'POST', body:blob, credentials:'same-origin', signal:s.abort.signal, headers:{'Content-Type':blob.type,'X-CSRF-Token':document.querySelector('meta[name="csrf-token"]')?.content || ''}}); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw Error(response.status === 401 ? 'Войди в Hyper и повтори запись.' : response.status === 429 || response.status === 409 ? 'Распознавание занято. Попробуй чуть позже.' : 'Не удалось распознать запись. Попробуй ещё раз.');
      const result = await response.json();
      if (!valid(s)) return;
      const text = typeof result.text === 'string' ? result.text.trim() : '';
      if (!text) { status(s.form, 'Речь не распознана. Попробуй ещё раз.', false); return; }
      // Preserve edits made while waiting and keep the transcript in this chat only.
      s.input.value += (s.input.value && !/\s$/.test(s.input.value) ? ' ' : '') + text;
      s.input.dispatchEvent(new Event('input', {bubbles:true}));
      s.input.focus(); s.input.setSelectionRange(s.input.value.length, s.input.value.length);
      status(s.form, 'Текст добавлен в черновик.', false);
    } catch (error) {
      if (valid(s)) status(s.form, error.name === 'AbortError' ? 'Распознавание заняло слишком много времени. Попробуй короткую запись.' : error.message, false);
    } finally {
      if (active === s) { active = null; s.phase = 'idle'; buttonState(s, false); }
    }
  }
  function drawWave(s) {
    const canvas = s.form.querySelector('[data-recording-wave]');
    if (!canvas) return;
    const paint = canvas.getContext('2d');
    if (!paint) return;
    const started = performance.now();
    let analyser, samples;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        s.audio = new Audio();
        analyser = s.audio.createAnalyser(); analyser.fftSize = 256;
        s.audio.createMediaStreamSource(s.stream).connect(analyser);
        samples = new Uint8Array(analyser.fftSize);
        void s.audio.resume().catch(() => {});
      }
    } catch { analyser = null; }
    const levels = Array(60).fill(0);
    let last = 0;
    const draw = now => {
      if (!valid(s) || s.phase !== 'recording') return;
      const seconds = Math.floor((now - started) / 1000);
      s.form.querySelector('[data-recording-time]').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      if (now - last >= 70) {
        last = now;
        let level = 0;
        if (analyser) { analyser.getByteTimeDomainData(samples); for (const v of samples) level += ((v - 128) / 128) ** 2; level = Math.min(1, Math.sqrt(level / samples.length) * 4); }
        levels.push(level); levels.shift();
      }
      const width = Math.max(1, canvas.clientWidth), height = 32, ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
      paint.setTransform(ratio, 0, 0, ratio, 0, 0); paint.clearRect(0, 0, width, height);
      paint.fillStyle = getComputedStyle(canvas).color;
      levels.forEach((level, i) => { const h = Math.max(2, level * 30); paint.fillRect(i * width / levels.length, (height - h) / 2, Math.max(2, width / levels.length - 3), h); });
      s.frame = requestAnimationFrame(draw);
    };
    s.frame = requestAnimationFrame(draw);
  }
  async function start(form) {
    cancel();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { status(form, 'Микрофон недоступен. Открой Hyper по HTTPS в браузере с поддержкой записи.', false); return; }
    const input = form.querySelector('textarea[name="text"]');
    if (!input) return;
    const s = {form, input, phase:'permission', chunks:[], bytes:0, abort:new AbortController(), cancelled:false};
    active = s; buttonState(s, false); status(form, 'Разреши доступ к микрофону…');
    try {
      s.stream = await navigator.mediaDevices.getUserMedia({audio:true});
      if (!valid(s)) { release(s); return; }
      const mimeType = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      s.recorder = new MediaRecorder(s.stream, mimeType ? {mimeType} : undefined);
      s.recorder.addEventListener('dataavailable', event => {
        if (event.data.size && !s.cancelled) { s.chunks.push(event.data); s.bytes += event.data.size; }
        if (s.bytes > 8 * 1024 * 1024 && active === s) { cancel(); status(form, 'Запись слишком большая. Попробуй более короткую фразу.', false); }
      });
      s.recorder.addEventListener('stop', () => { void transcribe(s); });
      s.recorder.addEventListener('error', () => { if (active === s) { cancel(); status(form, 'Ошибка записи микрофона.', false); } });
      s.phase = 'recording'; s.recorder.start(1000); buttonState(s, true);
      status(form, 'Идёт запись… (до 60 сек).');
      drawWave(s);
      s.timer = setTimeout(() => { if (valid(s) && s.recorder.state === 'recording') s.recorder.stop(); }, 60000);
    } catch (error) {
      if (valid(s)) { cancel(); status(form, error.name === 'NotAllowedError' ? 'Доступ к микрофону запрещён. Разреши его в настройках сайта.' : 'Не удалось включить микрофон.', false); }
      else release(s);
    }
  }
  document.addEventListener('click', event => {
    const cancelButton = event.target.closest('[data-dictation-cancel]');
    if (cancelButton) { event.preventDefault(); cancel(); return; }
    const stopButton = event.target.closest('[data-recording-stop]');
    if (stopButton) { event.preventDefault(); if (active?.form === stopButton.closest('form') && active.recorder?.state === 'recording') active.recorder.stop(); return; }
    const button = event.target.closest('[data-dictate]');
    if (!button) return;
    event.preventDefault();
    const form = button.closest('form');
    if (active?.form === form) { if (active.phase === 'recording' && active.recorder.state === 'recording') active.recorder.stop(); return; }
    void start(form);
  });
  document.addEventListener('submit', event => { if (active?.form === event.target) cancel(); }, true);
  document.addEventListener('htmx:before:cleanup', event => { if (active && (event.target === active.form || event.target.contains?.(active.form))) cancel(); });
  document.addEventListener('htmx:after:swap', () => { if (active && !active.form.isConnected) cancel(); });
  window.addEventListener('pagehide', cancel);
})();
