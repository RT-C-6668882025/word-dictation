// Deploy helper (NOT part of upstream repo): bind the relay to 127.0.0.1 only.
// mcp/relay.mjs hardcodes 0.0.0.0 when run directly; importing createRelay avoids that.
import { createRelay } from './mcp/relay.mjs';
const origins = (process.env.ALLOWED_ORIGINS || 'https://localhost,http://localhost,https://rt-c-6668882025.github.io').split(',');
createRelay({ origins }).listen(18766, '127.0.0.1', () => console.log('relay listening on 127.0.0.1:18766'));
