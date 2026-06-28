/* global supabase */
(() => {
  const cfg = window.FCC2026_CONFIG;
  const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const el = {
    sessionId: document.getElementById('sessionId'),
    pin: document.getElementById('operatorPin'),
    triggerPhrase: document.getElementById('triggerPhrase'),
    aiOrb: document.getElementById('aiOrb'),
    statusTitle: document.getElementById('statusTitle'),
    statusText: document.getElementById('statusText'),
    transcriptBox: document.getElementById('transcriptBox'),
    logBox: document.getElementById('logBox'),
    connectBtn: document.getElementById('connectBtn'),
    armBtn: document.getElementById('armBtn'),
    voiceBtn: document.getElementById('voiceBtn'),
    manualBtn: document.getElementById('manualBtn'),
    resetBtn: document.getElementById('resetBtn')
  };

  el.sessionId.value = cfg.SESSION_ID;
  el.triggerPhrase.textContent = cfg.TRIGGER_PHRASE;

  let connected = false;
  let recognition;

  function log(message) {
    const div = document.createElement('div');
    div.textContent = `${new Date().toLocaleTimeString()} · ${message}`;
    el.logBox.prepend(div);
  }

  function setOrb(state) {
    el.aiOrb.className = `ai-orb ${state}`;
  }

  function setStatus(title, text, state = 'idle') {
    el.statusTitle.textContent = title;
    el.statusText.textContent = text;
    setOrb(state);
  }

  function getSessionId() {
    return el.sessionId.value.trim() || cfg.SESSION_ID;
  }

  function getPin() {
    return el.pin.value.trim();
  }

  function speak(text) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.92;
      utterance.pitch = 0.92;
      window.speechSynthesis.speak(utterance);
    } catch (_) {
      // Speech synthesis is optional.
    }
  }

  async function callCommand(type, payload = {}) {
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
      throw new Error('Please configure SUPABASE_URL in config.js first.');
    }
    if (!getPin()) {
      throw new Error('Please enter the ceremony PIN first.');
    }

    const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/fcc2026-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        type,
        session_id: getSessionId(),
        pin: getPin(),
        ...payload
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Command failed with status ${response.status}`);
    }
    return data;
  }

  async function connect() {
    setStatus('Connecting', 'Checking Supabase connection...', 'listening');
    const { error } = await sb.from('fcc2026_gimmick_state').select('session_id').limit(1);
    if (error) throw error;
    connected = true;
    setStatus('Connected', 'Supabase is ready. Arm the AI before taking voice input.', 'accepted');
    log('Connected to Supabase.');
  }

  async function arm() {
    setStatus('Arming AI', 'Sending ARM signal to AV room...', 'listening');
    const data = await callCommand('ARM');
    setStatus('AI Armed', 'The AV room is now on standby.', 'accepted');
    log(data.message || 'AI armed.');
  }

  async function reset() {
    setStatus('Resetting', 'Sending reset signal to AV room...', 'listening');
    const data = await callCommand('RESET');
    setStatus('Reset Complete', 'AV room has been reset to standby.', 'idle');
    el.transcriptBox.textContent = 'No voice input yet.';
    log(data.message || 'Reset complete.');
  }

  async function manualInitiate() {
    setStatus('Manual Initiation', 'Sending approved initiation command...', 'listening');
    const data = await callCommand('INITIATE', { transcript: cfg.TRIGGER_PHRASE });
    if (data.allowed) {
      speak(cfg.STAGE_AI_ACCEPTED);
      setStatus('Command Accepted', 'AV room is initiating the video.', 'accepted');
    } else {
      speak(cfg.STAGE_AI_REJECTED);
      setStatus('Command Rejected', data.message || 'Safety gate rejected the command.', 'rejected');
    }
    log(data.message || 'Manual initiation processed.');
  }

  function setupRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const r = new SpeechRecognition();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.continuous = false;

    r.onstart = () => {
      setStatus('Listening', `Say: “${cfg.TRIGGER_PHRASE}”`, 'listening');
      el.transcriptBox.textContent = 'Listening...';
      log('Voice recognition started.');
    };

    r.onerror = (event) => {
      setStatus('Voice Error', event.error || 'Voice input failed.', 'rejected');
      log(`Voice recognition error: ${event.error}`);
    };

    r.onend = () => {
      if (el.transcriptBox.textContent === 'Listening...') {
        setStatus('No Voice Detected', 'Try again or use Manual Initiate.', 'idle');
      }
    };

    r.onresult = async (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript || '')
        .join(' ')
        .trim();

      el.transcriptBox.textContent = transcript || 'No transcript.';
      log(`Voice received: ${transcript}`);
      setStatus('Checking Safety Gate', 'Validating the command before AV playback...', 'listening');

      try {
        const data = await callCommand('TRANSCRIPT', { transcript });
        if (data.allowed) {
          speak(cfg.STAGE_AI_ACCEPTED);
          setStatus('Command Accepted', 'AV room is initiating the video.', 'accepted');
        } else {
          speak(cfg.STAGE_AI_REJECTED);
          setStatus('Command Rejected', data.message || 'The transcript did not match the allowed command.', 'rejected');
        }
        log(data.message || 'Transcript processed.');
      } catch (err) {
        setStatus('Command Failed', err.message, 'rejected');
        log(err.message);
      }
    };

    return r;
  }

  async function startVoice() {
    if (!connected) {
      await connect();
    }
    speak(cfg.STAGE_AI_GREETING);
    await callCommand('LISTENING');
    recognition = recognition || setupRecognition();
    if (!recognition) {
      setStatus('Voice Not Supported', 'This browser does not support speech recognition. Use Chrome or the Manual Initiate button.', 'rejected');
      log('SpeechRecognition API not available in this browser.');
      return;
    }
    recognition.start();
  }

  el.connectBtn.addEventListener('click', () => connect().catch(err => { setStatus('Connection Failed', err.message, 'rejected'); log(err.message); }));
  el.armBtn.addEventListener('click', () => arm().catch(err => { setStatus('Arm Failed', err.message, 'rejected'); log(err.message); }));
  el.voiceBtn.addEventListener('click', () => startVoice().catch(err => { setStatus('Voice Failed', err.message, 'rejected'); log(err.message); }));
  el.manualBtn.addEventListener('click', () => manualInitiate().catch(err => { setStatus('Manual Failed', err.message, 'rejected'); log(err.message); }));
  el.resetBtn.addEventListener('click', () => reset().catch(err => { setStatus('Reset Failed', err.message, 'rejected'); log(err.message); }));

  setStatus('Idle', 'Connect to Supabase, then arm the AI.', 'idle');
})();
