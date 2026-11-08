import type { DeviceInfo, DeviceStats, DeviceStatus, TunnelLayer } from './device'

export type WSMessageType =
  | 'agent:register'
  | 'agent:heartbeat'
  | 'agent:stats'
  | 'agent:status'
  | 'agent:command_result'
  | 'agent:ssh_opened'
  | 'agent:ssh_data'
  | 'agent:ssh_closed'
  | 'agent:ssh_error'
  | 'agent:ssh_info'
  | 'agent:pty_opened'
  | 'agent:pty_data'
  | 'agent:pty_closed'
  | 'agent:pty_error'
  // ── Screen sharing (v1.6.0) ──────────────────────────────────────────────
  | 'agent:screen_frame'
  | 'agent:screen_closed'
  | 'agent:screen_error'
  | 'agent:screen_unavailable'
  // ── Remote control (v2.0.0) ──────────────────────────────────────────────
  | 'agent:screen_monitors'
  | 'agent:screen_clipboard'
  | 'agent:screen_control_ack'
  | 'agent:screen_control_granted'
  | 'agent:screen_control_denied'
  | 'server:screen_control_request'
  // ── In-session chat (v3.0.0) ─────────────────────────────────────────────
  | 'agent:screen_chat'
  | 'server:screen_chat'
  // ── v3.6: audio / rotation / brightness ────────────────────────────────
  | 'agent:audio_chunk'
  | 'agent:audio_status'
  | 'agent:screen_rotate_status'
  | 'agent:screen_rotate_result'
  | 'agent:screen_brightness_status'
  | 'agent:screen_state'
  | 'agent:screen_display_state'
  | 'server:audio_control'
  | 'server:screen_rotate'
  | 'server:screen_rotate_auto'
  | 'server:screen_brightness'
  // ── Chunked file write (v3.0.0) ──────────────────────────────────────────
  | 'server:fs_write_chunk'
  | 'server:registered'
  | 'server:command'
  | 'server:error'
  | 'server:ssh_open'
  | 'server:ssh_data'
  | 'server:ssh_resize'
  | 'server:ssh_close'
  | 'server:pty_open'
  | 'server:pty_data'
  | 'server:pty_resize'
  | 'server:pty_close'
  | 'server:fs_request'
  | 'server:screen_start'
  | 'server:screen_stop'
  // ── Remote control — server → agent (v2.0.0) ─────────────────────────────
  | 'server:screen_mouse'
  | 'server:screen_key'
  | 'server:screen_clipboard_read'
  | 'server:screen_clipboard_write'
  | 'server:screen_get_monitors'
  | 'server:screen_set_monitor'
  | 'server:screen_privacy'
  | 'server:screen_set_quality'
  | 'agent:fs_result'
  | 'agent:fs_chunk'
  | 'client:subscribe'
  | 'client:command'
  | 'client:ai_chat'
  | 'broadcast:device_update'
  | 'broadcast:stats_update'
  | 'broadcast:notification'
  | 'screen:ping'
  | 'screen:pong'
  // ── Application-level keepalive (v3.0.0) — works through reverse proxies ──
  | 'server:ping'
  | 'agent:pong'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): agent:* ──
  | 'agent:capabilities_update'
  | 'agent:fs_response'
  | 'agent:ft_error'
  | 'agent:pty_output'
  | 'agent:screen_clipboard_change'
  | 'agent:screen_clipboard_watch_ack'
  | 'agent:screen_cursor'
  | 'agent:screen_input_warning'
  | 'agent:screen_resolution_applied'
  | 'agent:screen_resolutions'
  | 'agent:startup_state'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): alert:* ──
  | 'alert:triggered'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): client:* ──
  | 'client:screen_control'
  | 'client:screen_start'
  | 'client:screen_stop'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): device:* ──
  | 'device:heartbeat'
  | 'device:startup'
  | 'device:status'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): ft:* ──
  | 'ft:progress'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): pty:* ──
  | 'pty:closed'
  | 'pty:connect'
  | 'pty:connected'
  | 'pty:data'
  | 'pty:disconnect'
  | 'pty:error'
  | 'pty:input'
  | 'pty:resize'
  | 'pty:stop'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): relay:* ──
  | 'relay:close'
  | 'relay:data'
  | 'relay:hello'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): rtc:* ──
  | 'rtc:signal'
  | 'rtc:start'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): screen:* ──
  | 'screen:annotate'
  | 'screen:audio'
  | 'screen:audio_control'
  | 'screen:audio_status'
  | 'screen:brightness'
  | 'screen:brightness_status'
  | 'screen:chat'
  | 'screen:chat_history'
  | 'screen:clipboard'
  | 'screen:clipboard_apply'
  | 'screen:clipboard_local'
  | 'screen:clipboard_read'
  | 'screen:clipboard_sync'
  | 'screen:clipboard_sync_direction'
  | 'screen:clipboard_sync_enable'
  | 'screen:clipboard_sync_reverse'
  | 'screen:clipboard_sync_state'
  | 'screen:clipboard_write'
  | 'screen:closed'
  | 'screen:control_denied'
  | 'screen:control_granted'
  | 'screen:cursor'
  | 'screen:display'
  | 'screen:display_state'
  | 'screen:error'
  | 'screen:frame'
  | 'screen:get_monitors'
  | 'screen:get_resolutions'
  | 'screen:input_warning'
  | 'screen:key_event'
  | 'screen:monitors'
  | 'screen:mouse_event'
  | 'screen:privacy'
  | 'screen:record_start'
  | 'screen:record_status'
  | 'screen:record_stop'
  | 'screen:request_control'
  | 'screen:resolution_applied'
  | 'screen:resolutions'
  | 'screen:rotate'
  | 'screen:rotate_auto'
  | 'screen:rotate_result'
  | 'screen:rotate_status'
  | 'screen:set_monitor'
  | 'screen:set_quality'
  | 'screen:set_resolution'
  | 'screen:state'
  | 'screen:stop'
  | 'screen:unavailable'
  | 'screen:viewer_count'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): server:* ──
  | 'server:force_keyframe'
  | 'server:ft_abort'
  | 'server:ft_finish'
  | 'server:ft_open'
  | 'server:ft_put_many'
  | 'server:ft_read'
  | 'server:ft_write'
  | 'server:pong'
  | 'server:pty_start'
  | 'server:pty_stop'
  | 'server:screen_clipboard_watch'
  | 'server:screen_control'
  | 'server:screen_display'
  | 'server:screen_get_resolutions'
  | 'server:screen_set_delta'
  | 'server:screen_set_resolution'
  | 'server:set_startup'
  | 'server:snapshot'
  // ── P1-3 — مقيسة من الشيفرة الحيّة (2026-11-08): session:* ──
  | 'session:accept'
  | 'session:close'
  | 'session:closed'
  | 'session:decision_result'
  | 'session:denied'
  | 'session:deny'
  | 'session:error'
  | 'session:expired'
  | 'session:offer'
  | 'session:ready'
  | 'session:resumed'
  | 'session:state'
  | 'session:suspended'
  | 'session:throttled'
  | 'session:ticket'
  | 'session:token'

export interface WSMessage<T = unknown> {
  type: WSMessageType
  payload: T
  timestamp: number
}

// ── Remote Control Types (v2.0.0) ────────────────────────────────────────────

export interface RemoteMouseEvent {
  sessionId: string
  type: 'move' | 'down' | 'up' | 'click' | 'dblclick' | 'scroll'
  x: number
  y: number
  button?: 0 | 1 | 2
  deltaY?: number
}

export interface RemoteKeyEvent {
  sessionId: string
  type: 'down' | 'up' | 'press'
  key: string
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[]
}

export interface MonitorInfo {
  id: number
  x: number
  y: number
  width: number
  height: number
  primary: boolean
  name: string
}

export interface AgentCapabilities {
  pty: boolean
  sshAvailable: boolean
  sshPort?: number
  sshUsername?: string
  shell?: string
  screenControl?: boolean
  clipboard?: boolean
  multiMonitor?: boolean
  monitors?: MonitorInfo[]
  docker?: boolean
}

export interface AgentRegisterPayload {
  token: string
  info: DeviceInfo
  stats: DeviceStats
  tunnelLayer: TunnelLayer
  capabilities?: AgentCapabilities
  sshInfo?: {
    available: boolean
    host?: string
    port?: number
    username?: string
  }
}

export interface AgentHeartbeatPayload {
  deviceId: string
  stats: DeviceStats
  tunnelLayer: TunnelLayer
  timestamp: number
  capabilities?: AgentCapabilities
}

export interface ServerCommandPayload {
  commandId: string
  type: 'shell' | 'sftp_list' | 'sftp_download' | 'sftp_upload'
  command?: string
  path?: string
  data?: string
}

export interface AgentCommandResultPayload {
  commandId: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

export interface BroadcastDeviceUpdatePayload {
  deviceId: string
  status: DeviceStatus
  tunnelLayer?: TunnelLayer
  info?: DeviceInfo
  capabilities?: AgentCapabilities
}

export interface BroadcastStatsUpdatePayload {
  deviceId: string
  stats: DeviceStats
}

export interface ServerSshOpenPayload {
  sessionId: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  rows?: number
  cols?: number
}

export interface SshDataPayload {
  sessionId: string
  data: string
}

export interface SshResizePayload {
  sessionId: string
  rows: number
  cols: number
}

export interface SshClosePayload {
  sessionId: string
}

export interface ServerPtyOpenPayload {
  sessionId: string
  rows?: number
  cols?: number
  shell?: 'cmd' | 'powershell' | 'bash' | 'sh' | 'zsh' | 'auto'
}

export interface PtyDataPayload {
  sessionId: string
  data: string
}

export interface PtyResizePayload {
  sessionId: string
  rows: number
  cols: number
}

// ── In-session chat (v3.0.0) ─────────────────────────────────────────────────
export interface ScreenChatPayload {
  sessionId: string
  text: string
  sender: 'viewer' | 'host'
  ts: number
}

// ── Chunked write (v3.0.0) ───────────────────────────────────────────────────
export interface FsWriteChunkPayload {
  opId:   string
  path:   string
  data:   string   // base64 chunk
  seq:    number
  total:  number
  isLast: boolean
}
