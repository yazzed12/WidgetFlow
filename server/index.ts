import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { db, initDatabase } from './db/database.js';
import { ensureSystemRoles, seedDatabase } from './db/seed.js';
import { demoUserMiddleware } from './middleware/demoUser.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/apiRouter.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize DB and Seed Data
initDatabase();
ensureSystemRoles();
const hasUsers = Number((db.prepare(`SELECT COUNT(*) as count FROM users`).get() as any)?.count || 0) > 0;
if (!hasUsers) seedDatabase();

// Attach Demo User Middleware
app.use('/api', demoUserMiddleware);

// Mount API Router
app.use('/api', apiRouter);

// Centralized Error Middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 WidgetFlow API Server running at http://localhost:${PORT}`);
});
