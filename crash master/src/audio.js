// Web Audio API Procedural Sound Synthesizer
// Zero external sound asset dependencies, instantaneous playback, no lag

class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.isMuted = false;
        this.initialized = false;
        this.engineOsc = null;
        this.engineGain = null;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.35;
            this.masterGain.connect(this.ctx.destination);
            this.initialized = true;
            this.setupEngine();
        } catch (e) {
            console.warn('Web Audio not available:', e);
        }
    }

    setupEngine() {
        if (!this.ctx) return;
        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 45;
        this.engineGain.gain.value = 0.04;

        // Lowpass filter for deep engine rumble
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220;

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);
        this.engineOsc.start();
    }

    updateEngine(speedRatio, isAccelerating) {
        if (!this.engineOsc || !this.ctx) return;
        const targetFreq = 45 + (speedRatio * 90) + (isAccelerating ? 25 : 0);
        this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
        const targetVol = this.isMuted ? 0 : (0.03 + speedRatio * 0.05);
        this.engineGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.08);
    }

    playHit(severity = 'normal') {
        if (!this.ctx || this.isMuted) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const now = this.ctx.currentTime;
        // White noise buffer for crash crunch
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.25);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';

        let freq = 600;
        let volume = 0.3;
        if (severity === 'light') { freq = 900; volume = 0.2; }
        else if (severity === 'strong') { freq = 450; volume = 0.45; }
        else if (severity === 'heavy') { freq = 300; volume = 0.65; }

        filter.frequency.setValueAtTime(freq, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        // Sub bass thud for impact punch
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'triangle';
        sub.frequency.setValueAtTime(severity === 'heavy' ? 120 : 160, now);
        sub.frequency.exponentialRampToValueAtTime(30, now + 0.18);
        subGain.gain.setValueAtTime(volume * 0.8, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        sub.connect(subGain);
        subGain.connect(this.masterGain);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
        sub.start(now);
        sub.stop(now + 0.25);
    }

    playScreech() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(700 + Math.random() * 200, now);
        osc.frequency.linearRampToValueAtTime(400, now + 0.12);

        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.13);
    }

    playCountdown(isGo = false) {
        if (!this.ctx || this.isMuted) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isGo ? 880 : 440, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (isGo ? 0.35 : 0.18));

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + (isGo ? 0.4 : 0.2));
    }

    playLowHealthAlarm() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(620, now + 0.08);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.2);
    }

    playVictory() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);
            gain.gain.setValueAtTime(0.25, now + idx * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.3);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now + idx * 0.12);
            osc.stop(now + idx * 0.12 + 0.35);
        });
    }

    playGameOver() {
        if (!this.ctx || this.isMuted) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.6);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.7);
    }
}

window.soundManager = new SoundManager();
