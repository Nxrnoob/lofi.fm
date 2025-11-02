import { DurableObject } from 'cloudflare:workers';
import type {
  RoomState,
  User,
  Song,
  ChatMessage,
  WSMessage,
  JoinPayload,
  AddSongPayload,
  RemoveSongPayload,
  PlayPayload,
  SeekPayload,
  ChatPayload,
  ChangeThemePayload,
  KickUserPayload,
  StatePayload,
  Theme,
} from './types';

const MAX_USERS = 10;
const MAX_QUEUE_SIZE = 100;
const MAX_CHAT_HISTORY = 100;

export class Room extends DurableObject {
  private state: RoomState;
  private sessions: Map<WebSocket, User> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    
    // Initialize default state
    this.state = {
      roomId: '',
      roomName: '',
      queue: [],
      currentTrack: null,
      isPlaying: false,
      startTimestamp: null,
      adminId: '',
      users: [],
      chatHistory: [],
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      console.log('WebSocket upgrade requested for room:', this.state.roomId);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept the WebSocket connection
      this.ctx.acceptWebSocket(server);
      console.log('WebSocket accepted');
      
      // Return the client side of the pair
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // HTTP endpoints
    if (url.pathname === '/init' && request.method === 'POST') {
      const body = await request.json() as { roomId: string; roomName: string };
      this.state.roomId = body.roomId;
      this.state.roomName = body.roomName;
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/state' && request.method === 'GET') {
      return new Response(JSON.stringify(this.getPublicState()), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = JSON.parse(message as string) as WSMessage;
      console.log('Received message:', data.type);
      await this.handleMessage(ws, data);
    } catch (error) {
      console.error('Message handling error:', error);
      this.sendError(ws, 'Invalid message format');
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    console.log('WebSocket closed:', code, reason, wasClean);
    const user = this.sessions.get(ws);
    if (user) {
      this.handleUserLeave(user.userId);
      this.sessions.delete(ws);
    }
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    console.error('WebSocket error:', error);
    const user = this.sessions.get(ws);
    if (user) {
      this.handleUserLeave(user.userId);
      this.sessions.delete(ws);
    }
  }

  private async handleMessage(ws: WebSocket, message: WSMessage) {
    const user = this.sessions.get(ws);

    switch (message.type) {
      case 'JOIN':
        await this.handleJoin(ws, message.payload as JoinPayload);
        break;

      case 'ADD_SONG':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handleAddSong(user, message.payload as AddSongPayload);
        break;

      case 'REMOVE_SONG':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handleRemoveSong(user, message.payload as RemoveSongPayload);
        break;

      case 'PLAY':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handlePlay(user, message.payload as PlayPayload);
        break;

      case 'PAUSE':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handlePause(user);
        break;

      case 'SEEK':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handleSeek(user, message.payload as SeekPayload);
        break;

      case 'SKIP':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handleSkip(user);
        break;

      case 'CHAT':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handleChat(user, message.payload as ChatPayload);
        break;

      case 'CHANGE_THEME':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handleChangeTheme(user, message.payload as ChangeThemePayload);
        break;

      case 'KICK_USER':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handleKickUser(user, message.payload as KickUserPayload);
        break;

      case 'CLEAR_QUEUE':
        if (!user) return this.sendError(ws, 'Not authenticated');
        await this.handleClearQueue(user);
        break;

      case 'REQUEST_SYNC':
        if (!user) return this.sendError(ws, 'Not authenticated');
        this.sendState(ws);
        break;

      default:
        this.sendError(ws, 'Unknown message type');
    }
  }

  private async handleJoin(ws: WebSocket, payload: JoinPayload) {
    // Check room capacity
    if (this.state.users.length >= MAX_USERS) {
      this.sendError(ws, 'Room is full');
      ws.close(1008, 'Room is full');
      return;
    }

    // Check if user already exists (reconnection)
    const existingUser = this.state.users.find(u => u.userId === payload.userId);
    
    if (existingUser) {
      // Update connection
      existingUser.connection = ws;
      this.sessions.set(ws, existingUser);
    } else {
      // New user
      const isFirstUser = this.state.users.length === 0;
      const user: User = {
        userId: payload.userId,
        username: payload.username,
        emoji: payload.emoji,
        isAdmin: isFirstUser,
        connection: ws,
      };

      if (isFirstUser) {
        this.state.adminId = user.userId;
      }

      this.state.users.push(user);
      this.sessions.set(ws, user);

      // Broadcast user joined
      this.broadcast({
        type: 'USER_JOINED',
        payload: { user: this.sanitizeUser(user) },
      }, ws);
    }

    // Send current state to joining user
    this.sendState(ws);
  }

  private handleUserLeave(userId: string) {
    const userIndex = this.state.users.findIndex(u => u.userId === userId);
    if (userIndex === -1) return;

    const wasAdmin = this.state.users[userIndex].isAdmin;
    this.state.users.splice(userIndex, 1);

    // Transfer admin if needed
    let newAdminId: string | undefined;
    if (wasAdmin && this.state.users.length > 0) {
      this.state.users[0].isAdmin = true;
      this.state.adminId = this.state.users[0].userId;
      newAdminId = this.state.adminId;
    }

    // Broadcast user left
    this.broadcast({
      type: 'USER_LEFT',
      payload: { userId, newAdminId },
    });

    // If room is empty, clean up
    if (this.state.users.length === 0) {
      this.state.queue = [];
      this.state.currentTrack = null;
      this.state.isPlaying = false;
      this.state.startTimestamp = null;
      this.state.chatHistory = [];
    }
  }

  private async handleAddSong(user: User, payload: AddSongPayload) {
    if (this.state.queue.length >= MAX_QUEUE_SIZE) {
      return this.sendError(user.connection!, 'Queue is full');
    }

    const song: Song = {
      videoId: payload.videoId,
      title: payload.title,
      thumbnail: payload.thumbnail,
      duration: payload.duration,
      addedBy: user.userId,
      addedAt: Date.now(),
    };

    this.state.queue.push(song);

    // If no current track, start playing
    if (!this.state.currentTrack && this.state.queue.length === 1) {
      this.state.currentTrack = this.state.queue.shift() || null;
      this.state.isPlaying = true;
      this.state.startTimestamp = Date.now();
    }

    this.broadcast({
      type: 'SONG_ADDED',
      payload: { song },
    });

    // Send playback update if we started playing
    if (this.state.currentTrack?.videoId === song.videoId) {
      this.broadcast({
        type: 'PLAYBACK_UPDATE',
        payload: {
          isPlaying: this.state.isPlaying,
          startTimestamp: this.state.startTimestamp,
          currentTrack: this.state.currentTrack,
        },
      });
    }
  }

  private async handleRemoveSong(user: User, payload: RemoveSongPayload) {
    if (!user.isAdmin) {
      return this.sendError(user.connection!, 'Only admin can remove songs');
    }

    const index = this.state.queue.findIndex(s => s.videoId === payload.videoId);
    if (index === -1) {
      return this.sendError(user.connection!, 'Song not found in queue');
    }

    this.state.queue.splice(index, 1);

    this.broadcast({
      type: 'SONG_REMOVED',
      payload: { videoId: payload.videoId },
    });
  }

  private async handlePlay(user: User, payload: PlayPayload) {
    if (!user.isAdmin) {
      return this.sendError(user.connection!, 'Only admin can control playback');
    }

    this.state.isPlaying = true;
    this.state.startTimestamp = payload.timestamp;

    this.broadcast({
      type: 'PLAYBACK_UPDATE',
      payload: {
        isPlaying: true,
        startTimestamp: this.state.startTimestamp,
      },
    });
  }

  private async handlePause(user: User) {
    if (!user.isAdmin) {
      return this.sendError(user.connection!, 'Only admin can control playback');
    }

    this.state.isPlaying = false;

    this.broadcast({
      type: 'PLAYBACK_UPDATE',
      payload: {
        isPlaying: false,
        startTimestamp: this.state.startTimestamp,
      },
    });
  }

  private async handleSeek(user: User, payload: SeekPayload) {
    if (!user.isAdmin) {
      return this.sendError(user.connection!, 'Only admin can seek');
    }

    this.state.startTimestamp = payload.timestamp;

    this.broadcast({
      type: 'PLAYBACK_UPDATE',
      payload: {
        isPlaying: this.state.isPlaying,
        startTimestamp: this.state.startTimestamp,
      },
    });
  }

  private async handleSkip(user: User) {
    if (!user.isAdmin) {
      return this.sendError(user.connection!, 'Only admin can skip');
    }

    // Move to next song
    if (this.state.queue.length > 0) {
      this.state.currentTrack = this.state.queue.shift() || null;
      this.state.startTimestamp = Date.now();
      this.state.isPlaying = true;
    } else {
      this.state.currentTrack = null;
      this.state.startTimestamp = null;
      this.state.isPlaying = false;
    }

    this.broadcast({
      type: 'PLAYBACK_UPDATE',
      payload: {
        isPlaying: this.state.isPlaying,
        startTimestamp: this.state.startTimestamp,
        currentTrack: this.state.currentTrack,
      },
    });
  }

  private async handleChat(user: User, payload: ChatPayload) {
    const chatMessage: ChatMessage = {
      userId: user.userId,
      username: user.username,
      emoji: user.emoji,
      message: payload.message.substring(0, 500), // Limit message length
      timestamp: Date.now(),
    };

    this.state.chatHistory.push(chatMessage);

    // Keep only last MAX_CHAT_HISTORY messages
    if (this.state.chatHistory.length > MAX_CHAT_HISTORY) {
      this.state.chatHistory = this.state.chatHistory.slice(-MAX_CHAT_HISTORY);
    }

    this.broadcast({
      type: 'CHAT_MESSAGE',
      payload: chatMessage,
    });
  }

  private async handleChangeTheme(user: User, payload: ChangeThemePayload) {
    this.state.theme = payload.theme;

    this.broadcast({
      type: 'THEME_CHANGED',
      payload: {
        theme: payload.theme,
        changedBy: user.userId,
      },
    });
  }

  private async handleKickUser(user: User, payload: KickUserPayload) {
    if (!user.isAdmin) {
      return this.sendError(user.connection!, 'Only admin can kick users');
    }

    if (payload.userId === user.userId) {
      return this.sendError(user.connection!, 'Cannot kick yourself');
    }

    const targetUser = this.state.users.find(u => u.userId === payload.userId);
    if (!targetUser) {
      return this.sendError(user.connection!, 'User not found');
    }

    // Close their connection
    if (targetUser.connection) {
      this.sendError(targetUser.connection, 'You have been kicked from the room');
      targetUser.connection.close(1008, 'Kicked by admin');
    }

    this.handleUserLeave(targetUser.userId);
  }

  private async handleClearQueue(user: User) {
    if (!user.isAdmin) {
      return this.sendError(user.connection!, 'Only admin can clear queue');
    }

    this.state.queue = [];

    this.broadcast({
      type: 'STATE',
      payload: this.getPublicState(),
    });
  }

  private sendState(ws: WebSocket) {
    this.send(ws, {
      type: 'STATE',
      payload: this.getPublicState(),
    });
  }

  private getPublicState(): StatePayload {
    return {
      roomId: this.state.roomId,
      roomName: this.state.roomName,
      queue: this.state.queue,
      currentTrack: this.state.currentTrack,
      users: this.state.users.map(u => this.sanitizeUser(u)),
      isPlaying: this.state.isPlaying,
      startTimestamp: this.state.startTimestamp,
      adminId: this.state.adminId,
      theme: this.state.theme,
      chatHistory: this.state.chatHistory,
    };
  }

  private sanitizeUser(user: User): Omit<User, 'connection'> {
    return {
      userId: user.userId,
      username: user.username,
      emoji: user.emoji,
      isAdmin: user.isAdmin,
    };
  }

  private send(ws: WebSocket, message: WSMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }

  private broadcast(message: WSMessage, exclude?: WebSocket) {
    for (const [ws, user] of this.sessions.entries()) {
      if (ws !== exclude) {
        this.send(ws, message);
      }
    }
  }

  private sendError(ws: WebSocket, message: string) {
    this.send(ws, {
      type: 'ERROR',
      payload: { message },
    });
  }
}
