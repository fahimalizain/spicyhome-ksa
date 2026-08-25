import { INestApplication, RequestMethod } from '@nestjs/common';
import { join } from 'path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

export const API_PREFIX = 'api';

/** Call after createNestApplication() / NestFactory.create() and BEFORE init()/listen(). */
export function configureHttpApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  // SPA_DIST is read at call time, not at module import time, so tests can set
  // it before configureHttpApp runs. Static files take precedence; document
  // routes (/orders, /admin, ...) fall back to index.html; /api, /health and
  // /ws are passed through to Nest (first-match + next()).
  const spaDist = process.env.SPA_DIST;
  if (spaDist) {
    const expressApp = app.getHttpAdapter().getInstance() as express.Express;
    expressApp.use(express.static(spaDist));
    expressApp.get('*', (req: Request, res: Response, next: NextFunction) => {
      const { path: reqPath } = req;
      if (reqPath === '/health' || reqPath === '/ws' || reqPath.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(join(spaDist, 'index.html'));
    });
  }

  return app;
}
