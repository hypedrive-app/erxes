import {
  IconMailbox,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconVolume,
  IconVolume2,
} from '@tabler/icons-react';
import { Button, Slider, cn } from 'erxes-ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import WaveSurfer from 'wavesurfer.js';
import {
  formatPlivoDuration,
  getPlivoRecordingUrl,
} from '@/integrations/plivo/utils/plivoHistoryUtils';

/**
 * Reads a CSS custom property's resolved value, not the token reference
 * itself. WaveSurfer paints to a <canvas>, and `fillStyle` is only specified
 * to accept a literal CSS <color> — whether an unresolved `var(--x)` string
 * is honoured there is inconsistent enough across engines that it is not
 * safe to hand it one directly. Reading getComputedStyle instead is what
 * makes the waveform pick up the SAME retinted color a white-labelled
 * instance's runtime theming already writes onto `--primary` at boot.
 */
const readToken = (name: string, fallback: string): string => {
  if (typeof window === 'undefined') return fallback;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();

  return value || fallback;
};

/**
 * Plays the audio attached to a call, with a real waveform — not a fixed
 * decorative pattern. WaveSurfer.js was chosen over hand-rolling Web Audio
 * decode + canvas drawing (more code, same CORS exposure, none of the
 * incremental-render or backpressure handling a maintained library already
 * has) and over Peaks.js (BBC's library: heavier, built for a waveform
 * EDITOR's zoom/scroll/region feature set this never needs, and its
 * canonical repo has moved off GitHub to Codeberg — a maintenance signal
 * this codebase should not take on for a play button).
 *
 * Uses the default MediaElement backend, not WebAudio: WaveSurfer's own docs
 * are explicit that WebAudio decodes the ENTIRE file into memory before
 * anything can play, which is the wrong tradeoff for a call recording that
 * can run up to an hour (`PLIVO_DEFAULT_TIME_LIMIT_SECONDS` on the backend).
 * MediaElement streams through the browser's native <audio> element instead
 * and only samples for the drawn bars.
 *
 * CORS is unavoidable either way — WaveSurfer fetches the file with the
 * browser's `fetch` API regardless of backend, so a recording still pointing
 * at Plivo's own URL (the re-host into our own storage failed) can fail to
 * decode if Plivo's CDN does not send the right headers. That failure is
 * caught via WaveSurfer's own `error` event and degrades to a plain seek
 * slider with the SAME playback, rather than losing audio entirely — a
 * recording our own storage serves (the common case; same-origin, always
 * decodes) gets the full waveform.
 *
 * The `isVoicemail` prop changes far more than a label. A voicemail is an
 * unhandled contact — someone tried to reach this number, failed, and left
 * something that still needs acting on — whereas a recording is just a record
 * of a conversation that already happened. So a voicemail is framed as a
 * warning with its own heading and "left at" time, while a recording is quiet
 * secondary chrome. Rendering them identically would let a waiting voicemail
 * disappear into a list of handled calls, which is the whole failure this
 * component exists to prevent.
 */
export const PlivoRecordingPlayer = ({
  recordUrl,
  isVoicemail,
  className,
}: {
  recordUrl: string;
  isVoicemail?: boolean | null;
  className?: string;
}) => {
  const { t } = useTranslation('frontline');
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  // 'loading' until WaveSurfer's own ready/error event resolves it. Neither
  // the bars nor the fallback slider render during 'loading' — showing both
  // at once (a plain truthy/falsy flag cannot tell "not decided yet" apart
  // from "decided, and it's the slider") is what a boolean here produced on
  // every single load, if only for one tick, before either won.
  const [waveformStatus, setWaveformStatus] = useState<
    'loading' | 'ready' | 'failed'
  >('loading');

  const url = getPlivoRecordingUrl(recordUrl);

  // The waveform. Skipped entirely once a prior attempt already failed for
  // this component instance, rather than retrying the same fetch on every
  // re-render.
  useEffect(() => {
    if (!waveformRef.current || waveformStatus === 'failed') return;

    const primary = readToken('--primary', '#4f46e5');
    const track = readToken('--muted', '#e5e7eb');

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      // `media` hands WaveSurfer the SAME <audio> element the transport
      // controls below already drive, so there is exactly one playback
      // engine and one source of truth for currentTime/duration/ended —
      // not two elements that could fall out of sync.
      media: audioRef.current ?? undefined,
      url,
      waveColor: track,
      progressColor: primary,
      cursorColor: 'transparent',
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      height: 32,
      normalize: true,
      interact: true,
    });

    wavesurferRef.current = wavesurfer;

    wavesurfer.on('ready', (readyDuration) => {
      setDuration(readyDuration);
      setWaveformStatus('ready');
    });

    // Covers both documented failure shapes: a decode error (unsupported
    // codec) and a fetch error (network/CORS) — either way playback keeps
    // working off the plain <audio> element below, only the bars are lost.
    wavesurfer.on('error', () => setWaveformStatus('failed'));

    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    const onTimeUpdate = () => setCurrentTime(element.currentTime);
    const onLoadedMetadata = () => {
      // Only the fallback path's own duration display depends on this — once
      // WaveSurfer is attached its 'ready' event is the source of truth, and
      // this would otherwise race it.
      if (waveformStatus !== 'ready') {
        setDuration(Number.isFinite(element.duration) ? element.duration : 0);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    element.addEventListener('timeupdate', onTimeUpdate);
    element.addEventListener('loadedmetadata', onLoadedMetadata);
    element.addEventListener('ended', onEnded);

    return () => {
      element.removeEventListener('timeupdate', onTimeUpdate);
      element.removeEventListener('loadedmetadata', onLoadedMetadata);
      element.removeEventListener('ended', onEnded);
    };
  }, [waveformStatus]);

  const togglePlay = () => {
    const element = audioRef.current;
    if (!element) return;

    if (isPlaying) {
      element.pause();
    } else {
      // Playing more than one recording at once in the same thread reads as
      // a bug, not a feature — pause every other player on the page first.
      document
        .querySelectorAll('audio[data-plivo-recording]')
        .forEach((other) => {
          if (other !== element) (other as HTMLAudioElement).pause();
        });
      element.play().catch(() => undefined);
    }

    setIsPlaying(!isPlaying);
  };

  const seek = (value: number[]) => {
    const element = audioRef.current;
    if (!element || !duration) return;

    element.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const toggleMute = () => {
    const element = audioRef.current;
    if (!element) return;

    element.muted = !element.muted;
    setIsMuted(element.muted);
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isVoicemail
          ? 'border-warning/30 bg-warning/5'
          : 'border-border bg-accent/40',
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {isVoicemail ? (
          <IconMailbox className="size-4 shrink-0 text-warning" />
        ) : (
          <IconPlayerPlayFilled className="size-3.5 shrink-0 text-accent-foreground" />
        )}
        <span className={cn(isVoicemail && 'text-warning')}>
          {isVoicemail ? t('plivo-voicemail') : t('plivo-call-recording')}
        </span>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- a phone call
          recording has no track to caption */}
      <audio ref={audioRef} data-plivo-recording preload="metadata" src={url} />

      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          size="icon"
          variant={isVoicemail ? 'outline' : 'secondary'}
          aria-label={
            isPlaying ? t('plivo-pause-recording') : t('plivo-play-recording')
          }
          onClick={togglePlay}
          className={cn(
            'size-8 shrink-0 rounded-full',
            isVoicemail && 'border-warning/40 text-warning hover:bg-warning/10',
          )}
        >
          {isPlaying ? (
            <IconPlayerPauseFilled className="size-3.5" />
          ) : (
            <IconPlayerPlayFilled className="size-3.5" />
          )}
        </Button>

        <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {formatPlivoDuration(currentTime)}
        </span>

        {/* The waveform container is always mounted, even before its own
            'ready'/'error' event has resolved — WaveSurfer needs it in the
            DOM to attach to on the very first render. Only its VISIBILITY is
            gated on the status, and only one of the two transports is ever
            visible at a time: showing both during the brief 'loading' window
            (what a two-value boolean produced here before) read as a
            rendering bug, not a loading state. */}
        <div
          ref={waveformRef}
          className={cn('flex-1', waveformStatus !== 'ready' && 'hidden')}
        />
        {waveformStatus === 'failed' && (
          <Slider
            value={[Math.min(currentTime, duration || currentTime)]}
            max={duration || 0.01}
            step={0.1}
            disabled={!duration}
            onValueChange={seek}
            aria-label={t('plivo-recording-seek')}
            className="flex-1"
          />
        )}
        {/* Reserves the same 32px WaveSurfer draws into and the slider
            occupies, so nothing in the row shifts once one of them appears —
            a skeleton, not dead space, for the one tick before WaveSurfer's
            'ready' or 'error' event has fired. */}
        {waveformStatus === 'loading' && (
          <div className="h-8 flex-1 animate-pulse rounded bg-muted" />
        )}

        <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatPlivoDuration(duration)}
        </span>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={
            isMuted ? t('plivo-unmute-recording') : t('plivo-mute-recording')
          }
          onClick={toggleMute}
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        >
          {isMuted ? (
            <IconVolume2 className="size-4" />
          ) : (
            <IconVolume className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
};
