import type { AnaliseTriade, DimensaoCross, NivelCompat } from '../types';
import { DIMENSOES_TRIADE, NIVEL_NUM, ROTULO_TRIADE, forcasDaTriade } from '../lib/complementaridade';

// Radar das 3 dimensões da metodologia — Objetivos · Ativos · Consumidores.
// Duas áreas sobrepostas: o que o CLIENTE tem (cinza) × o que o PARCEIRO
// oferece (dourado). Onde o parceiro supera o cliente, a parceria preenche uma
// lacuna (eixo destacado). As forças vêm da análise item a item (vereditos).

const OURO = '#B98E4A';
const OURO_ESCURO = '#8A6832';
const GRAFITE = '#5B5B63';

const CENTRO = 130;
const RAIO = 88;
const N = 3;

function ponto(i: number, raioRel: number): [number, number] {
  const ang = (Math.PI * 2 * i) / N - Math.PI / 2; // topo primeiro
  return [CENTRO + Math.cos(ang) * RAIO * raioRel, CENTRO + Math.sin(ang) * RAIO * raioRel];
}

function poligono(valores: Record<DimensaoCross, NivelCompat>): string {
  return DIMENSOES_TRIADE.map((dim, i) => ponto(i, NIVEL_NUM[valores[dim]] / 3).join(',')).join(' ');
}

export function RadarTriade({ analise }: { analise: AnaliseTriade }) {
  const { cliente, parceiro } = forcasDaTriade(analise);
  const lacunas = DIMENSOES_TRIADE.map((dim) => NIVEL_NUM[parceiro[dim]] > NIVEL_NUM[cliente[dim]]);
  const totalLacunas = lacunas.filter(Boolean).length;

  return (
    <div>
      <svg
        viewBox="0 0 260 260"
        className="mx-auto w-full max-w-[240px]"
        role="img"
        aria-label={`Radar das 3 dimensões: ${totalLacunas} em que o parceiro preenche uma lacuna do cliente`}
      >
        {/* grade */}
        {[1, 2 / 3, 1 / 3].map((r, idx) => (
          <polygon
            key={idx}
            points={DIMENSOES_TRIADE.map((_, i) => ponto(i, r).join(',')).join(' ')}
            fill="none"
            stroke="#EDEDEF"
            strokeWidth="1"
          />
        ))}
        {DIMENSOES_TRIADE.map((_, i) => {
          const [x, y] = ponto(i, 1);
          return <line key={i} x1={CENTRO} y1={CENTRO} x2={x} y2={y} stroke="#EDEDEF" strokeWidth="1" />;
        })}

        {/* cliente — cinza tracejado */}
        <polygon
          points={poligono(cliente)}
          fill={GRAFITE}
          fillOpacity="0.08"
          stroke={GRAFITE}
          strokeWidth="1.5"
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />
        {/* parceiro — dourado */}
        <polygon
          points={poligono(parceiro)}
          fill={OURO}
          fillOpacity="0.18"
          stroke={OURO}
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* vértices do parceiro; realça lacunas */}
        {DIMENSOES_TRIADE.map((dim, i) => {
          const [x, y] = ponto(i, NIVEL_NUM[parceiro[dim]] / 3);
          const preenche = lacunas[i];
          return (
            <circle
              key={dim}
              cx={x}
              cy={y}
              r={preenche ? 4.5 : 3.5}
              fill={preenche ? OURO_ESCURO : OURO}
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          );
        })}

        {/* rótulos */}
        {DIMENSOES_TRIADE.map((dim, i) => {
          const [x, y] = ponto(i, 1.24);
          const preenche = lacunas[i];
          return (
            <text
              key={dim}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="'Space Mono', monospace"
              fontSize="10"
              fontWeight={preenche ? 700 : 400}
              letterSpacing="0.04em"
              fill={preenche ? OURO_ESCURO : GRAFITE}
            >
              {ROTULO_TRIADE[dim]}
            </text>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.08em] text-stone">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full border border-dashed border-graphite bg-graphite/10" />
          Cliente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-accent/30 ring-1 ring-accent" />
          Parceiro
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-deep" />
          Lacuna
        </span>
      </div>
    </div>
  );
}
