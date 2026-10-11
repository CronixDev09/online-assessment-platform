import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export type MediaState = 'IDLE' | 'REQUESTING' | 'READY' | 'DENIED' | 'STOPPED';

export interface ProctorEvent {
  type: string;
  warningCount?: number;
  warningsAllowed?: number | null;
  severity?: string;
  action?: 'NONE' | 'WARN' | 'DISQUALIFY_AND_SUBMIT' | 'SUBMIT';
}

interface Options {
  sessionId: string;
  enabled: boolean;
  onEvent: (event: ProctorEvent) => void;
}

/**
 * Wires real browser/media signals to the proctoring backend:
 * camera + microphone streams, tab visibility, window focus, fullscreen,
 * network state and periodic heartbeats. Every signal is reported to the
 * server, which owns the violation policy.
 */
export function useProctoring({ sessionId, enabled, onEvent }: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const [camera, setCamera] = useState<MediaState>('IDLE');
  const [mic, setMic] = useState<MediaState>('IDLE');
  const [connected, setConnected] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const report = useCallback(
    async (type: string, description?: string) => {
      try {
        const { data } = await api.post('/proctoring/events', { sessionId, type, description });
        onEventRef.current({ type, ...data });
      } catch {
        /* reporting is best-effort; never block the exam on a failed report */
      }
    },
    [sessionId],
  );

  // Camera + microphone
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setCamera('REQUESTING');
    setMic('REQUESTING');

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException('unsupported', 'NotSupportedError');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCamera('READY');
        setMic('READY');

        stream.getVideoTracks().forEach((t) =>
          t.addEventListener('ended', () => {
            setCamera('STOPPED');
            void report('CAMERA_STOPPED');
          }),
        );
        stream.getAudioTracks().forEach((t) =>
          t.addEventListener('ended', () => {
            setMic('STOPPED');
            void report('MICROPHONE_STOPPED');
          }),
        );

        void api.post('/proctoring/session', { sessionId }).catch(() => undefined);
      } catch (err) {
        if (cancelled) return;
        setCamera('DENIED');
        setMic('DENIED');
        const name = err instanceof DOMException ? err.name : 'Error';
        void report('CAMERA_DENIED', `Camera/microphone unavailable (${name})`);
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled, sessionId, report]);

  // Browser-level signals
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.hidden) void report('TAB_SWITCH', 'Browser tab hidden');
    };
    const onBlur = () => void report('WINDOW_BLUR', 'Browser window lost focus');
    const onFullscreen = () => {
      if (!document.fullscreenElement) void report('FULLSCREEN_EXIT', 'Fullscreen exited');
    };
    const onOffline = () => {
      setConnected(false);
      void report('NETWORK_LOST');
    };
    const onOnline = () => {
      setConnected(true);
      void report('NETWORK_RESTORED');
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('blur', onBlur);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, report]);

  // Heartbeat: keeps the session marked connected and pulls the authoritative status.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      api
        .post<{ status: string }>('/proctoring/heartbeat', { sessionId })
        .then((r) => {
          if (r.data.status !== 'IN_PROGRESS') {
            onEventRef.current({ type: 'SESSION_CLOSED', action: 'SUBMIT' });
          }
        })
        .catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(id);
  }, [enabled, sessionId]);

  const requestFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* user may need to click first */
    }
  }, []);

  return { videoRef, camera, mic, connected, requestFullscreen, report };
}
