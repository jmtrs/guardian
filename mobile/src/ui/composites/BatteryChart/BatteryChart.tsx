import React, { useEffect, useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

import type { BatteryBucket, BatteryPoint } from '@/api/devices';
import { useUITheme } from '@/ui/theme';

// Grafica de energia con SVG: linea Bezier del promedio + area con degradado,
// grid, ejes, trazo animado al entrar y crosshair tactil con tooltip del valor.
// Serie CONTINUA con nulls -> se corta en los huecos (offline), varios subpaths.

const CHART_H = 200;
const PAD_L = 30; // etiquetas eje Y (dentro del SVG)
const PAD_R = 8;
const PAD_T = 8;
const PAD_B = 16; // etiquetas eje X (dentro del SVG)
const Y_TICKS = 4;

const AnimatedPath = Animated.createAnimatedComponent(Path);

type XY = { x: number; y: number; i: number };

type BatteryChartProps = {
  points: BatteryPoint[];
  bucket: BatteryBucket;
};

function formatBucketLabel(iso: string, bucket: BatteryBucket): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (bucket === 'hour') {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    }).format(d);
  }
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

// Catmull-Rom -> cubic Bezier: curva suave que pasa por todos los puntos.
function smoothLine(pts: XY[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

function polyLength(pts: XY[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

export function BatteryChart({ points, bucket }: BatteryChartProps) {
  const theme = useUITheme();
  const { semantic, fontFamily } = theme;
  const accent = semantic.accent.warning;
  const [w, setW] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // Dominio Y con margen para que min/max no toquen los bordes.
  const { yMin, yMax } = useMemo(() => {
    const values: number[] = [];
    for (const p of points) {
      if (p.vehicleMvMin != null) values.push(p.vehicleMvMin);
      if (p.vehicleMvMax != null) values.push(p.vehicleMvMax);
      if (p.vehicleMvAvg != null) values.push(p.vehicleMvAvg);
    }
    if (values.length === 0) return { yMin: 0, yMax: 1 };
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.12 || 200;
    return { yMin: lo - pad, yMax: hi + pad };
  }, [points]);

  const plotW = Math.max(w - PAD_L - PAD_R, 0);
  const plotH = CHART_H - PAD_T - PAD_B;
  const span = yMax - yMin || 1;
  const n = points.length;

  const xOf = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (mv: number) => PAD_T + (1 - (mv - yMin) / span) * plotH;
  const baseline = PAD_T + plotH;

  // Runs de puntos consecutivos con avg no nulo (rompe en los huecos).
  const runs = useMemo(() => {
    const out: XY[][] = [];
    let cur: XY[] = [];
    points.forEach((p, i) => {
      if (p.vehicleMvAvg == null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else {
        cur.push({ x: xOf(i), y: yOf(p.vehicleMvAvg), i });
      }
    });
    if (cur.length) out.push(cur);
    return out;
  }, [points, w, yMin, yMax]);

  const lineD = useMemo(() => runs.map(smoothLine).join(' '), [runs]);
  const areaD = useMemo(
    () =>
      runs
        .filter((r) => r.length > 1)
        .map(
          (r) =>
            `${smoothLine(r)} L ${r[r.length - 1].x} ${baseline} L ${r[0].x} ${baseline} Z`,
        )
        .join(' '),
    [runs, baseline],
  );

  // Longitud del trazo para la animacion. El path es Bezier (mas largo que la
  // polilinea) -> sobreestimo para que strokeDasharray cubra hasta el ultimo
  // punto (si no, el dash se queda corto y la linea aparece cortada al final).
  const totalLen = useMemo(
    () => (runs.reduce((s, r) => s + polyLength(r), 0) || 1) * 1.5 + 80,
    [runs],
  );

  const dots = useMemo(() => runs.flat(), [runs]);

  // Trazo animado al entrar / al cambiar de granularidad.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 750 });
  }, [lineD, progress]);

  const animatedLineProps = useAnimatedProps(() => ({
    strokeDashoffset: totalLen * (1 - progress.value),
  }));

  // Punto no nulo mas cercano al toque.
  const pickNearest = (px: number) => {
    if (dots.length === 0) return;
    let best = dots[0];
    let bestDx = Math.abs(px - best.x);
    for (const d of dots) {
      const dx = Math.abs(px - d.x);
      if (dx < bestDx) {
        bestDx = dx;
        best = d;
      }
    }
    setActive(best.i);
  };

  const pan = Gesture.Pan()
    .onBegin((e) => runOnJS(pickNearest)(e.x))
    .onUpdate((e) => runOnJS(pickNearest)(e.x));
  const tap = Gesture.Tap().onEnd((e) => runOnJS(pickNearest)(e.x));
  const gesture = Gesture.Race(pan, tap);

  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, k) => yMin + (span * k) / Y_TICKS);
  const asVolts = (mv: number) => `${(mv / 1000).toFixed(1)}`;

  const activePt = active != null ? points[active] : null;
  const activeX = active != null ? xOf(active) : 0;
  const activeY = activePt?.vehicleMvAvg != null ? yOf(activePt.vehicleMvAvg) : 0;
  // Tooltip: clamp horizontal para no salirse del contenedor.
  const TOOLTIP_W = 118;
  const tipLeft = Math.min(Math.max(activeX - TOOLTIP_W / 2, 4), Math.max(w - TOOLTIP_W - 4, 4));

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  return (
    <View onLayout={onLayout} style={{ position: 'relative' }}>
      <GestureDetector gesture={gesture}>
        <Svg width={w} height={CHART_H}>
          <Defs>
            <LinearGradient id="batteryArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity={0.28} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {/* Grid + etiquetas Y (alineadas exactas a cada linea) */}
          {yTicks.map((mv, k) => {
            const y = yOf(mv);
            return (
              <G key={k}>
                <Line
                  x1={PAD_L}
                  y1={y}
                  x2={w - PAD_R}
                  y2={y}
                  stroke={semantic.border.subtle}
                  strokeWidth={1}
                  opacity={0.5}
                />
                <SvgText
                  x={PAD_L - 4}
                  y={y + 3}
                  fontSize={9}
                  fill={semantic.fg.muted}
                  textAnchor="end"
                  fontFamily={fontFamily.ui.regular}
                >
                  {asVolts(mv)}
                </SvgText>
              </G>
            );
          })}

          {/* Area con degradado */}
          {areaD ? <Path d={areaD} fill="url(#batteryArea)" /> : null}

          {/* Linea animada */}
          {lineD ? (
            <AnimatedPath
              d={lineD}
              stroke={accent}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={totalLen}
              animatedProps={animatedLineProps}
            />
          ) : null}

          {/* Crosshair + marca del punto activo (solo al tocar) */}
          {activePt?.vehicleMvAvg != null ? (
            <>
              <Line
                x1={activeX}
                y1={PAD_T}
                x2={activeX}
                y2={baseline}
                stroke={accent}
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.6}
              />
              <Circle
                cx={activeX}
                cy={activeY}
                r={4.5}
                fill={semantic.bg.canvas}
                stroke={accent}
                strokeWidth={2.5}
              />
            </>
          ) : null}

          {/* Etiquetas eje X: primero / medio / ultimo, ancladas a su x exacta */}
          {n > 0
            ? [0, Math.floor((n - 1) / 2), n - 1]
                .filter((v, idx, arr) => arr.indexOf(v) === idx)
                .map((i, idx, arr) => (
                  <SvgText
                    key={i}
                    x={xOf(i)}
                    y={CHART_H - 4}
                    fontSize={9}
                    fill={semantic.fg.muted}
                    textAnchor={idx === 0 ? 'start' : idx === arr.length - 1 ? 'end' : 'middle'}
                    fontFamily={fontFamily.ui.regular}
                  >
                    {formatBucketLabel(points[i].bucketStart, bucket)}
                  </SvgText>
                ))
            : null}
        </Svg>
      </GestureDetector>

      {/* Tooltip del punto activo */}
      {activePt && activePt.vehicleMvAvg != null ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: tipLeft,
            top: Math.max(activeY - 62, 2),
            width: TOOLTIP_W,
            borderWidth: 1,
            borderColor: semantic.border.metal,
            backgroundColor: semantic.bg.hudPanel,
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        >
          <Text
            style={{
              color: semantic.fg.muted,
              fontFamily: fontFamily.ui.regular,
              fontSize: 10,
              letterSpacing: 0.5,
            }}
          >
            {formatBucketLabel(activePt.bucketStart, bucket)}
          </Text>
          <Text
            style={{ color: semantic.fg.primary, fontFamily: fontFamily.ui.medium, fontSize: 15 }}
          >
            {`${(activePt.vehicleMvAvg / 1000).toFixed(2)} V`}
          </Text>
          {activePt.vehicleMvMin != null && activePt.vehicleMvMax != null ? (
            <Text
              style={{ color: semantic.fg.muted, fontFamily: fontFamily.ui.regular, fontSize: 10 }}
            >
              {`${(activePt.vehicleMvMin / 1000).toFixed(2)}–${(activePt.vehicleMvMax / 1000).toFixed(2)} · n=${activePt.samples}`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export { formatBucketLabel };

// Barra de nivel para un unico voltaje (card del dashboard sin histórico): situa
// el valor en el rango nominal de un sistema 12V. Siempre util, hasta con 1 lectura.
const GAUGE_MIN_MV = 11500;
const GAUGE_MAX_MV = 14500;

export function VoltageGauge({ mv }: { mv: number }) {
  const theme = useUITheme();
  const { semantic, fontFamily } = theme;
  const frac = Math.min(Math.max((mv - GAUGE_MIN_MV) / (GAUGE_MAX_MV - GAUGE_MIN_MV), 0), 1);
  const label = { color: semantic.fg.muted, fontFamily: fontFamily.ui.regular, fontSize: 10 };
  // Todo en una fila: min · barra · max.
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={label}>{(GAUGE_MIN_MV / 1000).toFixed(1)}</Text>
      <View
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          backgroundColor: semantic.border.subtle,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: 6,
            width: `${frac * 100}%`,
            backgroundColor: semantic.accent.warning,
            borderRadius: 3,
          }}
        />
      </View>
      <Text style={label}>{(GAUGE_MAX_MV / 1000).toFixed(1)}</Text>
    </View>
  );
}

// Sparkline compacta para la card del dashboard: linea Bezier del avg, sin ejes.
export function Sparkline({ points, height = 40 }: { points: BatteryPoint[]; height?: number }) {
  const theme = useUITheme();
  const accent = theme.semantic.accent.warning;
  const [w, setW] = useState(0);

  const avgs = points.map((p) => p.vehicleMvAvg);
  const values = avgs.filter((v): v is number => v != null);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const span = hi - lo || 1;
  const n = points.length;
  const pad = 3;
  const yOf = (mv: number) => pad + (1 - (mv - lo) / span) * (height - pad * 2);
  const xOf = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * w);

  const runs: XY[][] = [];
  let cur: XY[] = [];
  points.forEach((p, i) => {
    if (p.vehicleMvAvg == null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else {
      cur.push({ x: xOf(i), y: yOf(p.vehicleMvAvg), i });
    }
  });
  if (cur.length) runs.push(cur);
  const d = runs.map(smoothLine).join(' ');

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height, flex: 1 }}>
      {w > 0 && d ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="sparkArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={accent} stopOpacity={0.22} />
              <Stop offset="1" stopColor={accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {runs
            .filter((r) => r.length > 1)
            .map((r, idx) => (
              <Path
                key={`a${idx}`}
                d={`${smoothLine(r)} L ${r[r.length - 1].x} ${height} L ${r[0].x} ${height} Z`}
                fill="url(#sparkArea)"
              />
            ))}
          <Path d={d} stroke={accent} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      ) : null}
    </View>
  );
}
