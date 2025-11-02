interface Env {
	YOUTUBE_API_KEY: string;
	PUSHER_APP_ID: string;
	PUSHER_KEY: string;
	PUSHER_SECRET: string;
	PUSHER_CLUSTER: string;
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type',
};

// In-memory room state (for simple implementation)
// In production, you'd use KV or Durable Objects for persistence
const rooms = new Map<string, any>();

// Pusher HTTP API helper
async function triggerPusherEvent(env: Env, channel: string, event: string, data: any) {
	const body = JSON.stringify({
		name: event,
		channel: channel,
		data: JSON.stringify(data),
	});

	const timestamp = Math.floor(Date.now() / 1000);
	const bodyMd5 = await crypto.subtle.digest('MD5', new TextEncoder().encode(body))
		.then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
	
	const authString = `POST\n/apps/${env.PUSHER_APP_ID}/events\nauth_key=${env.PUSHER_KEY}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${bodyMd5}`;
	
	const authSignature = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(env.PUSHER_SECRET),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	).then(key => 
		crypto.subtle.sign('HMAC', key, new TextEncoder().encode(authString))
	).then(sig => 
		Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
	);

	const pusherUrl = `https://api-${env.PUSHER_CLUSTER}.pusher.com/apps/${env.PUSHER_APP_ID}/events?auth_key=${env.PUSHER_KEY}&auth_timestamp=${timestamp}&auth_version=1.0&body_md5=${bodyMd5}&auth_signature=${authSignature}`;

	const response = await fetch(pusherUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: body,
	});

	return response.ok;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Handle CORS preflight
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		// Health check
		if (url.pathname === '/health') {
			return new Response(JSON.stringify({ status: 'ok', service: 'lofi.fm' }), {
				headers: { ...corsHeaders, 'Content-Type': 'application/json' },
			});
		}

		// Create room
		if (url.pathname === '/api/rooms/create' && request.method === 'POST') {
			try {
				const body = await request.json() as { roomName: string };
				
				if (!body.roomName || !isValidRoomName(body.roomName)) {
					return new Response(
						JSON.stringify({ 
							error: 'Invalid room name. Use 3-32 alphanumeric characters and hyphens only.' 
						}),
						{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				const roomId = generateRoomId(body.roomName);
				
				// Initialize room state
				rooms.set(roomId, {
					roomId,
					roomName: body.roomName,
					queue: [],
					currentTrack: null,
					isPlaying: false,
					startTimestamp: null,
					adminId: '',
					users: [],
					chatHistory: [],
				});

				return new Response(
					JSON.stringify({ 
						roomId, 
						roomName: body.roomName,
					}),
					{ headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			} catch (error) {
				return new Response(
					JSON.stringify({ error: 'Failed to create room' }),
					{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}
		}

		// Get room state
		if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/state') && request.method === 'GET') {
			try {
				const roomId = url.pathname.split('/')[3];
				const room = rooms.get(roomId);

				if (!room) {
					return new Response(
						JSON.stringify({ error: 'Room not found' }),
						{ status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				return new Response(JSON.stringify(room), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			} catch (error) {
				return new Response(
					JSON.stringify({ error: 'Failed to get room state' }),
					{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}
		}

		// Handle room events (from client via HTTP)
		if (url.pathname.startsWith('/api/rooms/') && url.pathname.endsWith('/event') && request.method === 'POST') {
			try {
				const roomId = url.pathname.split('/')[3];
				const room = rooms.get(roomId);

				if (!room) {
					return new Response(
						JSON.stringify({ error: 'Room not found' }),
						{ status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				const event = await request.json() as any;
				
				// Update room state based on event
				handleRoomEvent(room, event);
				
				// Broadcast event to all clients via Pusher
				await triggerPusherEvent(env, `room-${roomId}`, event.type, event.payload);

				return new Response(
					JSON.stringify({ success: true }),
					{ headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			} catch (error) {
				return new Response(
					JSON.stringify({ error: 'Failed to handle event' }),
					{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}
		}

		// YouTube search
		if (url.pathname === '/api/youtube/search' && request.method === 'POST') {
			try {
				const body = await request.json() as { query: string; maxResults?: number };
				
				if (!body.query) {
					return new Response(
						JSON.stringify({ error: 'Query is required' }),
						{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				const maxResults = Math.min(body.maxResults || 10, 20);
				const apiUrl = new URL('https://www.googleapis.com/youtube/v3/search');
				apiUrl.searchParams.set('part', 'snippet');
				apiUrl.searchParams.set('q', body.query);
				apiUrl.searchParams.set('type', 'video');
				apiUrl.searchParams.set('maxResults', maxResults.toString());
				apiUrl.searchParams.set('videoDuration', 'any');
				apiUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

				const response = await fetch(apiUrl.toString());
				const data = await response.json() as any;

				if (!response.ok) {
					throw new Error('YouTube API error');
				}

				const videoIds = data.items.map((item: any) => item.id.videoId).join(',');
				const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
				detailsUrl.searchParams.set('part', 'contentDetails,snippet');
				detailsUrl.searchParams.set('id', videoIds);
				detailsUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

				const detailsResponse = await fetch(detailsUrl.toString());
				const detailsData = await detailsResponse.json() as any;

				const results = detailsData.items.map((item: any) => ({
					videoId: item.id,
					title: item.snippet.title,
					thumbnail: item.snippet.thumbnails.medium.url,
					duration: parseDuration(item.contentDetails.duration),
					channelTitle: item.snippet.channelTitle,
				}));

				return new Response(JSON.stringify({ results }), {
					headers: { ...corsHeaders, 'Content-Type': 'application/json' },
				});
			} catch (error) {
				return new Response(
					JSON.stringify({ error: 'YouTube search failed' }),
					{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}
		}

		// YouTube metadata
		if (url.pathname === '/api/youtube/metadata' && request.method === 'POST') {
			try {
				const body = await request.json() as { videoId?: string; playlistId?: string };

				if (body.videoId) {
					const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
					detailsUrl.searchParams.set('part', 'contentDetails,snippet');
					detailsUrl.searchParams.set('id', body.videoId);
					detailsUrl.searchParams.set('key', env.YOUTUBE_API_KEY);

					const response = await fetch(detailsUrl.toString());
					const data = await response.json() as any;

					if (!data.items || data.items.length === 0) {
						throw new Error('Video not found');
					}

					const item = data.items[0];
					return new Response(
						JSON.stringify({
							videoId: item.id,
							title: item.snippet.title,
							thumbnail: item.snippet.thumbnails.medium.url,
							duration: parseDuration(item.contentDetails.duration),
						}),
						{ headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
					);
				}

				return new Response(
					JSON.stringify({ error: 'videoId or playlistId required' }),
					{ status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			} catch (error) {
				return new Response(
					JSON.stringify({ error: 'Failed to fetch metadata' }),
					{ status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
				);
			}
		}

		return new Response('Not found', { status: 404, headers: corsHeaders });
	},
};

function isValidRoomName(name: string): boolean {
	return /^[a-z0-9-]{3,32}$/i.test(name);
}

function generateRoomId(roomName: string): string {
	const random = Math.random().toString(36).substring(2, 8);
	return `${roomName}-${random}`;
}

function parseDuration(duration: string): number {
	const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return 0;
	const hours = parseInt(match[1] || '0');
	const minutes = parseInt(match[2] || '0');
	const seconds = parseInt(match[3] || '0');
	return hours * 3600 + minutes * 60 + seconds;
}

function handleRoomEvent(room: any, event: any) {
	switch (event.type) {
		case 'JOIN':
		// Check if user already exists
		const existingUserIndex = room.users.findIndex((u: any) => u.userId === event.payload.userId);
		if (existingUserIndex !== -1) {
			// Update existing user
			room.users[existingUserIndex] = {
				...room.users[existingUserIndex],
				username: event.payload.username,
				emoji: event.payload.emoji,
			};
		} else {
			// Add new user
			const isFirstUser = room.users.length === 0;
			const user = {
				userId: event.payload.userId,
				username: event.payload.username,
				emoji: event.payload.emoji,
				isAdmin: isFirstUser,
			};
			if (isFirstUser) {
				room.adminId = user.userId;
			}
			room.users.push(user);
		}
		break;

		case 'ADD_SONG':
			room.queue.push({
				...event.payload,
				addedBy: event.payload.userId,
				addedAt: Date.now(),
			});
			// Auto-play first song
			if (!room.currentTrack && room.queue.length === 1) {
				room.currentTrack = room.queue[0];
				room.isPlaying = true;
				room.startTimestamp = Date.now();
			}
			break;

		case 'PLAY_NOW':
			const newSong = {
				...event.payload,
				addedBy: event.payload.userId,
				addedAt: Date.now(),
			};
			// Insert at beginning of queue
			room.queue.unshift(newSong);
			// Make it current track
			room.currentTrack = newSong;
			room.isPlaying = true;
			room.startTimestamp = Date.now();
			break;

		case 'PLAY':
			room.isPlaying = true;
			room.startTimestamp = event.payload.timestamp;
			break;

		case 'PAUSE':
			room.isPlaying = false;
			break;

		case 'SEEK':
			room.startTimestamp = event.payload.timestamp;
			break;

		case 'SKIP':
			room.queue.shift();
			room.currentTrack = room.queue[0] || null;
			if (room.currentTrack) {
				room.isPlaying = true;
				room.startTimestamp = Date.now();
			}
			break;

		case 'REMOVE_SONG':
			room.queue = room.queue.filter((song: any) => song.videoId !== event.payload.videoId);
			break;

		case 'CLEAR_QUEUE':
			room.queue = room.currentTrack ? [room.currentTrack] : [];
			break;

		case 'PROMOTE_ADMIN':
			const userToPromote = room.users.find((u: any) => u.userId === event.payload.userId);
			if (userToPromote) {
				userToPromote.isAdmin = true;
			}
			break;

		case 'CHANGE_USERNAME':
			const userToUpdate = room.users.find((u: any) => u.userId === event.payload.userId);
			if (userToUpdate) {
				userToUpdate.username = event.payload.username;
				if (event.payload.emoji) {
					userToUpdate.emoji = event.payload.emoji;
				}
			}
			break;

		case 'CHANGE_THEME':
			room.theme = event.payload.theme;
			break;

		case 'CHAT':
			room.chatHistory.push({
				userId: event.payload.userId,
				username: event.payload.username,
				emoji: event.payload.emoji,
				message: event.payload.message,
				timestamp: Date.now(),
			});
			break;
	}
}
