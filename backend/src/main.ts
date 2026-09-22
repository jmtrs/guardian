import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { trustedOrigins } from './config/origins';
import { assertSecretKeyConfigured } from './devices/secret-crypto';

async function bootstrap() {
  const isProd = process.env.NODE_ENV === 'production';
  // Fail-closed: sin master key de cifrado de secretos no se arranca en prod.
  assertSecretKeyConfigured();
  // rawBody: necesario para verificar la firma HMAC del dispositivo sobre
  // los bytes exactos del envelope (ver IngestController).
  // Logger acotado en produccion: sin debug/verbose, para no volcar cuerpos de
  // peticion ni detalle sensible; error/warn/log bastan para operar.
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: isProd ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // CORS restringido a origenes de confianza (nunca abierto). La app envia la
  // cookie de sesion, asi que credentials debe ir activo.
  app.enableCors({ origin: trustedOrigins(), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Guardian API')
      .setDescription('Vigilante autonomo para vehiculo 12V')
      .setVersion('0.1')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap();