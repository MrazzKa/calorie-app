import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CorrelationIdInterceptor } from './common/interceptors/correlation.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1) Global prefix
  app.setGlobalPrefix('v1', {
    exclude: ['.well-known', '.well-known/(.*)'], // AASA/assetlinks remain at root
  });

  // 2) Global interceptors
  app.useGlobalInterceptors(new CorrelationIdInterceptor());

  // 3) CORS, Helmet
  app.enableCors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-corr-id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.use(helmet({ crossOriginResourcePolicy: false }));

  // 4) Swagger
  const config = new DocumentBuilder()
    .setTitle('CalorieCam API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`API http://localhost:${port}/v1/health | Swagger http://localhost:${port}/docs`);
}
bootstrap();
