import { useId } from "react";
import { AudioLines, Mic, MicOff, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tutorContent } from "./content";
import { ResponseCountdown } from "./ResponseCountdown";
import type { SpeechState, VoiceStatus } from "./useSpeech";

type VoiceControlsProps = {
  speech: SpeechState;
};

const STATUS_TEXT: Record<Exclude<VoiceStatus, "off">, string> = {
  needsActivation: tutorContent.voice.needsActivation,
  speaking: tutorContent.voice.speaking,
  waiting: tutorContent.voice.waiting,
  listening: tutorContent.voice.listening,
  muted: tutorContent.voice.muted,
  stalled: tutorContent.voice.stalled,
  ready: tutorContent.voice.ready,
};

// Above the composer in voice mode: what voice is doing now (in words and an icon, never
// color alone), the live transcript while listening, the countdown to sending it once the
// learner pauses, Send now, Stop speaking, and the mic mute toggle.
// Typing in the composer below still works at any time.
export function VoiceControls({ speech }: VoiceControlsProps) {
  const groupId = useId();
  const { voice } = tutorContent;
  const { status } = speech;
  if (status === "off") return null;

  const listening = status === "listening";
  const { countdown } = speech;
  const StatusIcon = status === "speaking" ? AudioLines : speech.muted ? MicOff : Mic;

  return (
    <div
      role="group"
      aria-labelledby={groupId}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-input bg-card px-3 py-2"
    >
      <h3 id={groupId} className="sr-only">
        {voice.label}
      </h3>
      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <span className="relative flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
          {listening && <span className="absolute inset-0 rounded-full bg-brand/30 motion-safe:animate-ping" />}
          <StatusIcon className={cn("relative size-4", listening || status === "speaking" ? "text-brand" : "text-muted-foreground")} />
        </span>
        <div className="min-w-0">
          {/* Announces each change of turn ("Listening…"), not the words as they're heard. */}
          <p role="status" className={cn(listening ? "font-medium text-foreground" : "text-secondary-foreground")}>
            {STATUS_TEXT[status]}
          </p>
          {listening && speech.interim && (
            <p className="truncate text-secondary-foreground">{voice.heard(speech.interim)}</p>
          )}
          {/* Announced once as the countdown starts, not every second. */}
          <p aria-live="polite" className="sr-only">
            {countdown ? voice.countdownAnnouncement(Math.round(countdown.ms / 1000)) : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status === "needsActivation" && (
          <Button
            type="button"
            size="sm"
            onClick={speech.activate}
            className="bg-brand text-brand-foreground hover:bg-brand/85 pointer-coarse:h-11"
          >
            <AudioLines aria-hidden="true" />
            {voice.activate}
          </Button>
        )}
        {status === "speaking" && (
          <Button type="button" variant="outline" size="sm" onClick={speech.stopSpeaking} className="pointer-coarse:h-11">
            <Square className="size-3 fill-current" aria-hidden="true" />
            {voice.stopSpeaking}
          </Button>
        )}
        {listening && speech.interim && (
          <Button type="button" variant="outline" size="sm" onClick={speech.sendNow} className="pointer-coarse:h-11">
            <Send aria-hidden="true" />
            {voice.sendNow}
          </Button>
        )}
        {status !== "needsActivation" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={speech.muted}
            aria-label={voice.muteLabel}
            onClick={speech.toggleMute}
            className={cn("pointer-coarse:h-11", speech.muted && "border-ring bg-accent text-foreground")}
          >
            {speech.muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
            {voice.mute}
          </Button>
        )}
      </div>
      {countdown && <ResponseCountdown key={countdown.startedAt} startedAt={countdown.startedAt} ms={countdown.ms} />}
    </div>
  );
}
