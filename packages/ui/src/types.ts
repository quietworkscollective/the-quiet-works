import type { ReactNode } from 'react';
import type { CertificationState, Memo, MemoSource } from '@tqw/engine';

export interface Settings {
  /** Sound muted. Independent of whether audio has been unlocked yet. */
  muted: boolean;
  reducedMotion: boolean;
  captions: boolean;
  textMode: boolean;
}

export type SettingKey = keyof Settings;

export interface StampButtonProps {
  pressing: boolean;
  /** Called synchronously in the gesture handler (pointerdown, Space/Enter keydown, AT click). */
  onPressStart(): void;
  /** pointerup / pointercancel / keyup / blur while held / AT click. */
  onPressEnd(): void;
  /** 'dock' = compact control over the 3D scene; 'desk' = large primary control in text mode. */
  variant: 'dock' | 'desk';
}

export interface SettingsBarProps {
  settings: Settings;
  onToggle(key: SettingKey): void;
  /** False when WebGL is unavailable: the text-mode toggle is shown pressed and disabled. */
  canLeaveTextMode: boolean;
}

export interface MachineReadoutProps {
  state: CertificationState;
  /** Visible line in the dock; always also a polite live region. */
  visible: boolean;
}

export interface MemoDialogProps {
  memo: Memo;
  source: MemoSource | null;
  open: boolean;
  onClose(): void;
}

export interface MemoButtonProps {
  onOpen(): void;
}

export interface CaptionLine {
  id: number;
  text: string;
}

export interface CaptionsProps {
  lines: readonly CaptionLine[];
}

export interface TextOfficeProps {
  impressionPosition?: 'left' | 'centre' | 'right';
  state: CertificationState;
  /** Why text mode is showing, rendered as a notice. */
  notice: string;
  /** Rendered after the notice, e.g. a "Try 3D again" button. */
  noticeAction?: ReactNode;
  reducedMotion: boolean;
  onPressStart(): void;
  onPressEnd(): void;
  onOpenMemo(): void;
  onReset(): void;
}
