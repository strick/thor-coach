/**
 * Health Agent Server
 * Uses shared server factory from @thor/agent-core
 */

import 'dotenv/config';
import { startAgentServer } from '@thor/agent-core';
import { HealthAgent } from './agent.js';

const PORT = parseInt(process.env.PORT || '3006', 10);

const agent = new HealthAgent();

startAgentServer(agent, {
  port: PORT,
  serviceName: 'health-agent',
  agentName: 'Health Agent'
});
