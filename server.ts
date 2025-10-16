import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { logger } from './src/utils/logger';
import { errorHandler } from './src/middleware/errorHandler';
import { notFoundHandler } from './src/middleware/notFoundHandler';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware setup
app.use(helmet());
app.use(compression());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15분
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 최대 100 요청
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'AI Agent Solana Backend',
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/models', require('./src/routes/models').default || require('./src/routes/models'));
app.use('/api/subscriptions', require('./src/routes/subscriptions').default || require('./src/routes/subscriptions'));
app.use('/api/transactions', require('./src/routes/transactions').default || require('./src/routes/transactions'));
app.use('/api/blockchain', require('./src/routes/blockchain').default || require('./src/routes/blockchain'));
app.use('/api/signature-royalty', require('./src/routes/signatureRoyalty').default || require('./src/routes/signatureRoyalty'));

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 AI Agent Solana Backend Server running on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);
  logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;