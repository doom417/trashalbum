/* ================================================================
   chaosformalbum — звук скримера
   Синтезируется в браузере, без аудиофайла: визгливый искажённый
   «крик» + шум + удар. Свой звук загружается в конструкторе (tools/builder.html).
   ================================================================ */
(function () {
  "use strict";

  function driveCurve(amount) {
    var n = 2048, c = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    return c;
  }

  // ctx — AudioContext (или OfflineAudioContext), volume — 0…1
  function scream(ctx, volume) {
    var t = ctx.currentTime + 0.01;
    var dur = 1.7;

    var master = ctx.createGain();
    master.gain.value = volume == null ? 0.85 : volume;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 6; comp.ratio.value = 10;
    comp.attack.value = 0.002; comp.release.value = 0.15;
    master.connect(comp); comp.connect(ctx.destination);

    // общая огибающая крика
    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.012);
    env.gain.setValueAtTime(1, t + 0.8);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    var drive = ctx.createWaveShaper();
    drive.curve = driveCurve(55);
    drive.oversample = "4x";
    var tone = ctx.createBiquadFilter();
    tone.type = "lowpass"; tone.frequency.value = 7200; tone.Q.value = 0.3;
    drive.connect(tone); tone.connect(env); env.connect(master);

    // «голос»: расстроенные пилы через две форманты
    var f1 = ctx.createBiquadFilter(); f1.type = "bandpass"; f1.frequency.value = 1150; f1.Q.value = 2.2;
    var f2 = ctx.createBiquadFilter(); f2.type = "bandpass"; f2.frequency.value = 2750; f2.Q.value = 3.5;
    var f2g = ctx.createGain(); f2g.gain.value = 0.7;
    f1.connect(drive); f2.connect(f2g); f2g.connect(drive);

    var lfo = ctx.createOscillator(); lfo.frequency.value = 21;
    var lfoDepth = ctx.createGain(); lfoDepth.gain.value = 38;
    lfo.connect(lfoDepth);
    lfo.start(t); lfo.stop(t + dur);

    [[523, "sawtooth"], [531, "sawtooth"], [784, "square"], [1047, "sawtooth"]].forEach(function (v) {
      var o = ctx.createOscillator();
      o.type = v[1];
      o.frequency.setValueAtTime(v[0] * 1.4, t);
      o.frequency.exponentialRampToValueAtTime(v[0], t + 0.11);
      o.frequency.exponentialRampToValueAtTime(v[0] * 0.6, t + dur);
      lfoDepth.connect(o.frequency);
      var g = ctx.createGain(); g.gain.value = 0.22;
      o.connect(g); g.connect(f1); g.connect(f2);
      o.start(t); o.stop(t + dur + 0.05);
    });

    // шипение
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var noise = ctx.createBufferSource(); noise.buffer = buf;
    var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1900;
    var ng = ctx.createGain(); ng.gain.value = 0.3;
    noise.connect(hp); hp.connect(ng); ng.connect(drive);
    noise.start(t);

    // удар в начале
    var sub = ctx.createOscillator(); sub.type = "sine";
    sub.frequency.setValueAtTime(120, t);
    sub.frequency.exponentialRampToValueAtTime(36, t + 0.35);
    var sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.95, t + 0.006);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    sub.connect(sg); sg.connect(master);
    sub.start(t); sub.stop(t + 0.5);

    return dur;
  }

  window.TrashScream = scream;
})();
