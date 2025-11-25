/**
 * Thor Agent Server
 * Uses shared server factory from @thor/agent-core
 */

import 'dotenv/config';
import { startAgentServer } from '@thor/agent-core';
import { ThorAgent } from './agent.js';

const PORT = parseInt(process.env.PORT || '3002', 10);

const agent = new ThorAgent();

startAgentServer(agent, {
  port: PORT,
  serviceName: 'thor-agent',
  agentName: 'Thor Agent'
});
