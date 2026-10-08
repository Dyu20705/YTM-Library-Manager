import * as path from 'node:path';
import * as fs from 'node:fs';
import { DatabaseConnection } from '../storage/connection.js';
import { SubprocessYtmGateway } from '../gateway/ytm_gateway.js';
import { LibraryApplication } from '../application/service.js';
import { createApplicationServer } from './http.js';

const root = process.cwd();
const authFilePath = process.env.YTM_AUTH_FILE;
const connection = new DatabaseConnection({
  path: process.env.YTM_DB_PATH ?? path.join(root, '.local/library.db'),
  schemaPath: path.join(root, 'src/storage/schema.sql')
});
const app = new LibraryApplication(connection, new SubprocessYtmGateway({
  authFilePath, pythonPath: process.env.YTM_PYTHON_PATH
}), Boolean(authFilePath && fs.existsSync(authFilePath)));
const server = createApplicationServer(app, path.join(root, 'dist'));
server.listen(Number(process.env.YTM_PORT ?? 5174), '127.0.0.1', () => {
  console.log('Local library service started (read-only remote access)');
});
function stop() {
  server.close(() => { connection.close(); process.exit(0); });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
