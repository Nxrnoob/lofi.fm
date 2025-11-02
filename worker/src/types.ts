// Shared types for lofi.fm Worker

export type Theme = 'night-purple' | 'monochrome' | 'red-black' | 'everforest';

export interface User {
  userId: string;
  username: string;
  emoji: string;
  isAdmin: boolean;
  connection?: WebSocket; // Server-side only
}

export interface Song {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number;
  addedBy: string;
  addedAt: number;
}

export interface RoomState {
  roomId: string;
  roomName: string;
  queue: Song[];
  currentTrack: Song | null;
  isPlaying: boolean;
  startTimestamp: number | null;
  adminId: string;
  users: User[];
  theme?: Theme;
  chatHistory: ChatMessage[];
}

export interface ChatMessage {
  userId: string;
  username: string;
  emoji: string;
  message: string;
  timestamp: number;
}

// WebSocket Message Types
export type WSMessageType =
  | 'JOIN'
  | 'LEAVE'
  | 'ADD_SONG'
  | 'REMOVE_SONG'
  | 'PLAY'
  | 'PAUSE'
  | 'SEEK'
  | 'SKIP'
  | 'CHAT'
  | 'CHANGE_THEME'
  | 'KICK_USER'
  | 'CLEAR_QUEUE'
  | 'REQUEST_SYNC'
  | 'STATE'
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'SONG_ADDED'
  | 'SONG_REMOVED'
  | 'PLAYBACK_UPDATE'
  | 'CHAT_MESSAGE'
  | 'THEME_CHANGED'
  | 'ERROR';

export interface WSMessage<T = any> {
  type: WSMessageType;
  payload: T;
}

// Client -> Server Payloads
export interface JoinPayload {
  userId: string;
  username: string;
  emoji: string;
}

export interface AddSongPayload {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number;
}

export interface RemoveSongPayload {
  videoId: string;
}

export interface PlayPayload {
  timestamp: number;
}

export interface SeekPayload {
  timestamp: number;
  currentTime: number;
}

export interface ChatPayload {
  message: string;
}

export interface ChangeThemePayload {
  theme: Theme;
}

export interface KickUserPayload {
  userId: string;
}

// Server -> Client Payloads
export interface StatePayload {
  roomId: string;
  roomName: string;
  queue: Song[];
  currentTrack: Song | null;
  users: Omit<User, 'connection'>[];
  isPlaying: boolean;
  startTimestamp: number | null;
  adminId: string;
  theme?: Theme;
  chatHistory: ChatMessage[];
}

export interface UserJoinedPayload {
  user: Omit<User, 'connection'>;
}

export interface UserLeftPayload {
  userId: string;
  newAdminId?: string;
}

export interface SongAddedPayload {
  song: Song;
}

export interface SongRemovedPayload {
  videoId: string;
}

export interface PlaybackUpdatePayload {
  isPlaying: boolean;
  startTimestamp: number | null;
  currentTrack?: Song | null;
}

export interface ChatMessagePayload {
  userId: string;
  username: string;
  emoji: string;
  message: string;
  timestamp: number;
}

export interface ThemeChangedPayload {
  theme: Theme;
  changedBy: string;
}

export interface ErrorPayload {
  message: string;
  code?: string;
}

// YouTube API Types
export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number;
  channelTitle: string;
}

export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number;
  channelTitle: string;
}

export interface YouTubePlaylistInfo {
  playlistId: string;
  title: string;
  videos: YouTubeVideoInfo[];
}
