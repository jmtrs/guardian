import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';

import { BetterAuthGuard } from '../auth/auth.guard';
import { GeocodeService, type ReverseGeocode } from './geocode.service';

/**
 * Proxy de reverse-geocode. Autenticado: solo un dueño con sesion consulta, no
 * un cliente anonimo, y el rate-limit/cache viven en el servicio. La app deja
 * de hablar con Nominatim directamente.
 */
@Controller('v1/geocode')
@UseGuards(BetterAuthGuard)
export class GeocodeController {
  constructor(private readonly geocode: GeocodeService) {}

  @Get('reverse')
  reverse(@Query('lat') latRaw?: string, @Query('lon') lonRaw?: string): Promise<ReverseGeocode> {
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    // Validacion estricta como el resto del dominio: fail-closed sobre basura.
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new BadRequestException('Invalid coordinates');
    }
    return this.geocode.reverse(lat, lon);
  }
}
