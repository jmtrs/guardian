import { Injectable, Logger } from '@nestjs/common';

/**
 * Reverse-geocode como proxy de servidor. Antes la app llamaba a Nominatim por
 * cada fila del historial: rafaga que viola la politica de OSM (1 req/s global)
 * y filtra la ubicacion del vehiculo a un tercero desde cada movil. Aqui:
 *
 *  - Cache en memoria por coordenada redondeada (una direccion no cambia): la
 *    mayoria de consultas no salen a la red.
 *  - Rate-limit GLOBAL a >=1 req/s hacia Nominatim, encolado (serializado): por
 *    muchos clientes que pidan, el upstream ve como mucho 1 req/s.
 *  - User-Agent identificable, como exige la politica de uso de Nominatim.
 *
 * La coordenada exacta sigue siendo dato sensible: el backend es ahora el unico
 * que la manda fuera, no cada dispositivo del dueño.
 */

export type ReverseGeocode = {
  label: string; // calle + numero (o nombre del sitio)
  detail: string; // ciudad, pais — desambigua calles repetidas
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // una direccion no cambia en horas
// Politica Nominatim: <=1 req/s. Override solo para tests (no bajar en prod).
const MIN_UPSTREAM_GAP_MS = Number(process.env.GEOCODE_MIN_GAP_MS) || 1000;
const UPSTREAM = 'https://nominatim.openstreetmap.org/reverse';
// Identificable como exige la politica de uso de OSM/Nominatim.
const USER_AGENT = 'Guardian/0.6 (self-hosted vehicle anti-theft)';

type CacheEntry = { value: ReverseGeocode; at: number };

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private readonly cache = new Map<string, CacheEntry>();
  // Cadena de promesas: cada llamada upstream espera su turno y respeta el gap.
  private queue: Promise<unknown> = Promise.resolve();
  private lastUpstreamAt = 0;

  // Redondeo a 4 decimales (~11 m): agrupa lecturas casi identicas en una
  // entrada de cache y limita la precision que sale al upstream.
  private key(lat: number, lon: number): string {
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  async reverse(lat: number, lon: number): Promise<ReverseGeocode> {
    const key = this.key(lat, lon);
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.value;
    }
    const value = await this.enqueue(() => this.fetchUpstream(lat, lon));
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  // Serializa contra el upstream y garantiza el gap minimo entre llamadas
  // reales, sea cual sea el numero de clientes concurrentes.
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = MIN_UPSTREAM_GAP_MS - (Date.now() - this.lastUpstreamAt);
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      this.lastUpstreamAt = Date.now();
      return task();
    });
    // La cola nunca debe romperse por un fallo de una tarea previa.
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async fetchUpstream(lat: number, lon: number): Promise<ReverseGeocode> {
    const url = `${UPSTREAM}?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
    });
    if (!res.ok) {
      // No filtrar coordenadas al log: solo el estado del upstream.
      this.logger.warn(`Nominatim reverse failed: ${res.status}`);
      throw new Error(`geocode ${res.status}`);
    }
    const json = (await res.json()) as {
      name?: string;
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = json.address ?? {};
    const road = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? '';
    const num = a.house_number ? ` ${a.house_number}` : '';
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? a.state ?? '';
    const country = a.country ?? '';
    const label = road ? `${road}${num}` : json.name || city || '';
    const detail = [city, country].filter(Boolean).join(', ');
    return { label, detail: detail || json.display_name || '' };
  }
}
