import { NestFactory } from '@nestjs/core';
  import { ConfigService } from '@nestjs/config';
  import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
  import { ValidationPipe } from '@nestjs/common';
  import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';

  async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.use(json({ limit: '10mb'}));

    app.use(urlencoded({ extended: true, limit: '10mb'}));

    const allowedOrigins = [
      process.env.LOCALHOST,
      process.env.LOCALHOST2,
      process.env.FRONTEND,
      process.env.ECOMMERCE,
      'https://www.otamacarga.com',
      'https://www.tienda.otamacarga.com',
      'https://dutjnwzug3yqh.cloudfront.net',
      'https://d2ximrte4m9khf.cloudfront.net'
    ].filter(Boolean) as string[];

    app.enableCors({
      origin: allowedOrigins,
      methods: [
        'GET', 
        'PUT', 
        'POST', 
        'PATCH', 
        'DELETE', 
        'OPTIONS'
      ],
      allowedHeaders: [
        'Content-Type', 
        'Authorization'
      ],
      credentials: true,
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    const config = new DocumentBuilder()
      .setTitle('API InventiX')
      .setDescription(
        'API desarrollada para InventiX',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          in: 'header',
        },
        'JWT',
      )
      .build();

    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('swagger', app, documentFactory);

    const port = app.get(ConfigService);
    await app.listen(process.env.PORT ?? 3000);

    console.log(`URL: http://localhost:${port.get('PORT')}`);
  }
  bootstrap();