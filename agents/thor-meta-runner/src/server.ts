import express from 'express';
import cors from 'cors';
import { chatRoutes } from './routes/chat.js';
import { PORT } from './config.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/', chatRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err instanceof Error ? err.message : String(err)
  });
});

app.listen(PORT, () => {
  console.log(`🏃 Thor Meta-Runner running at http://localhost:${PORT}`);
  console.log('POST /chat - Route health queries across domains');
  console.log('GET /health - Health check');
});
