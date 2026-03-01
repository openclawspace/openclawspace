/**
 * OpenClawSpace Hub Service
 * WebSocket relay server for pairing Client and Browser via Token
 * Node.js version using 'ws' library
 */

import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import url from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = process.env.PORT || 8787;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the web build directory (for serving static files and SPA fallback)
const WEB_BUILD_DIR = path.resolve(__dirname, '../../ocs-hub-web/dist');

// Session storage: token -> { clientWs, browserWs }
const sessions = new Map<string, {
  clientWs?: WebSocket;
  browserWs?: WebSocket;
  pairedAt?: string;
}>();

// Message types
interface RelayMessage {
  type: string;
  payload?: any;
}

// Helper function to serve static files
function serveStaticFile(filePath: string, res: http.ServerResponse): boolean {
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
      };
      const contentType = contentTypes[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
      return true;
    }
  } catch (err) {
    console.error('Error serving static file:', err);
  }
  return false;
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url || '', true);

  // Health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'ocs-hub-service',
      version: '1.0.0',
      activeSessions: sessions.size
    }));
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Token, X-Client-Type'
    });
    res.end();
    return;
  }

  // Serve static files from the web build directory
  if (req.method === 'GET' && parsedUrl.pathname) {
    // Remove leading slash and default to index.html for root
    let filePath = parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname.slice(1);
    const fullPath = path.join(WEB_BUILD_DIR, filePath);

    // Try to serve the requested file
    if (serveStaticFile(fullPath, res)) {
      return;
    }

    // If file doesn't exist and it's not an API route, serve index.html (SPA fallback)
    // This handles React Router routes like /spaces/:spaceId/chat
    if (!parsedUrl.pathname.startsWith('/ws') && !parsedUrl.pathname.startsWith('/api')) {
      const indexPath = path.join(WEB_BUILD_DIR, 'index.html');
      if (serveStaticFile(indexPath, res)) {
        return;
      }
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
  const parsedUrl = url.parse(req.url || '', true);

  // Support both headers and query params
  const token = req.headers['x-token'] as string || parsedUrl.query.token as string;
  const clientType = req.headers['x-client-type'] as string || parsedUrl.query.clientType as string;

  if (!token || !clientType) {
    ws.close(1008, 'Missing token or clientType');
    return;
  }

  if (clientType !== 'client' && clientType !== 'browser') {
    ws.close(1008, 'Invalid clientType');
    return;
  }

  // Get or create session
  let session = sessions.get(token);
  if (!session) {
    session = {};
    sessions.set(token, session);
  }

  // Store WebSocket reference
  if (clientType === 'client') {
    // Close existing client connection if any
    if (session.clientWs && session.clientWs.readyState === WebSocket.OPEN) {
      session.clientWs.close(1000, 'New client connection');
    }
    session.clientWs = ws;
    console.log(`[${token}] Client connected`);
  } else {
    // Close existing browser connection if any
    if (session.browserWs && session.browserWs.readyState === WebSocket.OPEN) {
      session.browserWs.close(1000, 'New browser connection');
    }
    session.browserWs = ws;
    console.log(`[${token}] Browser connected`);

    // Notify browser that it's connected to hub
    sendToWs(ws, { type: 'connected', payload: { message: 'Connected to hub, waiting for client...' } });
  }

  // Check if both sides are connected
  if (session.clientWs?.readyState === WebSocket.OPEN &&
      session.browserWs?.readyState === WebSocket.OPEN) {
    session.pairedAt = new Date().toISOString();
    console.log(`[${token}] Paired!`);

    // Notify both sides
    sendToWs(session.clientWs, { type: 'paired', payload: { pairedAt: session.pairedAt } });
    sendToWs(session.browserWs, { type: 'paired', payload: { pairedAt: session.pairedAt } });
  }

  // Handle messages
  ws.on('message', (data: WebSocket.Data) => {
    try {
      const message: RelayMessage = JSON.parse(data.toString());
      handleMessage(token, clientType, message, session!);
    } catch (err) {
      console.error(`[${token}] Failed to parse message:`, err);
      sendToWs(ws, { type: 'error', payload: { error: 'Invalid JSON' } });
    }
  });

  // Handle close
  ws.on('close', () => {
    console.log(`[${token}] ${clientType} disconnected`);

    if (clientType === 'client') {
      session!.clientWs = undefined;
      // Notify browser
      if (session!.browserWs?.readyState === WebSocket.OPEN) {
        sendToWs(session!.browserWs, { type: 'client_disconnected' });
      }
    } else {
      session!.browserWs = undefined;
      // Notify client
      if (session!.clientWs?.readyState === WebSocket.OPEN) {
        sendToWs(session!.clientWs, { type: 'browser_disconnected' });
      }
    }

    // Clean up empty session
    if (!session!.clientWs && !session!.browserWs) {
      sessions.delete(token);
      console.log(`[${token}] Session cleaned up`);
    }
  });

  // Handle errors
  ws.on('error', (err: Error) => {
    console.error(`[${token}] WebSocket error:`, err);
  });
});

function handleMessage(
  token: string,
  fromType: string,
  message: RelayMessage,
  session: { clientWs?: WebSocket; browserWs?: WebSocket; pairedAt?: string }
): void {
  console.log(`[${token}] ${fromType} -> ${JSON.stringify(message)}`);

  // Determine target
  const targetWs = fromType === 'client' ? session.browserWs : session.clientWs;

  if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
    // Target not connected, send error back
    const sourceWs = fromType === 'client' ? session.clientWs : session.browserWs;
    if (sourceWs?.readyState === WebSocket.OPEN) {
      sendToWs(sourceWs, {
        type: 'error',
        payload: { error: `${fromType === 'client' ? 'Browser' : 'Client'} not connected` }
      });
    }
    return;
  }

  // Relay message with source info
  sendToWs(targetWs, {
    ...message,
    _source: fromType,
    _timestamp: new Date().toISOString()
  });
}

function sendToWs(ws: WebSocket, message: RelayMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch (err) {
    console.error('Failed to send message:', err);
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`🐾 OpenClawSpace Hub Service running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
