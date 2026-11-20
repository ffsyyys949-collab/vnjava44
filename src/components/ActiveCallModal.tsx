import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  SwitchCamera,
  Volume2,
  VolumeX,
} from 'lucide-react';

export interface CallSessionData {
  callId: string;
  type: 'audio' | 'video';
  isCaller: boolean;
  partnerId: string;
  partnerName: string;
  partnerPhoto?: string;
  partnerUsername?: string;
  mode?: 'private' | 'group' | 'community' | 'global';
  chatId?: string;
}

interface ActiveCallModalProps {
  session: CallSessionData;
  currentUser: any;
  onEndCall: () => void;
}

class SoundFxEngine {
  private ctx: AudioContext | null = null;
  private timer: any = null;

  private getCtx() {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  startRingback() {
    this.stop();
    const playBeep = () => {
      try {
        const ctx = this.getCtx();
        if (!ctx) return;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.value = 440;
        osc2.type = 'sine';
        osc2.frequency.value = 480;

        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 1.5);
        osc2.stop(ctx.currentTime + 1.5);
      } catch {}
    };

    playBeep();
    this.timer = setInterval(playBeep, 3500);
  }

  startRinging() {
    this.stop();
    const playRing = () => {
      try {
        const ctx = this.getCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(750, now);
        osc1.frequency.setValueAtTime(850, now + 0.4);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(450, now);
        osc2.frequency.setValueAtTime(520, now + 0.4);

        gain.gain.setValueAtTime(0.09, now);
        gain.gain.setValueAtTime(0.09, now + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.0);
        osc2.stop(now + 1.0);
      } catch {}
    };

    playRing();
    this.timer = setInterval(playRing, 2400);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx && this.ctx.state === 'running') {
      try {
        this.ctx.suspend().catch(() => {});
      } catch {}
    }
  }
}

const soundEngine = new SoundFxEngine();

export function ActiveCallModal({ session, currentUser, onEndCall }: ActiveCallModalProps) {
  const [callStatus, setCallStatus] = useState<'calling' | 'ringing' | 'connected' | 'ended'>(
    session.isCaller ? 'calling' : 'ringing'
  );
  const [duration, setDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoOff, setIsVideoOff] = useState<boolean>(session.type === 'audio');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [speakerOn, setSpeakerOn] = useState<boolean>(true);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const processedSignalKeysRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<any>(null);
  const vibrateTimerRef = useRef<any>(null);
  const endedRef = useRef(false);

  // Attach streams to video/audio DOM elements whenever mounted or updated
  useEffect(() => {
    if (localVideoRef.current && localStream && session.type === 'video') {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isVideoOff, session.type]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream && session.type === 'video') {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.muted = !speakerOn;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream, speakerOn, session.type]);

  // Call duration starts ONLY when connected
  useEffect(() => {
    if (callStatus === 'connected') {
      soundEngine.stop();
      setDuration(0);
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setDuration(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [callStatus]);

  // Ringback / Ringtone & Vibration
  useEffect(() => {
    if (callStatus === 'calling') {
      soundEngine.startRingback();
    } else if (callStatus === 'ringing') {
      soundEngine.startRinging();
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([400, 250, 400]);
        } catch {}
        vibrateTimerRef.current = setInterval(() => {
          try {
            navigator.vibrate([400, 250, 400]);
          } catch {}
        }, 1800);
      }
    } else {
      soundEngine.stop();
      if (vibrateTimerRef.current) {
        clearInterval(vibrateTimerRef.current);
        vibrateTimerRef.current = null;
      }
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(0);
        } catch {}
      }
    }
    return () => {
      soundEngine.stop();
      if (vibrateTimerRef.current) {
        clearInterval(vibrateTimerRef.current);
        vibrateTimerRef.current = null;
      }
    };
  }, [callStatus]);

  // Browser/WebView notification when incoming call opens
  useEffect(() => {
    if (!session.isCaller && callStatus === 'ringing' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        try {
          const notif = new Notification(`Panggilan Masuk VNJAVA`, {
            body: `${session.partnerName} memanggil (${session.type === 'video' ? 'Video Call' : 'Telepon Suara'})`,
            icon: '/assets/vnjava_logo.jpg',
            badge: '/assets/vnjava_logo.jpg',
            tag: `vn-call-${session.callId}`,
            requireInteraction: true,
          } as any);
          notif.onclick = () => {
            window.focus();
            notif.close();
          };
        } catch {}
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, [session.callId, session.isCaller, session.partnerName, session.type, callStatus]);

  const sendSignal = (signalType: 'offer' | 'answer' | 'ice-candidate', payload: any) => {
    fetch('/api/calls/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId: session.callId,
        senderId: currentUser.id,
        targetId: session.partnerId,
        signalType,
        payload,
      }),
    }).catch(() => {});
  };

  const initializeMedia = async (useFacing: 'user' | 'environment' = 'user') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: session.type === 'video' ? { facingMode: useFacing } : false,
      });
      setLocalStream(stream);
      return stream;
    } catch {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setLocalStream(audioOnly);
        return audioOnly;
      } catch {
        return null;
      }
    }
  };

  const flushPendingCandidates = async (pc: RTCPeerConnection) => {
    while (pendingCandidatesRef.current.length > 0) {
      const cand = pendingCandidatesRef.current.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {}
      }
    }
  };

  const processIncomingSignal = async (signalType: string, payload: any, senderId?: string) => {
    if (senderId && String(senderId).toUpperCase() === String(currentUser.id).toUpperCase()) return;
    const key = `${signalType}_${JSON.stringify(payload || {})}`;
    if (processedSignalKeysRef.current.has(key)) return;
    processedSignalKeysRef.current.add(key);

    const pc = pcRef.current;
    if (!pc || !payload) return;

    try {
      if (signalType === 'offer' && !session.isCaller) {
        if (pc.signalingState !== 'stable') return;
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
        await flushPendingCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal('answer', answer);
      } else if (signalType === 'answer' && session.isCaller) {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          await flushPendingCandidates(pc);
          setCallStatus('connected');
        }
      } else if (signalType === 'ice-candidate') {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(payload));
        } else {
          pendingCandidatesRef.current.push(payload);
        }
      }
    } catch {}
  };

  const replayCachedSignals = async () => {
    try {
      const res = await fetch(`/api/calls/session/${encodeURIComponent(session.callId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const s = data?.session;
      if (!s) return;

      if (!session.isCaller && s.offer) {
        await processIncomingSignal('offer', s.offer, s.callerId);
      } else if (session.isCaller && s.answer) {
        await processIncomingSignal('answer', s.answer, s.calleeId);
      }

      if (Array.isArray(s.iceCandidates)) {
        for (const item of s.iceCandidates) {
          if (item?.candidate) {
            await processIncomingSignal('ice-candidate', item.candidate, item.senderId);
          }
        }
      }
    } catch {}
  };

  const setupPeerConnection = (stream: MediaStream | null) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
      ],
    });
    pcRef.current = pc;

    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'recvonly' });
        if (session.type === 'video') {
          pc.addTransceiver('video', { direction: 'recvonly' });
        }
      } catch {}
    }

    pc.ontrack = (event) => {
      const remote = event.streams[0] || new MediaStream([event.track]);
      setRemoteStream(remote);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('ice-candidate', event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (pc.connectionState === 'closed') {
        handleEndCall();
      }
    };

    return pc;
  };

  const startCallerOffer = async (pc: RTCPeerConnection) => {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: session.type === 'video',
      });
      await pc.setLocalDescription(offer);
      sendSignal('offer', offer);
    } catch {}
  };

  // Setup WebRTC + WebSocket + SSE signaling listeners + cached signal replay
  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let replayTimer: any = null;

    initializeMedia(facingMode).then(async (stream) => {
      if (!isMounted) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      const pc = setupPeerConnection(stream);

      if (session.isCaller) {
        await startCallerOffer(pc);
      } else {
        // Receiver replays offer/ICE immediately in case offer arrived before modal mounted
        await replayCachedSignals();
      }
    });

    // Dedicated WebSocket signaling connection for lowest latency multi-device WebRTC
    try {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws?userId=${encodeURIComponent(currentUser.id)}`);
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (!msg?.data || msg.data.callId !== session.callId) return;
          if (msg.event === 'call-accepted') {
            setCallStatus('connected');
            replayCachedSignals();
          } else if (msg.event === 'call-rejected' || msg.event === 'call-ended' || msg.event === 'call-missed') {
            handleEndCall();
          } else if (msg.event === 'call-signal') {
            processIncomingSignal(msg.data.signalType, msg.data.payload, msg.data.senderId);
          }
        } catch {}
      };
    } catch {}

    const handleSSEMessage = (e: any) => {
      try {
        const detail = e.detail;
        if (!detail || detail.callId !== session.callId) return;
        if (e.type === 'ze-call-accepted') {
          setCallStatus('connected');
          replayCachedSignals();
        } else if (e.type === 'ze-call-rejected' || e.type === 'ze-call-ended') {
          handleEndCall();
        } else if (e.type === 'ze-call-signal') {
          processIncomingSignal(detail.signalType, detail.payload, detail.senderId);
        }
      } catch {}
    };

    const handleNativeAccept = (e: any) => {
      const detail = e.detail;
      if (!detail || detail.callId === session.callId) {
        handleAnswerCall();
      }
    };

    window.addEventListener('ze-call-accepted' as any, handleSSEMessage);
    window.addEventListener('ze-call-rejected' as any, handleSSEMessage);
    window.addEventListener('ze-call-ended' as any, handleSSEMessage);
    window.addEventListener('ze-call-signal' as any, handleSSEMessage);
    window.addEventListener('ze-native-call-accept' as any, handleNativeAccept);

    // Periodic fallback sync while ringing/calling in case a signal was missed
    replayTimer = setInterval(() => {
      if (pcRef.current && (!pcRef.current.remoteDescription || !pcRef.current.remoteDescription.type)) {
        replayCachedSignals();
      }
    }, 2000);

    return () => {
      isMounted = false;
      clearInterval(replayTimer);
      try {
        ws?.close();
      } catch {}
      window.removeEventListener('ze-call-accepted' as any, handleSSEMessage);
      window.removeEventListener('ze-call-rejected' as any, handleSSEMessage);
      window.removeEventListener('ze-call-ended' as any, handleSSEMessage);
      window.removeEventListener('ze-call-signal' as any, handleSSEMessage);
      window.removeEventListener('ze-native-call-accept' as any, handleNativeAccept);
      soundEngine.stop();
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {}
        pcRef.current = null;
      }
    };
  }, []);

  const handleAnswerCall = async () => {
    setCallStatus('connected');
    soundEngine.stop();
    try {
      await fetch('/api/calls/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: session.callId,
          action: 'accept',
          userId: currentUser.id,
        }),
      });
      await replayCachedSignals();
    } catch {}
  };

  const handleRejectCall = async () => {
    soundEngine.stop();
    try {
      await fetch('/api/calls/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId: session.callId,
          action: 'reject',
          userId: currentUser.id,
        }),
      });
    } catch {}
    handleEndCall();
  };

  const handleEndCall = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    soundEngine.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (vibrateTimerRef.current) clearInterval(vibrateTimerRef.current);

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }

    fetch('/api/calls/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId: session.callId,
        userId: currentUser.id,
        durationSeconds: duration,
      }),
    }).catch(() => {});

    onEndCall();
  };

  const handleToggleMute = () => {
    if (localStream) {
      const next = !isMuted;
      localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
      setIsMuted(next);
    }
  };

  const handleToggleVideo = () => {
    if (localStream && session.type === 'video') {
      const next = !isVideoOff;
      localStream.getVideoTracks().forEach((t) => (t.enabled = !next));
      setIsVideoOff(next);
    }
  };

  const handleSwitchCamera = async () => {
    if (session.type !== 'video' || !localStream) return;
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);

    localStream.getVideoTracks().forEach((t) => t.stop());

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: nextFacing },
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        const oldVideo = localStream.getVideoTracks()[0];
        if (oldVideo) localStream.removeTrack(oldVideo);
        localStream.addTrack(newVideoTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
        if (pcRef.current) {
          const sender = pcRef.current.getSenders().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            await sender.replaceTrack(newVideoTrack);
          }
        }
      }
    } catch {}
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#07080b] flex flex-col justify-between p-4 sm:p-6 select-none overflow-hidden text-white font-sans">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* CLEAN TOP BAR (No debug/telemetry banners) */}
      <div className="relative z-30 flex items-center justify-between bg-white/[0.06] backdrop-blur-xl border border-white/10 rounded-full px-4 py-2.5 shadow-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/assets/vnjava_logo.jpg"
            alt="VNJAVA"
            className="w-7 h-7 rounded-full object-cover border border-white/20 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">
              {session.type === 'video' ? 'Panggilan Video' : 'Panggilan Suara'}
            </p>
            <p className="text-[11px] text-white/60 truncate">{session.partnerName}</p>
          </div>
        </div>

        <div className="shrink-0">
          {callStatus === 'connected' ? (
            <span className="text-xs font-mono font-bold text-white bg-white/10 border border-white/15 px-3 py-1 rounded-full">
              {formatTimer(duration)}
            </span>
          ) : callStatus === 'calling' ? (
            <span className="text-xs font-semibold text-white/80 bg-white/10 px-3 py-1 rounded-full">
              Memanggil...
            </span>
          ) : (
            <span className="text-xs font-semibold text-sky-300 bg-sky-500/15 border border-sky-400/30 px-3 py-1 rounded-full">
              Berdering...
            </span>
          )}
        </div>
      </div>

      {/* CENTER VIEWPORT */}
      <div className="flex-1 relative flex items-center justify-center my-4 overflow-hidden rounded-[28px] border border-white/10 bg-[#0c0d12] shadow-2xl">
        {session.type === 'video' ? (
          <>
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              {remoteStream ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white/20 bg-zinc-800 shadow-2xl flex items-center justify-center mb-4">
                    {session.partnerPhoto ? (
                      <img src={session.partnerPhoto} alt={session.partnerName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-white">
                        {session.partnerName.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-white">{session.partnerName}</h3>
                  <p className="text-xs text-white/55 mt-1">
                    {callStatus === 'connected'
                      ? 'Menghubungkan video...'
                      : session.isCaller
                      ? 'Memanggil...'
                      : 'Panggilan video masuk...'}
                  </p>
                </div>
              )}
            </div>

            {/* Local Camera PiP */}
            <div className="absolute top-4 right-4 w-28 sm:w-36 h-40 sm:h-48 rounded-2xl overflow-hidden bg-black border border-white/20 shadow-2xl z-20">
              {localStream && !isVideoOff ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-center p-2">
                  <VideoOff size={22} className="text-white/40 mb-1" />
                  <span className="text-[10px] text-white/40">Kamera Mati</span>
                </div>
              )}

              {localStream && !isVideoOff && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="absolute bottom-2 right-2 p-2 rounded-full bg-black/70 hover:bg-black text-white cursor-pointer"
                  title="Putar Kamera"
                >
                  <SwitchCamera size={14} />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-6 z-10">
            <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-white/20 bg-zinc-900 shadow-2xl flex items-center justify-center mb-6">
              {session.partnerPhoto ? (
                <img src={session.partnerPhoto} alt={session.partnerName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-white tracking-widest">
                  {session.partnerName.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">{session.partnerName}</h2>
            <p className="text-xs font-mono text-white/50 mb-4">
              {session.partnerUsername ? `@${session.partnerUsername}` : session.partnerId}
            </p>

            <span className="text-xs text-white/75 px-4 py-1.5 rounded-full bg-white/5 border border-white/10">
              {callStatus === 'connected'
                ? formatTimer(duration)
                : callStatus === 'calling'
                ? 'Memanggil...'
                : 'Panggilan Suara Masuk'}
            </span>
          </div>
        )}
      </div>

      {/* CONTROLS BAR */}
      <div className="relative z-30 max-w-lg mx-auto w-full">
        {!session.isCaller && callStatus === 'ringing' ? (
          <div className="flex items-center justify-center gap-10 py-3.5 bg-[#121318] border border-white/15 rounded-full px-8 shadow-2xl">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleRejectCall}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center active:scale-90 transition cursor-pointer shadow-lg"
                title="Tolak Panggilan"
              >
                <PhoneOff size={26} />
              </button>
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">Tolak</span>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={handleAnswerCall}
                className="w-16 h-16 rounded-full bg-sky-500 hover:bg-sky-400 text-white flex items-center justify-center active:scale-90 transition cursor-pointer shadow-lg"
                title="Angkat Panggilan"
              >
                <Phone size={26} />
              </button>
              <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">Angkat</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-around py-3 px-6 bg-[#121318] border border-white/15 rounded-full shadow-2xl">
            <button
              type="button"
              onClick={handleToggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition cursor-pointer ${
                isMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                  : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
              }`}
              title={isMuted ? 'Aktifkan Mikrofon' : 'Bisukan Mikrofon'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {session.type === 'video' && (
              <button
                type="button"
                onClick={handleToggleVideo}
                className={`w-12 h-12 rounded-full flex items-center justify-center transition cursor-pointer ${
                  isVideoOff
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                }`}
                title={isVideoOff ? 'Nyalakan Kamera' : 'Matikan Kamera'}
              >
                {isVideoOff ? <VideoOff size={20} /> : <VideoIcon size={20} />}
              </button>
            )}

            {session.type === 'video' && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/15 text-white border border-white/10 flex items-center justify-center transition cursor-pointer"
                title="Putar Kamera"
              >
                <SwitchCamera size={20} />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (remoteAudioRef.current) {
                  remoteAudioRef.current.muted = speakerOn;
                }
                setSpeakerOn(!speakerOn);
              }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition cursor-pointer ${
                !speakerOn
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
              }`}
              title={speakerOn ? 'Speaker Aktif' : 'Speaker Dimatikan'}
            >
              {speakerOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>

            <button
              type="button"
              onClick={handleEndCall}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center active:scale-95 transition cursor-pointer shadow-lg"
              title="Akhiri Panggilan"
            >
              <PhoneOff size={24} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
