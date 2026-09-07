import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const port = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`🚀 WidgetFlow API Server running at http://localhost:${port}`);
});
