#!/usr/bin/env node

/**
 * Test script for Thor MCP Server
 *
 * This script sends JSON-RPC messages to the MCP server via stdio
 * to test all available tools.
 *
 * Usage:
 *   node test-mcp.js [tool_name]
 *
 * Examples:
 *   node test-mcp.js                    # Interactive menu
 *   node test-mcp.js list_tools         # List all tools
 *   node test-mcp.js get_today          # Get today's exercises
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

const MCP_SERVER = './dist/index.js';

// Test scenarios
const tests = {
  list_tools: {
    name: 'List all available tools',
    messages: [
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 1
      },
      {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      }
    ]
  },

  get_today: {
    name: 'Get today\'s exercises',
    messages: [
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 1
      },
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_today_exercises',
          arguments: {}
        },
        id: 2
      }
    ]
  },

  log_workout: {
    name: 'Log a sample workout',
    messages: [
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 1
      },
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'log_workout',
          arguments: {
            text: 'floor press 4x12 @45, skullcrusher 3x10 @20'
          }
        },
        id: 2
      }
    ]
  },

  get_progress: {
    name: 'Get progress summary (last 30 days)',
    messages: [
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 1
      },
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_progress_summary',
          arguments: {
            from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            to: new Date().toISOString().split('T')[0]
          }
        },
        id: 2
      }
    ]
  },

  get_weekly_summaries: {
    name: 'Get weekly summaries',
    messages: [
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        },
        id: 1
      },
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_weekly_summaries',
          arguments: {
            limit: 5
          }
        },
        id: 2
      }
    ]
  }
};

async function runTest(testName) {
  const test = tests[testName];
  if (!test) {
    console.error(`Test '${testName}' not found`);
    return;
  }

  console.log(`\n🧪 Running: ${test.name}\n`);

  const mcp = spawn('node', [MCP_SERVER], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, THOR_API_URL: 'http://localhost:3000' }
  });

  let output = '';

  mcp.stdout.on('data', (data) => {
    output += data.toString();
  });

  mcp.on('close', (code) => {
    console.log('\n📤 Response:\n');

    // Parse and pretty-print each JSON-RPC response
    const lines = output.trim().split('\n');
    lines.forEach((line, i) => {
      try {
        const json = JSON.parse(line);
        console.log(`Response ${i + 1}:`);
        console.log(JSON.stringify(json, null, 2));
        console.log('');
      } catch (e) {
        console.log('Raw output:', line);
      }
    });
  });

  // Send messages sequentially
  for (const msg of test.messages) {
    console.log('📥 Request:');
    console.log(JSON.stringify(msg, null, 2));
    console.log('');
    mcp.stdin.write(JSON.stringify(msg) + '\n');

    // Wait a bit between messages
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  mcp.stdin.end();

  // Wait for process to finish
  await new Promise(resolve => mcp.on('close', resolve));
}

function showMenu() {
  console.log('\n🏋️  Thor MCP Server Test Suite\n');
  console.log('Available tests:');
  console.log('');

  Object.entries(tests).forEach(([key, test]) => {
    console.log(`  ${key.padEnd(20)} - ${test.name}`);
  });

  console.log('\nUsage:');
  console.log('  node test-mcp.js [test_name]');
  console.log('\nExample:');
  console.log('  node test-mcp.js list_tools');
  console.log('');
}

async function interactive() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  while (true) {
    showMenu();

    const testName = await new Promise(resolve => {
      rl.question('Enter test name (or "quit"): ', resolve);
    });

    if (testName === 'quit' || testName === 'exit' || testName === 'q') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      break;
    }

    if (tests[testName]) {
      await runTest(testName);
    } else if (testName.trim() === '') {
      continue;
    } else {
      console.error(`\n❌ Test '${testName}' not found\n`);
    }
  }
}

// Main
const testName = process.argv[2];

if (testName) {
  if (tests[testName]) {
    runTest(testName).then(() => process.exit(0));
  } else {
    console.error(`\n❌ Test '${testName}' not found\n`);
    showMenu();
    process.exit(1);
  }
} else {
  interactive();
}
